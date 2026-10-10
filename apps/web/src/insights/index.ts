// Insights: turns one attempt into plain-language "what happened / how to fix it" per syllable and per area.
// It explains diagnose()'s cards and never adds a verdict of its own: an area is only "fix" when a card of
// severity 2-3 sits on that syllable (insights.test.ts checks this on every fixture).
// Pitch advice comes from the pitch curve (the vocal folds make pitch, not the mouth). Lips and jaw come from the
// camera; the tongue is estimated from the vowel's formants, using the camera's lip reading to separate the two.
import type { AudioAnalysis, AudioCalibration, FaceSummary, FeedbackItem, PromptItem, SyllableAnalysis, ToneVariant, VowelClass } from "@shared/contracts/types";

export type Area = "pitch" | "lips" | "tongue" | "jaw";
export type InsightStatus = "good" | "fix" | "tip" | "unsure";

export interface TonguePosition { front: number; height: number }   // 0-1: 1 = front like "ee" / high like "ee" and "oo"

export interface Insight {
  syllableIndex: number;
  area: Area;
  status: InsightStatus;
  headline: string;            // the card's title when a card covers this area
  what: string;                // what was measured, in plain words
  how: string[];               // what to do, as physical steps
  note?: string;               // the card's native-language note, when one applies
  issueId?: string;
  pitch?: { produced: number[]; target: number[] };
  lips?: { roundness: number; target: "rounded" | "spread" };
  tongue?: { you: TonguePosition | null; target: TonguePosition };
}

const TONE_NAME: Record<ToneVariant, string> = { T1: "tone 1", T2: "tone 2", T3_full: "tone 3", T3_half: "a low tone 3", T4: "tone 4", T5: "the neutral tone" };

const TONE_HOW: Record<ToneVariant, string[]> = {
  T1: ["Pick a comfortable high note and hold it, like singing “laaa”.", "Keep it flat right to the end of the syllable."],
  T2: ["Start in the middle of your voice and go straight up, like a surprised “Huh?”", "Begin the rise right away, without dipping first."],
  T3_full: ["Drop to the very bottom of your voice; a little creak is fine.", "Relax your throat and jaw down there, then let the pitch lift at the end."],
  T3_half: ["Go low and stay low.", "Don't rise at the end: move straight on to the next syllable."],
  T4: ["Start near the top of your voice and drop hard, like a firm “No!”", "Keep the fall short and decisive, all the way down."],
  T5: ["Say it short and light, without stress."],
};

const height = (l: number) => (l >= 4 ? "high" : l >= 2.5 ? "in the middle" : "low");

/** The shape of a 10-point Chao contour in words. Past tense for what you did ("started low, dipped, then rose,
 *  and ended high"), present for the target ("starts low, dips, then rises, and ends high"). */
export function describeContour(p: number[], tense: "past" | "present" = "past"): string {
  if (p.length < 2) return "I couldn't hear a clear pitch";
  const start = p[0], end = p.at(-1)!, lo = Math.min(...p), hi = Math.max(...p), loAt = p.indexOf(lo);
  const v = (past: string, present: string) => (tense === "past" ? past : present);
  if (hi - lo < 0.8) return `${v("stayed", "stays")} ${height((start + end) / 2)} and level`;
  const shape = loAt >= 2 && loAt <= 7 && start - lo > 0.6 && end - lo > 0.6 ? v("dipped, then rose", "dips, then rises")
    : end - start > 0.6 ? v("rose", "rises") : start - end > 0.6 ? v("fell", "falls") : v("wavered", "wavers");
  return `${v("started", "starts")} ${height(start)}, ${shape}, and ${v("ended", "ends")} ${height(end)}`;
}

function pitchInsight(s: SyllableAnalysis, char: string, card?: FeedbackItem): Insight {
  const t = s.tone, target = t.target;
  const what = `On ${char} your voice ${describeContour(t.producedChao)}. ${cap(TONE_NAME[target])} ${describeContour(t.targetChao, "present")}.`;
  const note = s.target.sandhiNote;
  const sandhi = note && !(card?.instruction.includes(note)) ? [`In this word ${char} changes tone (${note}), so aim for ${TONE_NAME[target]}.`] : [];
  const base = { syllableIndex: s.index, area: "pitch" as const, pitch: { produced: t.producedChao, target: t.targetChao } };
  if (!card) return { ...base, status: "good", headline: `${cap(TONE_NAME[target])} on ${char}: right on`, what, how: [] };
  return { ...base, status: card.diagnosis.severity > 1 ? "fix" : "tip", headline: card.title, issueId: card.diagnosis.issueId, what, note: card.l1Note,
    how: [card.coaching ?? card.instruction, ...sandhi, ...TONE_HOW[target]] };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const TARGET_TONGUE: Record<Exclude<VowelClass, "other">, TonguePosition> = { i: { front: 1, height: 1 }, y: { front: 1, height: 1 }, u: { front: 0, height: 1 } };

/** Where the tongue probably was. Height from F1 (between your "ee"/"oo" and your "ah"); front/back from F2,
 *  but lip rounding also lowers F2, so the audio's verdict (heardAs) picks the side and roundness corrects the spot.
 *  shortcut: the 0.2 rounding correction is a starting guess; tune it on real takes from the rig.
 *  null when "oo" was heard but the camera didn't see the lips: then lips and tongue can't be told apart. */
export function estimateTongue(s: SyllableAnalysis, cal: AudioCalibration, face?: FaceSummary): TonguePosition | null {
  const v = s.vowel;
  if (!v) return null;
  const lipsSeen = !!face && face.coverage >= 0.5;
  const highF1 = (cal.anchors.i.F1 + cal.anchors.u.F1) / 2;
  const h = clamp01(1 - (v.formants.F1 - highF1) / Math.max(cal.anchors.a.F1 - highF1, 1));
  const f = clamp01(v.f2n + (lipsSeen ? 0.2 * face!.roundness : 0));
  if (v.heardAs === "i" || v.heardAs === "y") return { front: Math.max(f, 0.65), height: h };
  if (v.heardAs === "u") return lipsSeen ? { front: Math.min(f, 0.35), height: h } : null;
  return { front: f, height: h };
}

function vowelInsights(s: SyllableAnalysis, char: string, cal: AudioCalibration, face: FaceSummary | undefined, cards: FeedbackItem[]): Insight[] {
  const v = s.vowel;
  if (!v || v.target === "other") return [];
  const target = v.target;
  const lipsSeen = !!face && face.coverage >= 0.5;
  const anyFix = cards.some((c) => c.diagnosis.severity > 1);
  const close = v.confidence < 0.3 ? " It was a close call." : "";
  const sound = { i: "“ee”", y: "ü", u: "“oo”", other: "another vowel" };
  const out: Insight[] = [];

  // Lips: from the camera.
  const lipsTarget = target === "i" ? "spread" : "rounded";
  const lipsCard = cards.find((c) => c.diagnosis.articulator === "lips");
  const lipsWord = (r: number) => (r >= 0.6 ? "rounded" : r <= 0.3 ? "spread" : "partly rounded");
  out.push(!lipsSeen
    ? { syllableIndex: s.index, area: "lips", status: lipsCard && lipsCard.diagnosis.severity > 1 ? "fix" : "unsure", headline: lipsCard?.title ?? "I couldn't see your lips",
        what: "The camera didn't see your face clearly during the vowel, so this comes from the sound alone.", how: lipsCard ? [lipsCard.coaching ?? lipsCard.instruction] : ["Keep your face in view and well lit, then try again."], issueId: lipsCard?.diagnosis.issueId }
    : { syllableIndex: s.index, area: "lips", lips: { roundness: face!.roundness, target: lipsTarget },
        status: lipsCard ? (lipsCard.diagnosis.severity > 1 ? "fix" : "tip") : "good",
        headline: lipsCard?.title ?? `Lips ${lipsTarget}: right for ${sound[target]}`,
        what: `Your lips were ${lipsWord(face!.roundness)} during ${char} (${Math.round(face!.roundness * 100)}% of the way from your “ee” to your “oo”). ${sound[target]} needs them ${lipsTarget === "rounded" ? "in a small, tight circle" : "spread, like a slight smile"}.`,
        how: lipsCard ? [lipsCard.coaching ?? lipsCard.instruction, lipsTarget === "rounded" ? "Watch the mirror: push your lips forward into an “o” the size of a straw." : "Pull the corners of your mouth back a little, as if smiling."] : [],
        issueId: lipsCard?.diagnosis.issueId, note: lipsCard?.l1Note });

  // Tongue: estimated from the sound, with the lips separating the two causes.
  const you = estimateTongue(s, cal, face);
  const tongueCard = cards.find((c) => c.diagnosis.articulator === "tongue");
  const wantFront = TARGET_TONGUE[target].front > 0.5;
  const isFront = you ? you.front > 0.5 : null;
  const tongueWrong = isFront !== null && isFront !== wantFront;
  const where = (front: boolean) => (front ? "forward, tip behind your lower front teeth (as in “ee”)" : "pulled back (as in “oo”)");
  out.push({
    syllableIndex: s.index, area: "tongue", tongue: { you, target: TARGET_TONGUE[target] },
    status: tongueCard ? (tongueCard.diagnosis.severity > 1 ? "fix" : "tip") : you === null ? "unsure" : tongueWrong && anyFix ? "fix" : "good",
    headline: tongueCard?.title ?? (you === null ? "Tongue: can't tell without the camera" : tongueWrong && anyFix ? `Bring your tongue ${wantFront ? "forward" : "back"}` : `Tongue ${wantFront ? "forward" : "back"}: right for ${sound[target]}`),
    what: you === null
      ? `It sounded like ${sound[v.heardAs]}, which rounded lips or a pulled-back tongue can both cause. With your lips in view I can tell which.`
      : tongueWrong
        ? `From the sound, your tongue was probably ${where(isFront!)}. ${sound[target]} needs it ${where(wantFront)}.${close}`
        : `From the sound, your tongue was ${where(isFront!)}, which is right for ${sound[target]}.${close}`,
    how: tongueCard ? [tongueCard.coaching ?? tongueCard.instruction, "Say “ee” and freeze your tongue there, then change only your lips."]
      : tongueWrong && anyFix ? [`Say “ee”, keep your tongue exactly there, and only then shape your lips.`] : [],
    issueId: tongueCard?.diagnosis.issueId, note: tongueCard?.l1Note,
  });

  // Jaw: info only. High vowels want a nearly closed jaw; both the camera and F1 must agree before saying so.
  if (lipsSeen && face!.jawOpen > 0.35 && you && you.height < 0.6) {
    out.push({ syllableIndex: s.index, area: "jaw", status: "tip", headline: "Close your jaw a little",
      what: `Your mouth was quite open for ${sound[target]}, which is a high, close vowel.`, how: ["Bring your teeth almost together, about a finger's width apart."] });
  }
  return out;
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

/** All insights for one attempt, in syllable order: pitch first, then lips, tongue, jaw. */
export function insightsFor(prompt: PromptItem, audio: AudioAnalysis, face: FaceSummary[], cards: FeedbackItem[], cal: AudioCalibration): Insight[] {
  const chars = Array.from(prompt.hanzi.replace(/\s/g, ""));
  return audio.syllables.flatMap((s) => {
    const mine = cards.filter((c) => c.diagnosis.syllableIndex === s.index);
    const char = chars[s.index] ?? s.target.pinyin;
    return [
      pitchInsight(s, char, mine.find((c) => c.diagnosis.articulator === "pitch")),
      ...vowelInsights(s, char, cal, face.find((f) => f.syllableIndex === s.index), mine.filter((c) => c.diagnosis.articulator !== "pitch")),
    ];
  });
}
