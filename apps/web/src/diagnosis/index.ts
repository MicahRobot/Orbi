// Lane B owns this folder. These two signatures are what the UI calls: keep them stable.
// targetsFor is real (sandhi.ts, SPEC.md B1); diagnose is still a MOCK until Module E lands.
import type { AudioAnalysis, FaceSummary, FeedbackItem, L1Code, PromptItem } from "@shared/contracts/types";
import { l1NoteFor } from "../content/l1";

export { targetsFor } from "./sandhi";

/** Audio and face evidence to at most two fix cards, with an L1 note where one applies.
 *  MOCK: one generic card per tone issue, no vowel rules. */
export function diagnose(_prompt: PromptItem, audio: AudioAnalysis, _face: FaceSummary[], l1: L1Code = "other"): FeedbackItem[] {
  return audio.syllables
    .flatMap((s) =>
      s.tone.issues.map((issueId) => ({
        diagnosis: { syllableIndex: s.index, issueId, articulator: "pitch" as const, severity: 2 as const, evidence: { rmse: s.tone.rmse }, messageKey: issueId },
        title: `Tone issue on ${s.target.pinyin}`,
        instruction: issueId,
        l1Note: l1NoteFor(l1, issueId),
      })),
    )
    .slice(0, 2);
}
