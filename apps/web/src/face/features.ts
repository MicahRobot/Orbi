// Lip features, roundness and per-syllable summaries (SPEC.md Module D). Pure math, no MediaPipe.
import type { FaceCalibration, FaceFeatures, FaceSummary } from "@shared/contracts/types";

export interface Point { x: number; y: number }          // pixels
export interface Blendshape { categoryName: string; score: number }

// Landmark indices from SPEC.md Module D; check them by drawing on the preview.
export const EYE_L = 33, EYE_R = 263, MOUTH_L = 78, MOUTH_R = 308, LIP_TOP = 13, LIP_BOTTOM = 14, NOSE_TIP = 1;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function features(t: number, pts: Point[] | undefined, shapes: Blendshape[] | undefined): FaceFeatures {
  if (!pts || pts.length < 300) return { t, detected: false, lipWidth: 0, lipHeight: 0, pucker: 0, funnel: 0, jawOpen: 0, smile: 0 };
  const unit = dist(pts[EYE_L], pts[EYE_R]);
  const bs = (name: string) => shapes?.find((s) => s.categoryName === name)?.score ?? 0;
  return {
    t, detected: true,
    lipWidth: dist(pts[MOUTH_L], pts[MOUTH_R]) / unit,
    lipHeight: dist(pts[LIP_TOP], pts[LIP_BOTTOM]) / unit,
    pucker: bs("mouthPucker"), funnel: bs("mouthFunnel"), jawOpen: bs("jawOpen"),
    smile: (bs("mouthSmileLeft") + bs("mouthSmileRight")) / 2,
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const safeDiv = (a: number, b: number) => (Math.abs(b) < 1e-6 ? 0 : a / b);

/** 0 = like your "ee", 1 = like your "oo". */
export function roundness(f: FaceFeatures, cal: FaceCalibration): number {
  const widthTerm = safeDiv(cal.ee.lipWidth - f.lipWidth, cal.ee.lipWidth - cal.oo.lipWidth);
  const puckerTerm = safeDiv(f.pucker - cal.ee.pucker, cal.oo.pucker - cal.ee.pucker);
  return clamp01(0.6 * widthTerm + 0.4 * puckerTerm);
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Feature-wise median of the detected frames: a calibration pose from a held take. */
export function pose(frames: FaceFeatures[]): FaceFeatures | null {
  const d = frames.filter((f) => f.detected);
  if (!d.length) return null;
  const m = (k: keyof Omit<FaceFeatures, "t" | "detected">) => median(d.map((f) => f[k]));
  return { t: 0, detected: true, lipWidth: m("lipWidth"), lipHeight: m("lipHeight"), pucker: m("pucker"), funnel: m("funnel"), jawOpen: m("jawOpen"), smile: m("smile") };
}

const PAD = 0.04;   // widen each vowel window 40 ms per side to absorb sync error

/** Median roundness and jawOpen inside each syllable's vowel window; coverage = share of frames with a face. */
export function summarize(frames: FaceFeatures[], windows: { index: number; start: number; end: number }[], cal: FaceCalibration): FaceSummary[] {
  return windows.map(({ index, start, end }) => {
    const inWin = frames.filter((f) => f.t >= start - PAD && f.t <= end + PAD);
    const seen = inWin.filter((f) => f.detected);
    return {
      syllableIndex: index,
      roundness: seen.length ? median(seen.map((f) => roundness(f, cal))) : 0,
      jawOpen: seen.length ? median(seen.map((f) => f.jawOpen)) : 0,
      coverage: inWin.length ? seen.length / inWin.length : 0,
    };
  });
}
