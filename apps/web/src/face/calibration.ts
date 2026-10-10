// Is a face calibration the learner's own? Lip scores against someone else's "ee" and "oo" can flip lips vs. tongue,
// so practice only summarizes the face when this says yes (otherwise diagnose() goes audio-only).
import type { FaceCalibration, FaceFeatures } from "@shared/contracts/types";
import { fixtureCalibration } from "../fixtures";

const MIN_WIDTH_GAP = 0.03;   // "ee" and "oo" lip widths closer than this can't scale roundness

export function usableFaceCalibration(face: FaceCalibration | undefined): FaceCalibration | null {
  if (!face || JSON.stringify(face) === JSON.stringify(fixtureCalibration.face)) return null;
  return Math.abs(face.ee.lipWidth - face.oo.lipWidth) >= MIN_WIDTH_GAP ? face : null;
}

/** The four poses as a FaceCalibration, or null if any is missing or ee and oo can't be told apart. */
export function faceCalibrationFrom(poses: Partial<Record<"neutral" | "ee" | "oo" | "ah", FaceFeatures | null>>): FaceCalibration | null {
  const { neutral, ee, oo, ah } = poses;
  if (!neutral || !ee || !oo || !ah) return null;
  return usableFaceCalibration({ neutral, ee, oo, ah });
}
