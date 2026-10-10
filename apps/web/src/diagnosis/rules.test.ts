// Table-driven tests for every Module E row, plus card selection and messages.
import { describe, expect, it } from "vitest";
import type { FaceSummary, L1Code, SyllableAnalysis, ToneIssueId, VowelClass } from "@shared/contracts/types";
import { diagnose } from ".";
import { PROMPTS } from "../content/prompts";
import { fixtureAnalysis } from "../fixtures";
import { fill } from "./messages";
import { lipsFrom } from "./rules";

const nv = PROMPTS.find((p) => p.id === "nv")!;
const base = fixtureAnalysis("nv", "correct");
const ROUND = { rounded: 0.8, partly: 0.45, spread: 0.1 } as const;

function syllable(target: VowelClass, heardAs: VowelClass, opts: { glide?: boolean; confidence?: number; issues?: ToneIssueId[]; sandhiNote?: string } = {}): SyllableAnalysis {
  const s = base.syllables[0];
  return {
    ...s,
    target: { ...s.target, vowel: target, ...(opts.sandhiNote && { sandhiNote: opts.sandhiNote }) },
    tone: { ...s.tone, issues: opts.issues ?? [] },
    vowel: { ...s.vowel!, target, heardAs, glide: opts.glide ?? false, confidence: opts.confidence ?? 0.8 },
  };
}
const face = (roundness: number, coverage = 0.95): FaceSummary[] => [{ syllableIndex: 0, roundness, jawOpen: 0.1, coverage }];
const run = (s: SyllableAnalysis, f: FaceSummary[], l1: L1Code = "other") => diagnose(nv, { ...base, syllables: [s] }, f, l1);
const ids = (s: SyllableAnalysis, f: FaceSummary[]) => run(s, f).map((c) => [c.diagnosis.issueId, c.diagnosis.severity]);

describe("vowel rules (SPEC.md Module E)", () => {
  it.each([
    ["y", "y", "spread", true, "y_glide", 3],
    ["y", "i", "spread", false, "y_lips_not_rounded", 3],
    ["y", "i", "partly", false, "y_lips_not_rounded", 3],
    ["y", "u", "rounded", false, "y_tongue_back", 3],
    ["y", "u", "spread", false, "y_both", 3],
    ["y", "u", "partly", false, "y_both", 3],
    ["y", "y", "spread", false, "y_ok_lips_hint", 1],
    ["u", "i", "partly", false, "u_fronted", 3],
    ["u", "y", "spread", false, "u_fronted", 3],
    ["i", "y", "rounded", false, "i_rounded", 3],
  ] as const)("target %s, heard %s, lips %s, glide %s → %s", (target, heard, lips, glide, issue, severity) => {
    expect(ids(syllable(target, heard, { glide }), face(ROUND[lips]))).toEqual([[issue, severity]]);
  });

  it.each([
    ["y", "y", "rounded"], ["y", "y", "partly"], ["u", "u", "rounded"], ["i", "i", "spread"],
  ] as const)("target %s heard %s with lips %s passes", (target, heard, lips) => {
    expect(run(syllable(target, heard), face(ROUND[lips]))).toEqual([]);
  });

  it("without a face, the audio decides and the message names both causes", () => {
    const [card] = run(syllable("y", "i"), face(0.1, 0.2));
    expect(card.diagnosis.messageKey).toBe("y_lips_not_rounded_audio");
    expect(card.instruction).toContain("keep your tongue forward");
    expect(ids(syllable("y", "u"), [])).toEqual([["y_both", 3]]);
    expect(run(syllable("y", "y"), [])).toEqual([]);
  });

  it("low confidence words the fix cautiously", () => {
    expect(run(syllable("y", "i", { confidence: 0.2 }), face(0.1))[0].instruction).toMatch(/^It's a close call/);
  });

  it("attaches the L1 note and the target visual", () => {
    const [card] = run(syllable("y", "u"), face(0.8), "en");
    expect(card.l1Note).toContain("English has no ü");
    expect(card.targetVisual).toBe("rounded");
    expect(card.diagnosis.articulator).toBe("tongue");
  });
});

describe("tone rules and card selection", () => {
  const tone = (issues: ToneIssueId[], sandhiNote?: string) => ids(syllable("y", "y", { issues, sandhiNote }), face(0.8));

  it("a specific detector beats wrong_tone, unless the syllable has a sandhi note", () => {
    expect(tone(["t2_late", "wrong_tone"])).toEqual([["t2_late", 2]]);
    expect(tone(["t2_late", "wrong_tone"], "3+3 → 2+3")).toEqual([["wrong_tone", 3]]);
    expect(tone(["wrong_tone"])).toEqual([["wrong_tone", 3]]);
    expect(tone(["t3_full_in_context"])).toEqual([["t3_full_in_context", 1]]);
    expect(tone(["no_pitch", "t1_low"])).toEqual([["no_pitch", 3]]);
  });

  it("sandhi wrong_tone explains the rule", () => {
    const [card] = run(syllable("y", "y", { issues: ["wrong_tone"], sandhiNote: "3+3 → 2+3" }), face(0.8));
    expect(card.instruction).toContain("(3+3 → 2+3)");
    expect(card.diagnosis.messageKey).toBe("wrong_tone_sandhi");
  });

  it("keeps one card per syllable unless tone and vowel are both severity 3", () => {
    expect(ids(syllable("y", "i", { issues: ["t3_not_low"] }), face(0.1))).toEqual([["y_lips_not_rounded", 3]]);
    expect(ids(syllable("y", "i", { issues: ["no_pitch"] }), face(0.1))).toEqual([["y_lips_not_rounded", 3], ["no_pitch", 3]]);
  });

  it("returns at most two cards, highest severity first, ties to the earlier syllable", () => {
    const ma4 = fixtureAnalysis("ma4", "correct");
    const issues: ToneIssueId[][] = [["t1_low"], ["t2_shallow"], ["wrong_tone"], ["t4_shallow"]];
    const audio = { ...ma4, syllables: ma4.syllables.map((s, i) => ({ ...s, tone: { ...s.tone, issues: issues[i] } })) };
    const cards = diagnose(PROMPTS[0], audio, []);
    expect(cards.map((c) => [c.diagnosis.syllableIndex, c.diagnosis.issueId])).toEqual([[2, "wrong_tone"], [0, "t1_low"]]);
  });
});

describe("helpers", () => {
  it("lipsFrom uses the 0.3 / 0.6 cut-offs and ignores a missing face", () => {
    expect([0.6, 0.45, 0.3, 0.1].map((r) => lipsFrom(r, 1))).toEqual(["rounded", "partly", "spread", "spread"]);
    expect(lipsFrom(0.8, 0.4)).toBeUndefined();
    expect(lipsFrom(undefined)).toBeUndefined();
  });

  it("fill replaces known placeholders and leaves unknown ones", () => {
    expect(fill("tone {tone} slid {dir} {x}", { tone: 1, dir: "up" })).toBe("tone 1 slid up {x}");
  });
});
