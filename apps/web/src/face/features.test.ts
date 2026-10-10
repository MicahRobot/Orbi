import { describe, expect, it } from "vitest";
import type { FaceCalibration, FaceFeatures } from "@shared/contracts/types";
import { EYE_L, EYE_R, LIP_BOTTOM, LIP_TOP, MOUTH_L, MOUTH_R, type Point, features, pose, roundness, summarize } from "./features";

const f = (t: number, lipWidth: number, pucker: number, detected = true): FaceFeatures =>
  ({ t, detected, lipWidth, lipHeight: 0.1, pucker, funnel: 0, jawOpen: 0.2, smile: 0 });
const cal: FaceCalibration = { neutral: f(0, 0.8, 0.1), ee: f(0, 1.0, 0.0), oo: f(0, 0.6, 0.8), ah: f(0, 0.8, 0.1) };

describe("features", () => {
  it("scales lip distances by the eye-corner distance and reads blendshapes", () => {
    const pts: Point[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    pts[EYE_L] = { x: 0, y: 0 }; pts[EYE_R] = { x: 100, y: 0 };
    pts[MOUTH_L] = { x: 20, y: 80 }; pts[MOUTH_R] = { x: 80, y: 80 };
    pts[LIP_TOP] = { x: 50, y: 75 }; pts[LIP_BOTTOM] = { x: 50, y: 85 };
    const r = features(1, pts, [{ categoryName: "mouthPucker", score: 0.7 }, { categoryName: "mouthSmileLeft", score: 0.2 }, { categoryName: "mouthSmileRight", score: 0.4 }]);
    expect(r).toMatchObject({ detected: true, lipWidth: 0.6, lipHeight: 0.1, pucker: 0.7, smile: expect.closeTo(0.3) });
  });
  it("marks a frame without a face", () => expect(features(1, undefined, undefined).detected).toBe(false));
});

describe("roundness (SPEC.md Module D)", () => {
  it("is 0 at your ee, 1 at your oo, clamped outside", () => {
    expect(roundness(cal.ee, cal)).toBe(0);
    expect(roundness(cal.oo, cal)).toBe(1);
    expect(roundness(f(0, 0.8, 0.4), cal)).toBeCloseTo(0.5);
    expect(roundness(f(0, 1.3, 0), cal)).toBe(0);
  });
  it("doesn't blow up when ee and oo are identical", () => {
    expect(roundness(cal.ee, { ...cal, oo: cal.ee })).toBe(0);
  });
});

describe("summarize", () => {
  const frames = [f(0.1, 1.0, 0), f(0.2, 0.6, 0.8), f(0.25, 0.6, 0.8), f(0.3, 0.6, 0.8, false), f(0.9, 1.0, 0)];
  it("takes medians inside the padded vowel window and reports coverage", () => {
    const [s] = summarize(frames, [{ index: 0, start: 0.2, end: 0.28 }], cal);
    expect(s.syllableIndex).toBe(0);
    expect(s.roundness).toBe(1);
    expect(s.coverage).toBeCloseTo(2 / 3);   // 0.2, 0.25 seen; 0.3 missed
  });
  it("gives coverage 0 with no frames", () => {
    expect(summarize([], [{ index: 0, start: 0, end: 1 }], cal)[0].coverage).toBe(0);
  });
});

describe("pose", () => {
  it("is the feature-wise median of detected frames", () => {
    expect(pose([f(0, 1, 0), f(0, 0.8, 0.2), f(0, 0.9, 0.1), f(0, 5, 5, false)])).toMatchObject({ lipWidth: 0.9, pucker: 0.1 });
    expect(pose([f(0, 1, 0, false)])).toBeNull();
  });
});
