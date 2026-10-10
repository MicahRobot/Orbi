// Diagnosis rules as data (SPEC.md Module E). Per syllable, rules run in this order and the
// first match per articulator wins. Audio decides; the face only picks which explanation fits.
import type { Diagnosis, SyllableAnalysis, TargetVisual, ToneIssueId, VowelClass } from "@shared/contracts/types";

/** Lip shape from the face summary; undefined when the face was missing (coverage < 0.5). */
export type Lips = "rounded" | "partly" | "spread" | undefined;

export interface RuleContext { syllable: SyllableAnalysis; lips: Lips }

export interface Rule {
  id: string;                  // the issueId on the card
  appliesTo: "tone" | VowelClass;
  when: (ctx: RuleContext) => boolean;
  articulator: Diagnosis["articulator"];
  severity: Diagnosis["severity"];
  messageKey: string;
  targetVisual?: TargetVisual;
}

export function lipsFrom(roundness: number | undefined, coverage = 0): Lips {
  if (roundness === undefined || coverage < 0.5) return undefined;
  return roundness >= 0.6 ? "rounded" : roundness <= 0.3 ? "spread" : "partly";
}

const heard = (ctx: RuleContext, ...v: VowelClass[]) => v.includes(ctx.syllable.vowel!.heardAs);
// Without a face, lip conditions don't block a rule: the audio alone decides.
const lipsAre = (ctx: RuleContext, ...l: Lips[]) => ctx.lips === undefined || l.includes(ctx.lips);
const has = (ctx: RuleContext, id: ToneIssueId) => ctx.syllable.tone.issues.includes(id);

const tone = (id: ToneIssueId, severity: Diagnosis["severity"]): Rule =>
  ({ id, appliesTo: "tone", when: (ctx) => has(ctx, id), articulator: "pitch", severity, messageKey: id });

export const RULES: Rule[] = [
  // Vowel target ü. y_both sits before y_tongue_back so a missing face gets the message naming both causes.
  { id: "y_glide", appliesTo: "y", when: (c) => c.syllable.vowel!.glide, articulator: "lips", severity: 3, messageKey: "y_glide", targetVisual: "rounded" },
  { id: "y_lips_not_rounded", appliesTo: "y", when: (c) => heard(c, "i"), articulator: "lips", severity: 3, messageKey: "y_lips_not_rounded", targetVisual: "rounded" },
  { id: "y_both", appliesTo: "y", when: (c) => heard(c, "u") && lipsAre(c, "spread", "partly"), articulator: "lips", severity: 3, messageKey: "y_both", targetVisual: "rounded" },
  { id: "y_tongue_back", appliesTo: "y", when: (c) => heard(c, "u") && c.lips === "rounded", articulator: "tongue", severity: 3, messageKey: "y_tongue_back", targetVisual: "rounded" },
  { id: "y_ok_lips_hint", appliesTo: "y", when: (c) => heard(c, "y") && c.lips === "spread", articulator: "lips", severity: 1, messageKey: "y_ok_lips_hint", targetVisual: "rounded" },
  // Other vowel targets
  { id: "u_fronted", appliesTo: "u", when: (c) => heard(c, "i", "y") && lipsAre(c, "spread", "partly"), articulator: "tongue", severity: 3, messageKey: "u_fronted", targetVisual: "rounded" },
  { id: "i_rounded", appliesTo: "i", when: (c) => heard(c, "y") && lipsAre(c, "rounded"), articulator: "lips", severity: 3, messageKey: "i_rounded", targetVisual: "spread" },
  // Tone. A sandhi syllable shows wrong_tone with the rule; otherwise the specific detector wins (NOTES.md).
  tone("no_pitch", 3),
  { ...tone("wrong_tone", 3), when: (c) => has(c, "wrong_tone") && !!c.syllable.target.sandhiNote, messageKey: "wrong_tone_sandhi" },
  tone("t1_drift", 2),
  tone("t1_low", 2),
  tone("t2_shallow", 2),
  tone("t2_late", 2),
  tone("t3_not_low", 2),
  tone("t4_shallow", 2),
  tone("t4_low_start", 2),
  tone("wrong_tone", 3),
  tone("t3_full_in_context", 1),
];

/** The first matching rule per articulator, for one syllable. */
export function matchRules(ctx: RuleContext): Rule[] {
  const vowel = ctx.syllable.vowel?.target;
  const hits = new Map<Diagnosis["articulator"], Rule>();
  for (const rule of RULES) {
    const applies = rule.appliesTo === "tone" || rule.appliesTo === vowel;
    if (applies && !hits.has(rule.articulator) && rule.when(ctx)) hits.set(rule.articulator, rule);
  }
  return [...hits.values()];
}
