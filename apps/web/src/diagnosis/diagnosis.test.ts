// Acceptance tests for lane B, written from the fixtures. They are skipped while
// diagnosis/index.ts is a mock: remove each `.skip` as the real version lands.
import { describe, expect, it } from "vitest";
import { diagnose, targetsFor } from ".";
import { PROMPTS } from "../content/prompts";
import { FIXTURES, fixtureAnalysis, fixtureFace } from "../fixtures";

const prompt = (id: string) => PROMPTS.find((p) => p.id === id)!;

describe("targetsFor (SPEC.md B1: sandhi)", () => {
  it.each(PROMPTS.map((p) => [p.id, p] as const))("%s gives the surface tones in its fixture", (_, p) => {
    const expected = fixtureAnalysis(p.id, "correct").syllables.map((s) => s.target);
    expect(targetsFor(p)).toEqual(expected);
  });
});

describe.skip("diagnose (SPEC.md Module E)", () => {
  it.each(FIXTURES.map((f) => [`${f.promptId}.${f.variant}`, f] as const))("%s gives the scripted fix cards", (_, f) => {
    const cards = diagnose(prompt(f.promptId), fixtureAnalysis(f.promptId, f.variant), fixtureFace(f.promptId, f.variant));
    // Correct syllables get no card; info-only cards (severity 1) don't count as fixes.
    const fixes = cards.filter((c) => c.diagnosis.severity > 1);
    expect(fixes.map((c) => ({ syllableIndex: c.diagnosis.syllableIndex, issueId: c.diagnosis.issueId }))).toEqual(f.expectCards);
  });
});
