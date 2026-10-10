// Audio service client (SPEC.md "Endpoints"). VITE_AUDIO_MODE=live calls the service; fixture mode never uses it.
import type { AudioAnalysis, AudioCalibration, Calibration, CoachResponse, FeedbackItem, L1Code, PromptItem } from "@shared/contracts/types";
import { targetsFor } from "../diagnosis";

export const LIVE_AUDIO = import.meta.env.VITE_AUDIO_MODE === "live";
export const LIVE_FACE = import.meta.env.VITE_FACE_MODE === "live";
const BASE = import.meta.env.VITE_AUDIO_URL || "http://localhost:8000";

async function post<T>(path: string, body: FormData | string, timeoutMs: number): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST", body, signal: AbortSignal.timeout(timeoutMs),
    ...(typeof body === "string" && { headers: { "Content-Type": "application/json" } }),
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function analyze(prompt: PromptItem, wav: Blob, calibration: Calibration): Promise<AudioAnalysis> {
  const form = new FormData();
  form.append("audio", wav, `${prompt.id}.wav`);
  form.append("meta", JSON.stringify({ promptId: prompt.id, targets: targetsFor(prompt), calibration: calibration.audio }));
  return post("/analyze", form, 10_000);
}

export type CalibrationTakes = Record<"glide" | "ee" | "oo" | "ah", Blob>;

export function calibrateAudio(takes: CalibrationTakes): Promise<AudioCalibration> {
  const form = new FormData();
  for (const [name, wav] of Object.entries(takes)) form.append(name, wav, `${name}.wav`);
  return post("/calibrate/audio", form, 10_000);
}

/** Gemini's rewrite of each card. Never throws: an empty list means keep the template text. */
export async function coach(prompt: PromptItem, items: FeedbackItem[], l1: L1Code): Promise<CoachResponse["tips"]> {
  if (!items.length) return [];
  try {
    // 3 s: the service gives Gemini 2.5 s and then answers with the template itself.
    return (await post<CoachResponse>("/coach", JSON.stringify({ prompt, items, l1 }), 3000)).tips;
  } catch (e) {
    console.warn("Coaching unavailable, keeping the template text", e);
    return [];
  }
}
