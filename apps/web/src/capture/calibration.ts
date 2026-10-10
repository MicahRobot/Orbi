// The ~10 s voice + lip calibration, shared by onboarding and the Lab so both run the exact same takes:
// a relaxed face (camera only), a siren glide, then held "ee", "oo" and "ah". The audio goes to /calibrate/audio;
// the face poses come from the same takes (central 40%), and only become the calibration if all four are usable.
import type { Calibration, FaceFeatures } from "@shared/contracts/types";
import { calibrateAudio, type CalibrationTakes } from "../api/audio";
import { faceCalibrationFrom } from "../face/calibration";
import { pose } from "../face/features";
import { type FaceSession, centralPose } from "../face/session";
import { fixtureCalibration } from "../fixtures";
import { record } from "./recorder";

export interface CalStep { key: "relaxed" | keyof CalibrationTakes; sec: number; title: string; sub: string }

export const CAL_STEPS: CalStep[] = [
  { key: "relaxed", sec: 1, title: "Relax your face", sub: "Mouth closed, looking at the camera." },
  { key: "glide", sec: 3, title: "Slide from high to low", sub: "Like a siren: your highest comfortable note down to your lowest." },
  { key: "ee", sec: 2, title: "Hold “ee”", sub: "As in “see”. Keep it steady." },
  { key: "oo", sec: 2, title: "Hold “oo”", sub: "As in “food”. Keep it steady." },
  { key: "ah", sec: 2, title: "Hold “ah”", sub: "As in “father”. Keep it steady." },
];

/** The relaxed-face step only makes sense with a camera. */
export const stepsFor = (hasFace: boolean) => CAL_STEPS.filter((s) => hasFace || s.key !== "relaxed");

export interface CalProgress { index: number; phase: "prep" | "rec" }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs every step, reporting progress, and returns the calibration plus the raw takes (for download and tuning).
 *  Throws if the mic fails or /calibrate/audio rejects the takes; the caller keeps any previous calibration. */
export async function runCalibration(stream: MediaStream, face: FaceSession | undefined, opts: {
  onProgress: (p: CalProgress) => void;
  onLevel?: (rms: number) => void;
  prepMs?: number;
}): Promise<{ calibration: Calibration; takes: CalibrationTakes }> {
  const steps = stepsFor(!!face);
  const takes: Partial<CalibrationTakes> = {};
  const poses: Partial<Record<"neutral" | "ee" | "oo" | "ah", FaceFeatures | null>> = {};
  for (const [index, step] of steps.entries()) {
    opts.onProgress({ index, phase: "prep" });
    await sleep(opts.prepMs ?? 900);   // time to read the instruction
    opts.onProgress({ index, phase: "rec" });
    face?.begin();
    if (step.key === "relaxed") {
      await sleep(step.sec * 1000);
      poses.neutral = pose(face?.end(performance.now()) ?? []);
      continue;
    }
    const rec = await record(stream, { maxSec: step.sec, onLevel: opts.onLevel });
    const take = await rec.done;
    takes[step.key] = take.wav;
    const frames = face?.end(take.t0) ?? [];
    if (step.key !== "glide") poses[step.key] = centralPose(frames, step.sec);
  }
  const audio = await calibrateAudio(takes as CalibrationTakes);
  // Your own lips when all four poses came through; otherwise the sample face, which practice and the Lab ignore.
  const faceCal = faceCalibrationFrom(poses) ?? fixtureCalibration.face;
  return { calibration: { audio, face: faceCal, createdAt: new Date().toISOString() }, takes: takes as CalibrationTakes };
}
