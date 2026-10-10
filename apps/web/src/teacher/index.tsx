// Lane C owns this folder. The UI renders <TeacherHead pose highlight />: keep these props stable.
// PLACEHOLDER: a flat front-view mouth plus a tongue label. The real one is the 3D head in SPEC.md Module G.
import type { VowelClass } from "@shared/contracts/types";

export type TeacherPose = VowelClass | "a" | "rest";   // "other" shows as rest
export type TeacherHighlight = "lips" | "tongue" | null;

const SHAPES: Record<string, { rx: number; ry: number; lips: string; tongue: string }> = {
  i: { rx: 36, ry: 6, lips: "spread, like a slight smile", tongue: "high and forward" },
  y: { rx: 13, ry: 12, lips: "small tight circle", tongue: "high and forward, as for ee" },
  u: { rx: 13, ry: 12, lips: "small tight circle", tongue: "high and pulled back" },
  a: { rx: 24, ry: 22, lips: "open", tongue: "low" },
  rest: { rx: 24, ry: 4, lips: "relaxed", tongue: "relaxed" },
};

export function TeacherHead({ pose, highlight = null }: { pose: TeacherPose; highlight?: TeacherHighlight }) {
  const s = SHAPES[pose] ?? SHAPES.rest;
  const hot = "#d97706";
  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <svg viewBox="0 0 120 80" width={180} role="img" aria-label={`Lips ${s.lips}; tongue ${s.tongue}`}>
        <circle cx="60" cy="40" r="38" fill="none" stroke="currentColor" opacity={0.2} />
        <ellipse cx="60" cy="48" rx={s.rx} ry={s.ry} fill="none" strokeWidth={highlight === "lips" ? 4 : 2}
          stroke={highlight === "lips" ? hot : "currentColor"} />
      </svg>
      <figcaption style={{ fontSize: 14 }}>
        Lips: {s.lips}
        <br />
        <span style={highlight === "tongue" ? { color: hot, fontWeight: 700 } : undefined}>Tongue: {s.tongue}</span>
      </figcaption>
    </figure>
  );
}
