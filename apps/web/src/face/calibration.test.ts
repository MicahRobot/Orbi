import { describe, expect, it } from "vitest";
import type { FaceFeatures } from "@shared/contracts/types";
import { fixtureCalibration } from "../fixtures";
import { faceCalibrationFrom, usableFaceCalibration } from "./calibration";

const f = (lipWidth: number): FaceFeatures => ({ t: 0, detected: true, lipWidth, lipHeight: 0.1, pucker: 0, funnel: 0, jawOpen: 0.1, smile: 0 });

describe("face calibration", () => {
  it("rejects the sample (fixture) face, so live lips are never scored against someone else's", () => {
    expect(usableFaceCalibration(fixtureCalibration.face)).toBeNull();
    expect(usableFaceCalibration(undefined)).toBeNull();
  });
  it("accepts your own poses when ee and oo differ", () => {
    expect(faceCalibrationFrom({ neutral: f(0.4), ee: f(0.5), oo: f(0.3), ah: f(0.42) })).not.toBeNull();
  });
  it("rejects missing poses or an ee that looks like oo", () => {
    expect(faceCalibrationFrom({ neutral: f(0.4), ee: f(0.5), oo: null, ah: f(0.42) })).toBeNull();
    expect(faceCalibrationFrom({ neutral: f(0.4), ee: f(0.41), oo: f(0.4), ah: f(0.42) })).toBeNull();
  });
});
