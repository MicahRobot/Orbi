// Everything the Lab draws for one take, derived from the real pipeline: /analyze's AudioAnalysis, the face summary,
// diagnose()'s cards and insightsFor(). Pure, so it's tested on the fixtures (model.test.ts).
// The verdict and Pitch/Lips/Tongue chips use the app's own rules (scoring.ts), so the Lab and the app always agree.
import type { AudioAnalysis, AudioCalibration, FaceCalibration, FaceFeatures, FaceSummary, FeedbackItem, L1Code, PromptItem } from "@shared/contracts/types";
import { diagnose } from "../diagnosis";
import { type Insight, insightsFor } from "../insights";
import { hanziOf, lightsFor, summarize, toneMarks, type LightStatus, type Ring } from "../ui/scoring";

export interface Take {
  id: number;
  prompt: PromptItem;
  createdAt: number;
  audio: AudioAnalysis;
  frames: FaceFeatures[];          // the take's face frames, t in seconds from the start of the audio
  face: FaceSummary[];             // per-vowel lip summary passed to diagnose()
  calibration: AudioCalibration;   // the calibration this take was analyzed with
  faceCal: FaceCalibration | null; // the learner's own face calibration, if any
  l1: L1Code;
  wav?: Blob;
  wavUrl?: string;
  demo?: string;                   // the demo beat this replays
}

export type Mark = "good" | "fix" | "almost" | "tip" | "unsure" | "off";

export interface CardView {
  key: string;
  status: Insight["status"];
  area: string;
  syl: string;                     // "女 nǚ"
  headline: string;
  measured: string;
  steps: string[];
  note?: string;
  lips?: { you: number; lo: number; hi: number };
  tongue?: { target: [number, number]; you: [number, number] | null };   // x: 0 front → 1 back, y: 0 high → 1 low
}

export interface SyllableView { label: string; native: number[]; you: number[]; flag: boolean }

export interface TakeView {
  match: number;
  ring: Ring;
  passed: boolean;
  chips: { area: string; mark: Mark; word: string }[];
  pitch: SyllableView[];
  callout: string | null;
  main: CardView[];
  compact: CardView[];
  timeline: { series: [number, number][][]; windows: { a: number; b: number; label: string }[] } | null;
  rows: { syl: string; score: number; rmse: string; heard: string; formants: string; roundness: string }[];
}

const AREA: Record<Insight["area"], string> = { pitch: "Pitch", lips: "Lips", tongue: "Tongue", jaw: "Jaw" };
const CHIP_WORD: Record<LightStatus, string> = { good: "Good", tip: "Tip", almost: "Almost", fix: "Fix", off: "Not checked" };
const ORDER: Record<Insight["status"], number> = { fix: 0, tip: 1, unsure: 2, good: 3 };
const unit = (level: number) => Math.min(1, Math.max(0, (level - 0.5) / 5));   // Chao 0.5–5.5 → 0–1

/** Lip-roundness zones from lipsFrom(): spread ≤ 0.3, rounded ≥ 0.6. */
const LIP_ZONE = { spread: { lo: 0, hi: 0.3 }, rounded: { lo: 0.6, hi: 1 } };

export function cardView(x: Insight, chars: string[], pinyin: string[]): CardView {
  const i = x.syllableIndex;
  return {
    key: `${i}-${x.area}`,
    status: x.status,
    area: AREA[x.area],
    syl: `${chars[i] ?? ""} ${pinyin[i] ? toneMarks(pinyin[i]) : ""}`.trim(),
    headline: x.headline,
    measured: x.what,
    steps: x.how,
    note: x.note,
    lips: x.lips && { you: x.lips.roundness, ...LIP_ZONE[x.lips.target] },
    tongue: x.tongue && {
      target: [1 - x.tongue.target.front, 1 - x.tongue.target.height],
      you: x.tongue.you && [1 - x.tongue.you.front, 1 - x.tongue.you.height],
    },
  };
}

/** Lip width (scaled so "ee" is high), pucker and jaw opening over the take, with each syllable's vowel window. */
export function timelineOf(frames: FaceFeatures[], audio: AudioAnalysis, faceCal: FaceCalibration | null, chars: string[]): TakeView["timeline"] {
  const seen = frames.filter((f) => f.detected && f.t >= 0);
  if (seen.length < 3) return null;
  const end = Math.max(audio.durationSec, seen.at(-1)!.t);
  const widths = seen.map((f) => f.lipWidth);
  const [lo, hi] = faceCal ? [faceCal.oo.lipWidth, faceCal.ee.lipWidth] : [Math.min(...widths), Math.max(...widths)];
  const width = (w: number) => Math.min(1, Math.max(0, (w - lo) / Math.max(hi - lo, 1e-3)));
  const x = (t: number) => t / end;
  return {
    series: [
      seen.map((f) => [x(f.t), width(f.lipWidth)]),
      seen.map((f) => [x(f.t), Math.min(1, f.pucker)]),
      seen.map((f) => [x(f.t), Math.min(1, f.jawOpen)]),
    ],
    windows: audio.syllables.map((s) => ({ a: x(s.vowelStart), b: x(s.vowelEnd), label: chars[s.index] ?? s.target.pinyin })),
  };
}

export function viewOf(take: Take): TakeView {
  const { prompt, audio } = take;
  const cards = diagnose(prompt, audio, take.face, take.l1);
  const insights = insightsFor(prompt, audio, take.face, cards, take.calibration);
  const score = summarize(audio, cards);
  const chars = hanziOf(prompt);
  const pinyin = audio.syllables.map((s) => s.target.pinyin);
  const pitchMark = (i: number) => insights.find((x) => x.area === "pitch" && x.syllableIndex === i)?.status;
  const views = insights.map((x) => cardView(x, chars, pinyin)).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const sandhi = audio.syllables.find((s) => s.target.sandhiNote);
  const lipsSeen = take.face.some((f) => f.coverage >= 0.5);
  return {
    ...score,
    // A "Good" lips light without a face would claim something nobody saw; say so instead.
    chips: lightsFor(prompt, cards).map((l) => (l.part === "Lips" && l.status === "good" && !lipsSeen
      ? { area: l.part, mark: "unsure" as const, word: "Not seen" }
      : { area: l.part, mark: l.status, word: CHIP_WORD[l.status] })),
    pitch: audio.syllables.map((s, i) => ({
      label: `${chars[i] ?? ""} ${toneMarks(s.target.pinyin)}`.trim(),
      native: s.tone.targetChao.map(unit),
      you: s.tone.producedChao.map(unit),
      flag: pitchMark(i) === "fix" || pitchMark(i) === "tip",
    })),
    callout: sandhi
      ? `${chars[sandhi.index] ?? ""} changes tone here (${sandhi.target.sandhiNote}).${pitchMark(sandhi.index) === "good" ? " You did it." : ""}`
      : null,
    main: views.filter((c) => c.status === "fix" || c.status === "tip"),
    compact: views.filter((c) => c.status === "good" || c.status === "unsure"),
    timeline: timelineOf(take.frames, audio, take.faceCal, chars),
    rows: audio.syllables.map((s, i) => {
      const f = take.face.find((x) => x.syllableIndex === s.index);
      const v = s.vowel;
      return {
        syl: `${chars[i] ?? ""} ${toneMarks(s.target.pinyin)}`.trim(),
        score: s.tone.score,
        rmse: s.tone.rmse.toFixed(2),
        heard: v ? `${v.heardAs === "y" ? "ü" : v.heardAs} (${Math.round(v.confidence * 100)}%)` : "–",
        formants: v ? `${v.formants.F1} / ${v.formants.F2} / ${v.formants.F3}` : "–",
        roundness: f ? `${f.roundness.toFixed(2)} · face ${Math.round(f.coverage * 100)}%` : "–",
      };
    }),
  };
}

/** The diagnosis cards for a take, for the JSON download. */
export const cardsOf = (take: Take): FeedbackItem[] => diagnose(take.prompt, take.audio, take.face, take.l1);

export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
