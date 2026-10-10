// Lane B owns this folder. These two signatures are what the UI calls: keep them stable.
// targetsFor: sandhi.ts (SPEC.md B1). diagnose: rules.ts + messages.ts (Module E).
import type { AudioAnalysis, Diagnosis, FaceSummary, FeedbackItem, L1Code, PromptItem, SyllableAnalysis } from "@shared/contracts/types";
import { l1NoteFor } from "../content/l1";
import { CAUTIOUS, MESSAGES, fill } from "./messages";
import { type Lips, type Rule, lipsFrom, matchRules } from "./rules";

export { targetsFor } from "./sandhi";

/** Audio and face evidence to at most two fix cards, with an L1 note where one applies (SPEC.md Module E). */
export function diagnose(_prompt: PromptItem, audio: AudioAnalysis, face: FaceSummary[], l1: L1Code = "other"): FeedbackItem[] {
  const cards = audio.syllables.flatMap((syllable) => {
    const f = face.find((x) => x.syllableIndex === syllable.index);
    const lips = lipsFrom(f?.roundness, f?.coverage);
    const [first, ...rest] = matchRules({ syllable, lips }).sort((a, b) => b.severity - a.severity);
    if (!first) return [];
    // One card per syllable, unless its tone and vowel issues are both severity 3.
    const second = first.severity === 3 ? rest.find((r) => r.severity === 3 && (r.articulator === "pitch") !== (first.articulator === "pitch")) : undefined;
    return [first, second].filter((r) => r !== undefined).map((rule) => card(rule, syllable, lips, f?.roundness, l1));
  });
  // Highest severity first; sort is stable, so ties keep the earlier syllable.
  return cards.sort((a, b) => b.diagnosis.severity - a.diagnosis.severity).slice(0, 2);
}

function card(rule: Rule, s: SyllableAnalysis, lips: Lips, roundness: number | undefined, l1: L1Code): FeedbackItem {
  const vowel = rule.articulator !== "pitch" ? s.vowel : undefined;
  const key = lips === undefined && MESSAGES[`${rule.messageKey}_audio`] ? `${rule.messageKey}_audio` : rule.messageKey;
  const p = s.tone.producedChao;
  const vars = { heard: s.tone.nearest.slice(1, 2), tone: s.target.surfaceTone, note: s.target.sandhiNote ?? "", dir: p.at(-1)! > p[0] ? "up" : "down" };
  const evidence: Diagnosis["evidence"] = vowel
    ? { heardAs: vowel.heardAs, f2n: vowel.f2n, f3ratio: vowel.f3ratio, glide: vowel.glide, confidence: vowel.confidence, ...(roundness !== undefined && { roundness }) }
    : { rmse: s.tone.rmse, nearest: s.tone.nearest, score: s.tone.score };
  const cautious = vowel && vowel.confidence < 0.3 && rule.severity > 1 ? CAUTIOUS : "";
  const l1Note = l1NoteFor(l1, rule.id);
  return {
    diagnosis: { syllableIndex: s.index, issueId: rule.id, articulator: rule.articulator, severity: rule.severity, evidence, messageKey: key },
    title: fill(MESSAGES[key].title, vars),
    instruction: cautious + fill(MESSAGES[key].text, vars),
    ...(l1Note && { l1Note }),
    ...(rule.targetVisual && { targetVisual: rule.targetVisual }),
  };
}
