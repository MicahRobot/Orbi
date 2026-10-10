import { describe, expect, it } from "vitest";
import { L1S, l1NoteFor } from "./l1";

// Every issueId the diagnosis engine can emit (SPEC.md B5 and Module E).
const KNOWN = new Set([
  "t1_drift", "t1_low", "t2_shallow", "t2_late", "t3_not_low", "t3_full_in_context", "t4_shallow",
  "t4_low_start", "wrong_tone", "no_pitch",
  "y_glide", "y_lips_not_rounded", "y_tongue_back", "y_both", "y_ok_lips_hint", "u_fronted", "i_rounded",
]);

describe("L1 patterns", () => {
  it("only name issues the engine can emit", () => {
    for (const l of L1S) for (const p of l.patterns) for (const id of p.issueIds) expect(KNOWN.has(id), `${l.code}: ${id}`).toBe(true);
  });

  it("finds the note for a matching issue, and nothing otherwise", () => {
    expect(l1NoteFor("en", "y_tongue_back")).toMatch(/no ü/);
    expect(l1NoteFor("fr", "y_tongue_back")).toBeUndefined();
    expect(l1NoteFor("other", "wrong_tone")).toBeUndefined();
  });
});
