import { describe, expect, it } from "vitest";
import type { AttemptRecord } from "@shared/contracts/types";
import { isMastered, streakFor } from "./progress";

const tries = (...marks: string[]): AttemptRecord[] =>
  marks.map((m, i) => ({ promptId: m[0] === "n" ? "nv" : "ma4", passed: m.endsWith("+"), score: 90, issueIds: [], createdAt: `2026-10-10T12:00:0${i}Z` }));

describe("streakFor", () => {
  it("counts passes in a row at the end, per word", () => {
    expect(streakFor(tries("m+", "n-", "m+", "n+", "m+"), "ma4")).toBe(3);
    expect(streakFor(tries("m+", "n-", "m+", "n+", "m+"), "nv")).toBe(1);
  });

  it("resets on a miss and is 0 with no attempts", () => {
    expect(streakFor(tries("m+", "m+", "m-"), "ma4")).toBe(0);
    expect(streakFor([], "ma4")).toBe(0);
  });
});

describe("isMastered", () => {
  it("needs three passes in a row", () => {
    expect(isMastered(tries("m+", "m+", "m-", "m+", "m+"), "ma4")).toBe(false);
    expect(isMastered(tries("m+", "n-", "m+", "m+"), "ma4")).toBe(true);
  });

  it("stays mastered after a later miss", () => {
    expect(isMastered(tries("m+", "m+", "m+", "m-"), "ma4")).toBe(true);
  });
});
