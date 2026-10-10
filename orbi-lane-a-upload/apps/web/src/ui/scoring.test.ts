import { describe, expect, it } from "vitest";
import type { FeedbackItem } from "@shared/contracts/types";
import { PROMPTS } from "../content/prompts";
import { fixtureAnalysis } from "../fixtures";
import { hanziOf, lightsFor, nextPromptId, summarize, toneMarks } from "./scoring";

const prompt = (id: string) => PROMPTS.find((p) => p.id === id)!;
const card = (syllableIndex: number, articulator: FeedbackItem["diagnosis"]["articulator"], severity: 1 | 2 | 3, title = "Fix"): FeedbackItem => ({
  diagnosis: { syllableIndex, issueId: "x", articulator, severity, evidence: {}, messageKey: "x" },
  title, instruction: "Do this",
});

describe("summarize (match ring)", () => {
  const ma4 = fixtureAnalysis("ma4", "correct");
  const mean = Math.round(ma4.syllables.reduce((a, s) => a + s.tone.score, 0) / ma4.syllables.length);

  it("is green with no cards and a high match", () => {
    expect(mean).toBeGreaterThanOrEqual(80);
    expect(summarize(ma4, [])).toEqual({ match: mean, passed: true, ring: "green" });
  });

  it("is amber with a severity-2 card, and doesn't pass", () => {
    expect(summarize(ma4, [card(1, "pitch", 2)])).toEqual({ match: mean, passed: false, ring: "amber" });
  });

  it("is red with a severity-3 card, capping that syllable at 40", () => {
    const nv = fixtureAnalysis("nv", "nee");
    expect(nv.syllables[0].tone.score).toBeGreaterThan(40);
    expect(summarize(nv, [card(0, "lips", 3)])).toEqual({ match: 40, passed: false, ring: "red" });
  });

  it("passes with only a tip, but stays amber under 80", () => {
    const low = { ...ma4, syllables: ma4.syllables.map((s) => ({ ...s, tone: { ...s.tone, score: 70 } })) };
    expect(summarize(low, [card(0, "pitch", 1)])).toEqual({ match: 70, passed: true, ring: "amber" });
  });

  it("scores an empty analysis as 0", () => {
    expect(summarize({ ...ma4, syllables: [] }, []).match).toBe(0);
  });
});

describe("lightsFor", () => {
  it("greys Lips and Tongue on tone-only words", () => {
    expect(lightsFor(prompt("nihao"), []).map((l) => l.status)).toEqual(["good", "off", "off"]);
  });

  it("shows the most severe card's title on its light, with jaw on Lips", () => {
    const lights = lightsFor(prompt("nv"), [card(0, "jaw", 1, "Open a bit"), card(0, "tongue", 3, "Tongue forward"), card(0, "lips", 3, "Round your lips")]);
    expect(lights).toEqual([
      { part: "Pitch", status: "good", text: "Good" },
      { part: "Lips", status: "fix", text: "Round your lips" },
      { part: "Tongue", status: "fix", text: "Tongue forward" },
    ]);
  });
});

describe("toneMarks", () => {
  it.each([
    ["nv3", "nǚ"], ["hao3", "hǎo"], ["ni3", "nǐ"], ["guo2", "guó"], ["zhong1", "zhōng"], ["shi4", "shì"],
    ["lou2", "lóu"], ["liu4", "liù"], ["gui4", "guì"], ["lve4", "lüè"], ["qu4", "qù"], ["ma5", "ma"],
  ])("%s → %s", (input, out) => expect(toneMarks(input)).toBe(out));
});

describe("word helpers", () => {
  it("splits hanzi into one character per syllable", () => {
    for (const p of PROMPTS) expect(hanziOf(p)).toHaveLength(p.pinyin.length);
  });

  it("walks the practice sets and wraps around", () => {
    expect(nextPromptId("ma4")).toBe("zhongguo");
    expect(nextPromptId("yu")).toBe("ma4");
  });
});
