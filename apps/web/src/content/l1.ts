// L1 engine data: what learners with each native language tend to find hard in Mandarin.
// Lane B owns this file. These are tendencies, never diagnoses: the audio still decides what's wrong;
// a matching pattern only adds a friendly "common for X speakers" note. Review wording with a native speaker.
import type { L1Code } from "@shared/contracts/types";

export interface L1Pattern {
  issueIds: string[];         // diagnosis issueIds this tendency explains
  note: string;               // shown in onboarding and on matching fix cards
}

export interface L1Info { code: L1Code; name: string; patterns: L1Pattern[] }

const NO_TONES = ["t1_drift", "t3_not_low", "t4_shallow", "wrong_tone"];

export const L1S: L1Info[] = [
  {
    code: "en", name: "English", patterns: [
      { issueIds: NO_TONES, note: "English uses pitch for emotion and questions, not for word meaning, so tones tend to flatten or drift." },
      { issueIds: ["y_lips_not_rounded", "y_tongue_back", "y_both", "y_glide"], note: "English has no ü, so it usually comes out as \"oo\" or as \"yoo\"." },
    ],
  },
  {
    code: "es", name: "Spanish", patterns: [
      { issueIds: NO_TONES, note: "Spanish doesn't use pitch to change word meaning, so tones take practice." },
      { issueIds: ["y_tongue_back", "y_both"], note: "Spanish has no ü, so it often turns into u." },
    ],
  },
  {
    code: "fr", name: "French", patterns: [
      { issueIds: NO_TONES, note: "French doesn't use word tones, so pitch may follow the sentence instead of the word." },
    ],
  },
  {
    code: "ja", name: "Japanese", patterns: [
      { issueIds: ["t2_shallow", "t2_late", "t3_not_low", "wrong_tone"], note: "Japanese pitch accent is mostly high or low, so the rising tone 2 and the low dipping tone 3 are the tricky ones." },
      { issueIds: ["y_lips_not_rounded", "y_glide"], note: "Japanese has no ü, and Japanese u is said with flatter lips, so ü may lose its rounding or become \"yu\"." },
    ],
  },
  {
    code: "ko", name: "Korean", patterns: [
      { issueIds: NO_TONES, note: "Standard Korean has no word tones, so tones take practice." },
      { issueIds: ["y_glide"], note: "Korean ㅟ is usually said as a glide (\"wi\"), so ü may slide instead of holding one shape." },
    ],
  },
  {
    code: "vi", name: "Vietnamese", patterns: [
      { issueIds: ["wrong_tone", "t3_full_in_context"], note: "Vietnamese is tonal too, so tones come easier, but Mandarin tones can get mapped onto Vietnamese ones. Watch the half third tone." },
    ],
  },
  { code: "other", name: "Another language", patterns: [] },
];

/** The note to show on a fix card, if this issue is a known tendency for the learner's L1. */
export function l1NoteFor(l1: L1Code, issueId: string): string | undefined {
  return L1S.find((l) => l.code === l1)?.patterns.find((p) => p.issueIds.includes(issueId))?.note;
}
