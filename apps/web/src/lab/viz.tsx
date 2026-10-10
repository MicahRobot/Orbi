// The Lab's charts, drawn from real take data (model.ts). Shapes follow Orbi Lab.dc.html, quieter: hairline grids,
// one accent per meaning (purple = native/target, coral = you), and motion only when a new take arrives.
import { memo, useEffect, useId, useRef, useState } from "react";
import type { CardView, SyllableView, TakeView } from "./model";
import { TOLERANCE } from "./pitch";

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

const unit = (level: number) => Math.min(1, Math.max(0, (level - 0.5) / 5));   // tone level 0.5–5.5 → 0–1
const BAND = TOLERANCE / 5;                                                      // "close enough", in 0–1 units

/** Upper edge forward, lower edge back: the "close enough" corridor around a target line. */
function band(pts: [number, number][], halfHeight: number): string {
  const up = smooth(pts.map(([x, y]) => [x, y - halfHeight]));
  const down = smooth([...pts].reverse().map(([x, y]) => [x, y + halfHeight]));
  return `${up} L${down.slice(1)} Z`;
}

function ArrowHead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
      </marker>
    </defs>
  );
}

/** Native line in its "close enough" corridor and your line; on flagged syllables, the points that left the
 *  corridor and arrows saying where to move (corrections() in pitch.ts). */
export const PitchChart = memo(function PitchChart({ syllables }: { syllables: SyllableView[] }) {
  const W = 680, H = 236, L = 44, R = 8, top = 16, ph = 172, n = Math.max(syllables.length, 1), sw = (W - L - R) / n;
  const y = (v: number) => top + (1 - v) * ph;
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
      aria-label={`Pitch per syllable, native line in a close-enough band and yours: ${syllables.map((s) => `${s.label}${s.flag ? `: ${s.corrections.map((c) => c.label.toLowerCase()).join(", ") || "needs work"}` : " matched"}`).join("; ")}`}>
      <ArrowHead id={id} />
      {[0, 0.5, 1].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />)}
      <text x={L - 10} y={y(1) + 4} textAnchor="end" className="axis">High</text>
      <text x={L - 10} y={y(0) + 4} textAnchor="end" className="axis">Low</text>
      {syllables.map((s, i) => {
        const x0 = L + i * sw, pad = Math.min(24, sw * 0.12);
        const xAt = (k: number, len: number) => x0 + pad + (k * (sw - 2 * pad)) / Math.max(len - 1, 1);
        const pts = (p: number[]) => p.map((v, k): [number, number] => [xAt(k, p.length), y(v)]);
        const off = s.flag ? s.you.map((v, k) => (Math.abs(v - (s.native[k] ?? v)) > BAND ? k : -1)).filter((k) => k >= 0) : [];
        return (
          <g key={i}>
            {s.flag && <rect x={x0 + 4} y={top - 8} width={sw - 8} height={ph + 16} rx={12} className="flag" />}
            {i > 0 && <line x1={x0} x2={x0} y1={top} y2={top + ph} className="divider" />}
            <path d={band(pts(s.native), BAND * ph)} className="band" />
            <path d={smooth(pts(s.native))} className="native" pathLength={1} style={{ animationDelay: `${i * 90}ms` }} />
            {s.you.length > 1 && <path d={smooth(pts(s.you))} className="you" pathLength={1} style={{ animationDelay: `${260 + i * 90}ms` }} />}
            {off.map((k) => <circle key={k} cx={xAt(k, s.you.length)} cy={y(s.you[k])} r={3.5} className="off" />)}
            {s.corrections.map((c) => {
              const x = xAt(c.index, s.you.length), y1 = y(unit(c.from)), y2 = y(unit(c.to)), dir = Math.sign(y2 - y1);
              const right = c.index < (s.you.length - 1) / 2 || sw < 200 ? x + 10 : x - 10;
              return (
                <g key={c.index} className="fix-arrow">
                  <line x1={x} y1={y1 + dir * 7} x2={x} y2={y2 - dir * 4} markerEnd={`url(#${id})`} />
                  <text x={right} y={(y1 + y2) / 2 + 4} textAnchor={right > x ? "start" : "end"}>{c.label}</text>
                </g>
              );
            })}
            <text x={x0 + sw / 2} y={H - 10} textAnchor="middle" className={`syl ${s.flag ? "flagged" : ""}`}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
});

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** "How your voice should move": drag (or play) to morph your curve into the native one. */
export function PitchMorph({ you, native }: { you: number[]; native: number[] }) {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const W = 420, H = 170, L = 40, R = 10, top = 14, ph = 132;
  const y = (level: number) => top + (1 - unit(level)) * ph;
  const x = (k: number) => L + (k * (W - L - R)) / 9;
  const e = easeInOut(t);
  const mid = you.map((v, k) => v + ((native[k] ?? v) - v) * e);
  const play = () => {
    cancelAnimationFrame(raf.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setT(t < 0.5 ? 1 : 0);
    const from = t >= 0.99 ? 0 : t, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, from + (now - t0) / 1400);
      setT(k);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  return (
    <div className="morph">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Your pitch curve ${Math.round(t * 100)}% of the way to the native curve`}>
        {[1, 3, 5].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />)}
        <text x={L - 8} y={y(5) + 4} textAnchor="end" className="axis">High</text>
        <text x={L - 8} y={y(1) + 4} textAnchor="end" className="axis">Low</text>
        <path d={band(native.map((v, k) => [x(k), y(v)]), BAND * ph)} className="band" />
        <path d={smooth(native.map((v, k) => [x(k), y(v)]))} className="native ghost" />
        <path d={smooth(mid.map((v, k) => [x(k), y(v)]))} className="you still" />
      </svg>
      <div className="morph-controls">
        <span className="faint">Yours</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(t * 100)} onChange={(ev) => { cancelAnimationFrame(raf.current); setT(Number(ev.target.value) / 100); }}
          aria-label="Morph your curve into the native one" />
        <span className="faint">Native</span>
        <button className="btn quiet small" onClick={play}>{t >= 0.99 ? "Replay" : "Play"}</button>
      </div>
    </div>
  );
}

/** Start, lowest point (how low and when) and end: you (dot) against the target (ring), per syllable. */
export function KeyPoints({ rows }: { rows: TakeView["keyPoints"] }) {
  const W = 560, L = 150, R = 120, X = (v: number) => L + unit(v) * (W - L - R), T = (f: number) => L + f * (W - L - R);
  return (
    <div className="keypoints">
      {rows.filter((r) => r.points.length).map((r) => (
        <figure key={r.label} className="kp">
          <figcaption lang="zh-Hans">{r.label}</figcaption>
          <svg viewBox={`0 0 ${W} ${r.points.length * 30 + 24}`} className="chart" role="img"
            aria-label={`${r.label}: ${r.points.map((p) => `${p.name.toLowerCase()} ${p.verdict}`).join(", ")}`}>
            <text x={L} y={r.points.length * 30 + 18} className="axis">{"Low · early"}</text>
            <text x={W - R} y={r.points.length * 30 + 18} textAnchor="end" className="axis">{"High · late"}</text>
            {r.points.map((p, i) => {
              const yy = 16 + i * 30, a = p.unit === "time" ? T(p.you) : X(p.you), b = p.unit === "time" ? T(p.target) : X(p.target);
              return (
                <g key={p.name}>
                  <text x={0} y={yy + 4} className="kp-name">{p.name}</text>
                  <line x1={L} x2={W - R} y1={yy} y2={yy} className="grid" />
                  <line x1={Math.min(a, b)} x2={Math.max(a, b)} y1={yy} y2={yy} className={`kp-gap ${p.verdict === "ok" ? "ok" : ""}`} />
                  <circle cx={b} cy={yy} r={7} className="kp-target" />
                  <circle cx={a} cy={yy} r={5.5} className="kp-you" />
                  <text x={W - R + 14} y={yy + 4} className={`kp-verdict ${p.verdict === "ok" ? "ok" : ""}`}>{p.verdict === "ok" ? "On target" : cap(p.verdict)}</text>
                </g>
              );
            })}
          </svg>
        </figure>
      ))}
    </div>
  );
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

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
