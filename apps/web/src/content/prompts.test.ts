// Keeps the prompt list and the shared fixtures in step.
import { describe, expect, it } from "vitest";
import { PROMPTS, PRACTICE_SETS } from "./prompts";
import { FIXTURES, fixtureAnalysis, fixtureFace } from "../fixtures";

const byId = new Map(PROMPTS.map((p) => [p.id, p]));

describe("prompts", () => {
  it("every prompt has a 'correct' fixture", () => {
    for (const p of PROMPTS) expect(FIXTURES.some((f) => f.promptId === p.id && f.variant === "correct"), p.id).toBe(true);
  });

  it("practice sets only name real prompts", () => {
    for (const id of Object.values(PRACTICE_SETS).flat()) expect(byId.has(id), id).toBe(true);
  });

  it.each(FIXTURES.map((f) => [`${f.promptId}.${f.variant}`, f] as const))("%s matches its prompt", (_, f) => {
    const prompt = byId.get(f.promptId)!;
    const audio = fixtureAnalysis(f.promptId, f.variant);
    expect(prompt, f.promptId).toBeDefined();
    expect(audio.syllables.map((s) => s.target.pinyin)).toEqual(prompt.pinyin);
    expect(audio.syllables.map((s) => s.target.vowel ?? null)).toEqual(prompt.pinyin.map((_, i) => prompt.vowelTargets?.[i] ?? null));
    expect(fixtureFace(f.promptId, f.variant).map((s) => s.syllableIndex)).toEqual(audio.syllables.map((s) => s.index));
  });
});
