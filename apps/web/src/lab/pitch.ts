// Pitch coaching math for the Lab: tone templates (so the live view can draw the target before /analyze answers),
// a real-time pitch detector, the same Hz → tone-level scaling as the service, and the correction arrows and key
// points drawn on results. Levels are on the 1–5 tone scale throughout; "close enough" is the service's green
// threshold (rmse ≤ 0.6, SPEC.md B4).
import type { AudioCalibration, PromptItem, ToneVariant } from "@shared/contracts/types";
import { targetsFor } from "../diagnosis";

export const TOLERANCE = 0.6;

const ANCHORS: Record<Exclude<ToneVariant, "T5">, [number, number][]> = {
  T1: [[0, 5], [1, 5]],
  T2: [[0, 3], [0.2, 2.7], [1, 5]],
  T3_full: [[0, 2], [0.6, 1], [1, 4]],
  T3_half: [[0, 2], [1, 1]],
  T4: [[0, 5], [1, 1]],
};
const NEUTRAL_LEVEL: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 1 };

/** The 10-point target contour, as services/audio/app/tone.py builds it (SPEC.md B3). */
export function templateFor(variant: ToneVariant, neutralLevel = 3): number[] {
  if (variant === "T5") return Array(10).fill(neutralLevel);
  const a = ANCHORS[variant];
  return Array.from({ length: 10 }, (_, i) => {
    const x = i / 9;
    const k = a.findIndex(([ax], j) => j > 0 && x <= ax);
    const [x0, y0] = a[k - 1], [x1, y1] = a[k];
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  });
}

/** One target contour per syllable, after sandhi, before any audio is analyzed. */
export function liveTargets(prompt: PromptItem): { label: string; target: number[] }[] {
  const chars = Array.from(prompt.hanzi.replace(/\s/g, ""));
  return targetsFor(prompt).map((t, i, all) => ({
    label: chars[i] ?? t.pinyin,
    target: templateFor(t.variant, i > 0 ? NEUTRAL_LEVEL[all[i - 1].surfaceTone] ?? 3 : 3),
  }));
}

/** Hz → tone level, the service's formula (SPEC.md B2 step 4): semitones scaled between your low and high notes. */
export function hzToLevel(hz: number, f0: AudioCalibration["f0"]): number {
  const st = (h: number) => 12 * Math.log2(h / f0.medianHz);
  const level = 1 + (4 * (st(hz) - st(f0.lowHz))) / (st(f0.highHz) - st(f0.lowHz));
  return Math.min(5.5, Math.max(0.5, level));
}

/** Fundamental frequency of one frame (YIN difference function), or null when it's quiet or unvoiced. */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 60, maxHz = 600): number | null {
  let energy = 0;
  for (const x of buf) energy += x * x;
  if (Math.sqrt(energy / buf.length) < 0.01) return null;
  const W = Math.floor(buf.length / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz)), maxLag = Math.min(W - 1, Math.ceil(sampleRate / minHz));
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = buf[i] - buf[i + lag]; s += v * v; }
    d[lag] = s;
  }
  // Cumulative-mean-normalized difference; the first dip under the threshold, followed to its bottom, is the period.
  const cmnd = new Float32Array(maxLag + 1).fill(1);
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) { running += d[lag]; cmnd[lag] = running ? (d[lag] * lag) / running : 1; }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (cmnd[lag] >= 0.15) continue;
    while (lag + 1 < maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
    // Parabolic interpolation around the minimum for sub-sample precision.
    const a = cmnd[lag - 1], b = cmnd[lag], c = cmnd[lag + 1];
    const den = a - 2 * b + c;
    const shift = den ? Math.max(-1, Math.min(1, (a - c) / (2 * den))) : 0;
    return sampleRate / (lag + shift);
  }
  return null;
}

export interface Correction { index: number; from: number; to: number; label: string }

/** Up to three arrows from your curve to the target: start, the worst point in between, and the end.
 *  Only where you left the "close enough" band, so a matched syllable gets none. */
export function corrections(you: number[], target: number[]): Correction[] {
  if (you.length !== target.length || you.length < 3) return [];
  const off = (i: number) => target[i] - you[i];
  const out: Correction[] = [];
  const last = you.length - 1;
  if (Math.abs(off(0)) > TOLERANCE) out.push({ index: 0, from: you[0], to: target[0], label: off(0) > 0 ? "Start higher" : "Start lower" });
  let worst = -1;
  for (let i = 1; i < last; i++) if (Math.abs(off(i)) > TOLERANCE && (worst < 0 || Math.abs(off(i)) > Math.abs(off(worst)))) worst = i;
  if (worst > 0) {
    const rising = target[last] > target[0] + 1;
    out.push({ index: worst, from: you[worst], to: target[worst], label: off(worst) > 0 ? (rising ? "Rise sooner" : "Stay higher here") : "Go lower here" });
  }
  if (Math.abs(off(last)) > TOLERANCE) out.push({ index: last, from: you[last], to: target[last], label: off(last) > 0 ? "Finish higher" : "Finish lower" });
  return out;
}

export interface KeyPoint { name: string; you: number; target: number; verdict: "ok" | "too high" | "too low" | "too early" | "too late"; unit: "level" | "time" }

/** Where the curve starts, how low it goes and when, and where it ends: you against the target. */
export function keyPoints(you: number[], target: number[]): KeyPoint[] {
  if (you.length < 2 || you.length !== target.length) return [];
  const minAt = (p: number[]) => p.indexOf(Math.min(...p)) / (p.length - 1);
  const height = (name: string, a: number, b: number): KeyPoint =>
    ({ name, you: a, target: b, unit: "level", verdict: Math.abs(a - b) <= TOLERANCE ? "ok" : a > b ? "too high" : "too low" });
  const t = (a: number, b: number): KeyPoint =>
    ({ name: "Lowest point at", you: a, target: b, unit: "time", verdict: Math.abs(a - b) <= 0.25 ? "ok" : a > b ? "too late" : "too early" });
  const points = [height("Start", you[0], target[0]), height("Lowest point", Math.min(...you), Math.min(...target))];
  // Timing of the low point only means something for shapes that dip; a fall or a level tone has none.
  if (minAt(target) > 0 && minAt(target) < 1) points.push(t(minAt(you), minAt(target)));
  points.push(height("End", you.at(-1)!, target.at(-1)!));
  return points;
}

/** The target level at a fraction of the way through a syllable, for the live hint. */
export function targetAt(target: number[], progress: number): number {
  const x = Math.min(1, Math.max(0, progress)) * (target.length - 1), i = Math.floor(x), f = x - i;
  return i >= target.length - 1 ? target.at(-1)! : target[i] + (target[i + 1] - target[i]) * f;
}

/* ---------- live tracking: which syllable a pitch frame belongs to ---------- */

export interface LiveState { cur: number; start: number; lastVoiced: number; prev: number | null; recent: number[]; rejects: number }
export const liveState = (): LiveState => ({ cur: -1, start: 0, lastVoiced: -Infinity, prev: null, recent: [], rejects: 0 });

export const LIVE = {
  syllableMs: 450,   // a syllable said on its own lasts roughly this long; your line is stretched to it
  gapMs: 140,        // silence longer than this may start the next syllable…
  minRun: 0.6,       // …but only once the current one has run this much of syllableMs (tone 3 often creaks silent)
  octave: 1.8,       // a jump this big between frames is the tracker slipping an octave, not your voice
};

/** Feeds one frame (tone level, or null when unvoiced) at time `now` into the tracker. Returns the point to draw,
 *  or null. Mutates `s`. */
export function liveStep(s: LiveState, now: number, level: number | null, syllables: number): { syllable: number; progress: number; level: number } | null {
  if (level === null) {
    if (now - s.lastVoiced > LIVE.gapMs) { s.prev = null; s.recent = []; }
    return null;
  }
  if (now - s.lastVoiced > LIVE.gapMs) {
    const ran = s.cur < 0 ? Infinity : (now - s.start) / LIVE.syllableMs;
    // A pause starts the next syllable; a short dropout (creak), or voicing after the last syllable, stays put.
    if (s.cur < 0 || (ran >= LIVE.minRun && s.cur + 1 < syllables)) { s.cur++; s.start = now; s.prev = null; s.recent = []; s.rejects = 0; }
  }
  s.lastVoiced = now;
  if (s.prev !== null && Math.abs(level - s.prev) > LIVE.octave) {
    // Usually a slip; but if it persists, the earlier frame was the slip (often at the consonant), so start over.
    if (++s.rejects < 3) return null;
    s.prev = null; s.recent = [];
  }
  s.rejects = 0;
  s.recent.push(level);
  if (s.recent.length > 3) s.recent.shift();
  const smoothed = [...s.recent].sort((a, b) => a - b)[s.recent.length >> 1];   // median of the last three frames
  s.prev = smoothed;
  const progress = (now - s.start) / LIVE.syllableMs;
  return progress > 1.2 ? null : { syllable: s.cur, progress: Math.min(1, progress), level: smoothed };
}
