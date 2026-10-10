// Streaks and mastery from the attempt history (SPEC.md Module I: three passes in a row masters a word).
import type { AttemptRecord } from "@shared/contracts/types";

export const STREAK_TO_MASTER = 3;

/** Passes in a row at the end of this word's history (attempts in time order). */
export function streakFor(attempts: AttemptRecord[], promptId: string): number {
  let n = 0;
  for (const a of attempts) if (a.promptId === promptId) n = a.passed ? n + 1 : 0;
  return n;
}

/** Mastered once any three passes in a row happened; a later miss doesn't take it away. */
export function isMastered(attempts: AttemptRecord[], promptId: string): boolean {
  let n = 0;
  for (const a of attempts) {
    if (a.promptId !== promptId) continue;
    n = a.passed ? n + 1 : 0;
    if (n >= STREAK_TO_MASTER) return true;
  }
  return false;
}
