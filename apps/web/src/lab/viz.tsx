// The Lab's charts, drawn from real take data (model.ts). Shapes follow Orbi Lab.dc.html, quieter: hairline grids,
// one accent per meaning (purple = native/target, coral = you), and motion only when a new take arrives.
import { memo } from "react";
import type { CardView, SyllableView, TakeView } from "./model";

/** Smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(xy: [number, number][]): string {
  if (xy.length < 2) return "";
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(xy[0][0])},${f(xy[0][1])}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

export const Ring = memo(function Ring({ value, tone }: { value: number; tone: "good" | "almost" | "fix" }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 108 108" className="ring" aria-hidden>
      <circle cx="54" cy="54" r={r} className="ring-track" />
      <circle cx="54" cy="54" r={r} className={`ring-value t-${tone}`} strokeDasharray={c}
        style={{ ["--c" as string]: c, ["--o" as string]: c * (1 - value / 100) }} strokeDashoffset={c * (1 - value / 100)} />
    </svg>
  );
});

export const PitchChart = memo(function PitchChart({ syllables }: { syllables: SyllableView[] }) {
  const W = 680, H = 230, L = 44, R = 8, top = 14, ph = 168, n = Math.max(syllables.length, 1), sw = (W - L - R) / n;
  const y = (v: number) => top + (1 - v) * ph;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label={`Pitch per syllable, native line and yours: ${syllables.map((s) => `${s.label}${s.flag ? " needs work" : " matched"}`).join(", ")}`}>
      {[0, 0.5, 1].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />)}
      <text x={L - 10} y={y(1) + 4} textAnchor="end" className="axis">High</text>
      <text x={L - 10} y={y(0) + 4} textAnchor="end" className="axis">Low</text>
      {syllables.map((s, i) => {
        const x0 = L + i * sw, pad = Math.min(24, sw * 0.12);
        const pts = (p: number[]) => p.map((v, k): [number, number] => [x0 + pad + (k * (sw - 2 * pad)) / Math.max(p.length - 1, 1), y(v)]);
        return (
          <g key={i}>
            {s.flag && <rect x={x0 + 4} y={top - 6} width={sw - 8} height={ph + 12} rx={12} className="flag" />}
            {i > 0 && <line x1={x0} x2={x0} y1={top} y2={top + ph} className="divider" />}
            <path d={smooth(pts(s.native))} className="native" pathLength={1} style={{ animationDelay: `${i * 90}ms` }} />
            {s.you.length > 1 && <path d={smooth(pts(s.you))} className="you" pathLength={1} style={{ animationDelay: `${260 + i * 90}ms` }} />}
            <text x={x0 + sw / 2} y={H - 10} textAnchor="middle" className={`syl ${s.flag ? "flagged" : ""}`}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
});

/** Side view of the mouth (front on the left), as in the design: a trapezoid from high to low, front to back. */
export const TongueMap = memo(function TongueMap({ tongue, small }: { tongue: NonNullable<CardView["tongue"]>; small?: boolean }) {
  const W = 320, H = 190;
  const FH: [number, number] = [74, 42], BH: [number, number] = [296, 42], FL: [number, number] = [142, 158], BL: [number, number] = [262, 158];
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Keep dots a little inside the outline so the ring never touches the edge labels.
  const at = ([x, y]: [number, number]) => { const ix = 0.08 + x * 0.84, iy = 0.12 + y * 0.76; return lerp(lerp(FH, BH, ix), lerp(FL, BL, ix), iy); };
  const T = at(tongue.target), Y = tongue.you && at(tongue.you);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`tongue ${small ? "small" : ""} ${Y ? "" : "dim"}`} role="img"
      aria-label={`Tongue map: target ${tongue.target[0] < 0.5 ? "front" : "back"}; yours ${Y ? (tongue.you![0] < 0.5 ? "front" : "back") : "unknown"}`}>
      <text x={FH[0]} y={24} className="lbl">Front <tspan className="faint">(ee)</tspan></text>
      <text x={BH[0]} y={24} textAnchor="end" className="lbl">Back <tspan className="faint">(oo)</tspan></text>
      <text x={FH[0] - 12} y={FH[1] + 12} textAnchor="end" className="lbl faint">High</text>
      <text x={FL[0] - 12} y={FL[1]} textAnchor="end" className="lbl faint">Low</text>
      <polygon points={[FH, BH, BL, FL].map((p) => p.join(",")).join(" ")} className="mouth" />
      {Y && <line x1={T[0]} y1={T[1]} x2={Y[0]} y2={Y[1]} className="link" />}
      <circle cx={T[0]} cy={T[1]} r={15} className="target" />
      {Y && <circle cx={Y[0]} cy={Y[1]} r={8} className="you" />}
    </svg>
  );
});

export function LipsBar({ lips, small }: { lips: NonNullable<CardView["lips"]>; small?: boolean }) {
  return (
    <div className={`lipsbar ${small ? "small" : ""}`}>
      <div className="track" role="img" aria-label={`Your lips ${Math.round(lips.you * 100)}% of the way from your ee to your oo; target ${Math.round(lips.lo * 100)}–${Math.round(lips.hi * 100)}%`}>
        <span className="zone" style={{ left: `${lips.lo * 100}%`, width: `${(lips.hi - lips.lo) * 100}%` }} />
        <span className="you" style={{ left: `${lips.you * 100}%` }} />
      </div>
      <div className="ends"><span>ee · spread</span><span>oo · rounded</span></div>
    </div>
  );
}

export const MouthTimeline = memo(function MouthTimeline({ timeline }: { timeline: NonNullable<TakeView["timeline"]> }) {
  const W = 680, H = 132, top = 24, ph = 96;
  const y = (v: number) => top + (1 - v) * ph;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart timeline" role="img" aria-label="Lip width, pucker and jaw opening over the take, with each vowel shaded">
      {timeline.windows.map((w, i) => (
        <g key={i}>
          <rect x={w.a * W} y={top - 4} width={Math.max(2, (w.b - w.a) * W)} height={ph + 8} rx={8} className="win" />
          <text x={((w.a + w.b) / 2) * W} y={15} textAnchor="middle" className="winlbl">{w.label}</text>
        </g>
      ))}
      {timeline.series.map((s, j) => (
        <path key={j} d={smooth(s.map(([t, v]) => [t * W, y(v)]))} className={`s${j}`} pathLength={1} style={{ animationDelay: `${j * 100}ms` }} />
      ))}
    </svg>
  );
});
