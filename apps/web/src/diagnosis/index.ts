// Lane B owns this folder. These two signatures are what the UI calls: keep them stable.
// Both are MOCKS so the screens can be built now. Real versions: SPEC.md B1 (sandhi) and Module E (rules).
import type { AudioAnalysis, FaceSummary, FeedbackItem, PromptItem, SyllableTarget, Tone, ToneVariant } from "@shared/contracts/types";

const VARIANT: Record<Tone, ToneVariant> = { 1: "T1", 2: "T2", 3: "T3_full", 4: "T4", 5: "T5" };

/** Written pinyin to surface tone targets. MOCK: no sandhi yet. */
export function targetsFor(prompt: PromptItem): SyllableTarget[] {
  return prompt.pinyin.map((pinyin, index) => {
    const tone = Number(pinyin.at(-1)) as Tone;
    const vowel = prompt.vowelTargets?.[index] ?? undefined;
    return { index, pinyin, surfaceTone: tone, variant: VARIANT[tone], ...(vowel && { vowel }) };
  });
}

/** Audio and face evidence to at most two fix cards. MOCK: one generic card per tone issue, no vowel rules. */
export function diagnose(_prompt: PromptItem, audio: AudioAnalysis, _face: FaceSummary[]): FeedbackItem[] {
  return audio.syllables
    .flatMap((s) =>
      s.tone.issues.map((issueId) => ({
        diagnosis: { syllableIndex: s.index, issueId, articulator: "pitch" as const, severity: 2 as const, evidence: { rmse: s.tone.rmse }, messageKey: issueId },
        title: `Tone issue on ${s.target.pinyin}`,
        instruction: issueId,
      })),
    )
    .slice(0, 2);
}
