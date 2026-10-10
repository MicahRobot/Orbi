// Recorded results from shared/fixtures, so the app runs without the audio service or a camera.
// Regenerate them with: python3 shared/fixtures/make_fixtures.py
import type { AudioAnalysis, Calibration, FaceSummary, FixtureEntry } from "@shared/contracts/types";
import index from "@shared/fixtures/index.json";
import calibration from "@shared/fixtures/calibration.json";

const analyses = import.meta.glob<AudioAnalysis>("@shared/fixtures/analysis/*.json", { eager: true, import: "default" });
const faces = import.meta.glob<FaceSummary[]>("@shared/fixtures/face/*.json", { eager: true, import: "default" });

export const FIXTURES = index as FixtureEntry[];
export const fixtureCalibration = calibration as Calibration;

function pick<T>(files: Record<string, T>, promptId: string, variant: string): T {
  const hit = Object.entries(files).find(([path]) => path.endsWith(`/${promptId}.${variant}.json`));
  if (!hit) throw new Error(`No fixture ${promptId}.${variant}`);
  return hit[1];
}

export const fixtureAnalysis = (promptId: string, variant: string) => pick(analyses, promptId, variant);
export const fixtureFace = (promptId: string, variant: string) => pick(faces, promptId, variant);
