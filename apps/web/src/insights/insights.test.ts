import { describe, expect, it } from "vitest";
import { PROMPTS } from "../content/prompts";
import { diagnose } from "../diagnosis";
import { FIXTURES, fixtureAnalysis, fixtureCalibration, fixtureFace } from "../fixtures";
import { describeContour, estimateTongue, insightsFor } from ".";

const cal = fixtureCalibration.audio;
const prompt = (id: string) => PROMPTS.find((p) => p.id === id)!;
function run(promptId: string, variant: string, withFace = true) {
  const audio = fixtureAnalysis(promptId, variant);
  const face = withFace ? fixtureFace(promptId, variant) : [];
  const cards = diagnose(prompt(promptId), audio, face, "en");
  return { audio, face, cards, insights: insightsFor(prompt(promptId), audio, face, cards, cal) };
}
const area = (xs: ReturnType<typeof run>["insights"], a: string, i = 0) => xs.find((x) => x.area === a && x.syllableIndex === i)!;

describe("insights agree with diagnose() on every fixture", () => {
  it.each(FIXTURES.flatMap((f) => [true, false].map((face) => [`${f.promptId}.${f.variant}${face ? "" : " (no face)"}`, f, face] as const)))("%s", (_, f, withFace) => {
    const { cards, insights } = run(f.promptId, f.variant, withFace);
    // Every fix card shows up as a "fix" in its own area, with the same title.
    for (const c of cards.filter((c) => c.diagnosis.severity > 1)) {
      const hit = area(insights, c.diagnosis.articulator, c.diagnosis.syllableIndex);
      expect(hit, c.diagnosis.issueId).toMatchObject({ status: "fix", headline: c.title, issueId: c.diagnosis.issueId });
    }
    // No new verdicts: "fix" only on a syllable that has a fix card.
    for (const x of insights.filter((x) => x.status === "fix")) {
      expect(cards.some((c) => c.diagnosis.severity > 1 && c.diagnosis.syllableIndex === x.syllableIndex), `${x.area} ${x.headline}`).toBe(true);
    }
    // Every syllable gets a pitch insight; actionable areas come with steps.
    expect(insights.filter((x) => x.area === "pitch")).toHaveLength(fixtureAnalysis(f.promptId, f.variant).syllables.length);
    for (const x of insights.filter((x) => x.status === "fix")) expect(x.how.length).toBeGreaterThan(0);
  });
});

describe("the 女 demo beats", () => {
  it("nee: lips are the fix, the tongue was already forward", () => {
    const { insights } = run("nv", "nee");
    expect(area(insights, "lips")).toMatchObject({ status: "fix", headline: "Round your lips", lips: { target: "rounded" } });
    expect(area(insights, "tongue")).toMatchObject({ status: "good" });
    expect(area(insights, "tongue").tongue!.you!.front).toBeGreaterThan(0.6);
  });
  it("noo: lips are right, the tongue slid back", () => {
    const { insights } = run("nv", "noo");
    expect(area(insights, "lips").status).toBe("good");
    expect(area(insights, "tongue")).toMatchObject({ status: "fix", headline: "Keep your tongue forward" });
    expect(area(insights, "tongue").tongue!.you!.front).toBeLessThan(0.4);
  });
  it("noo without the camera: can't separate lips from tongue", () => {
    const { insights } = run("nv", "noo", false);
    expect(area(insights, "tongue")).toMatchObject({ status: "unsure", tongue: { you: null } });
    expect(area(insights, "lips").status).toBe("fix");     // y_both's audio-only card names both causes
  });
  it("carries the card's native-language note", () => {
    expect(area(run("nv", "noo").insights, "tongue").note).toContain("English has no ü");
  });
  it("correct: everything good, no jaw tip", () => {
    const { insights } = run("nv", "correct");
    expect(insights.map((x) => x.status)).toEqual(["good", "good", "good"]);
  });
});

describe("pitch", () => {
  it("explains a dipped tone 2 with the card and tone-2 drills", () => {
    const { insights } = run("ma4", "t2_dip");
    const x = area(insights, "pitch", 1);
    expect(x).toMatchObject({ status: "fix", issueId: "t2_late" });
    expect(x.what).toContain("dipped, then rose");
    expect(x.how.join(" ")).toContain("Huh?");
  });
  it("mentions the sandhi rule", () => {
    expect(area(run("nihao", "full_dips").insights, "pitch", 0).how.join(" ")).toContain("3+3 → 2+3");
  });
  it.each([
    [[5, 5, 5, 5, 5, 5, 5, 5, 5, 5], "stayed high and level"],
    [[3, 3.2, 3.5, 3.8, 4, 4.3, 4.5, 4.7, 4.9, 5], "started in the middle, rose, and ended high"],
    [[2, 1.6, 1.2, 1, 1, 1.2, 2, 2.8, 3.4, 4], "started low, dipped, then rose, and ended high"],
    [[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1.2, 1], "started high, fell, and ended low"],
    [[], "I couldn't hear a clear pitch"],
  ])("%j → %s", (p, words) => expect(describeContour(p)).toBe(words));
  it("describes the target in the present tense", () => {
    expect(describeContour([5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1.2, 1], "present")).toBe("starts high, falls, and ends low");
  });
  it("doesn't repeat the sandhi rule the card already explains", () => {
    expect(area(run("nihao", "full_dips").insights, "pitch", 0).how.filter((h) => h.includes("3+3 → 2+3"))).toHaveLength(1);
  });
});

describe("estimateTongue", () => {
  const s = fixtureAnalysis("nv", "correct").syllables[0];
  it("is high and front for a good ü", () => {
    const t = estimateTongue(s, cal, fixtureFace("nv", "correct")[0])!;
    expect(t.front).toBeGreaterThan(0.9);
    expect(t.height).toBeGreaterThan(0.9);
  });
  it("lowers height as F1 rises toward your 'ah'", () => {
    const open = { ...s, vowel: { ...s.vowel!, formants: { ...s.vowel!.formants, F1: 600 } } };
    expect(estimateTongue(open, cal)!.height).toBeLessThan(0.5);
  });
});
