// Pure result logic behind the screens: match ring, guidance lights, pinyin display, word order.
// Rules: SPEC.md Module F and NOTES.md ("Match ring", "Guidance lights").
import type { AudioAnalysis, FeedbackItem, PromptItem } from "@shared/contracts/types";
import { PRACTICE_SETS } from "../content/prompts";

export type Ring = "green" | "amber" | "red";
export type LightStatus = "good" | "tip" | "almost" | "fix" | "off";
export type Part = "Pitch" | "Lips" | "Tongue";
export interface Light { part: Part; status: LightStatus; text: string }

export const RING_WORD: Record<Ring, string> = { green: "Nailed it", amber: "Almost", red: "Try again" };

/** Match = mean syllable tone score, capped at 40 on a syllable with a severity-3 card. Pass = no card of severity 2 or 3. */
export function summarize(audio: AudioAnalysis, cards: FeedbackItem[]): { match: number; passed: boolean; ring: Ring } {
  const capped = new Set(cards.filter((c) => c.diagnosis.severity === 3).map((c) => c.diagnosis.syllableIndex));
  const scores = audio.syllables.map((s) => (capped.has(s.index) ? Math.min(s.tone.score, 40) : s.tone.score));
  const match = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const worst = Math.max(0, ...cards.map((c) => c.diagnosis.severity));
  const passed = worst < 2;
  return { match, passed, ring: worst === 3 ? "red" : passed && match >= 80 ? "green" : "amber" };
}

const PART: Record<FeedbackItem["diagnosis"]["articulator"], Part> = { pitch: "Pitch", lips: "Lips", jaw: "Lips", tongue: "Tongue" };
export const SEVERITY_STATUS: Record<1 | 2 | 3, LightStatus> = { 1: "tip", 2: "almost", 3: "fix" };

/** Pitch is checked on every word; Lips and Tongue only on vowel words. A light shows its most severe card's title. */
export function lightsFor(prompt: PromptItem, cards: FeedbackItem[]): Light[] {
  const vowel = prompt.focus.includes("vowel");
  return (["Pitch", "Lips", "Tongue"] as const).map((part): Light => {
    const card = [...cards].sort((a, b) => b.diagnosis.severity - a.diagnosis.severity).find((c) => PART[c.diagnosis.articulator] === part);
    if (card) return { part, status: SEVERITY_STATUS[card.diagnosis.severity], text: card.title };
    return part === "Pitch" || vowel ? { part, status: "good", text: "Good" } : { part, status: "off", text: "Not part of this word" };
  });
}

const MARKS: Record<string, string> = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };

/** "nv3" → "nǚ". The mark goes on a or e, else on the o of "ou", else on the last vowel. */
export function toneMarks(syllable: string): string {
  const tone = Number(syllable.slice(-1));
  const s = syllable.replace(/\d$/, "").replace(/v/g, "ü");
  if (!(tone >= 1 && tone <= 4)) return s;
  const at = /[ae]/.test(s) ? s.search(/[ae]/) : s.includes("ou") ? s.indexOf("o") : Math.max(...[..."iouü"].map((v) => s.lastIndexOf(v)));
  return at < 0 ? s : s.slice(0, at) + MARKS[s[at]][tone - 1] + s.slice(at + 1);
}

/** One character per syllable: "妈 麻 马 骂" → ["妈", "麻", "马", "骂"]. */
export const hanziOf = (prompt: PromptItem) => [...prompt.hanzi.replace(/\s+/g, "")];

const ORDER = Object.values(PRACTICE_SETS).flat();
/** The word after this one, going through the practice sets in order and wrapping around. */
export const nextPromptId = (id: string) => ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];
