// A running face loop that screens share: live features for overlays, and per-take frame buffers on the audio clock.
import type { FaceFeatures } from "@shared/contracts/types";
import { EYE_L, EYE_R, NOSE_TIP, type Point, features, pose } from "./features";
import { type Frame, startFaceLoop } from "./landmarker";

export interface FaceSession {
  /** Latest frame: features, pixel landmarks, a friendly quality hint ("" when fine) and frames per second. */
  live: () => { features: FaceFeatures; points?: Point[]; hint: string; fps: number };
  /** Start buffering frames for a take. */
  begin: () => void;
  /** Stop buffering; frames come back with t in seconds from t0 (the recorder's performance.now() at capture start). */
  end: (t0: number) => FaceFeatures[];
  stop: () => void;
}

/** SPEC.md Module D live checks: face in view, close enough, facing the camera. */
export function qualityHint(points: Point[] | undefined, seenShare: number): string {
  if (seenShare < 0.8) return "Keep your face in view";
  if (!points) return "";
  const eye = Math.hypot(points[EYE_L].x - points[EYE_R].x, points[EYE_L].y - points[EYE_R].y);
  if (eye < 60) return "Move a little closer";
  if (Math.abs(points[NOSE_TIP].x - (points[EYE_L].x + points[EYE_R].x) / 2) > 0.15 * eye) return "Face the camera";
  return "";
}

/** A held calibration pose from the central 40% of a take, like the audio side. */
export const centralPose = (frames: FaceFeatures[], durationSec: number) =>
  pose(frames.filter((f) => f.t >= 0.3 * durationSec && f.t <= 0.7 * durationSec));

export async function startFaceSession(video: HTMLVideoElement, onFrame?: (frame: Frame) => void): Promise<FaceSession> {
  let latest = { features: features(0, undefined, undefined), points: undefined as Point[] | undefined, hint: "", fps: 0 };
  let buffer: FaceFeatures[] | null = null;
  const seen: number[] = [];
  let last = performance.now(), count = 0;
  const stop = await startFaceLoop(video, (fr) => {
    const f = features(fr.now, fr.points, fr.shapes);   // t = performance.now() until end() re-times it
    buffer?.push(f);
    seen.push(f.detected ? 1 : 0);
    if (seen.length > 90) seen.shift();                // about 3 s at camera rate
    count++;
    if (fr.now - last > 1000) { latest.fps = Math.round((count * 1000) / (fr.now - last)); count = 0; last = fr.now; }
    latest = { ...latest, features: f, points: fr.points, hint: qualityHint(fr.points, seen.reduce((a, b) => a + b, 0) / seen.length) };
    onFrame?.(fr);
  });
  return {
    live: () => latest,
    begin: () => { buffer = []; },
    end: (t0) => { const frames = (buffer ?? []).map((f) => ({ ...f, t: (f.t - t0) / 1000 })); buffer = null; return frames; },
    stop,
  };
}
