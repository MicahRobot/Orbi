// Small pieces more than one screen uses.
import { useEffect, useState, type ReactNode } from "react";
import type { PromptItem } from "@shared/contracts/types";
import type { TeacherPose } from "../teacher";

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button className="logo" onClick={onClick} aria-label="Orbi home" disabled={!onClick}>
      <span className="orb" aria-hidden /><span className="word">orbi</span>
    </button>
  );
}

export function TopBar({ onLogo, children }: { onLogo?: () => void; children?: ReactNode }) {
  return <header className="topbar"><Logo onClick={onLogo} /><div className="right">{children}</div></header>;
}

export type Status = "good" | "fix" | "almost" | "tip" | "unsure" | "off";
const ICON: Record<Status, string> = { good: "✓", fix: "✕", almost: "!", tip: "i", unsure: "?", off: "–" };

/** Every status shows color + icon + word. */
export function StatusText({ status, children }: { status: Status; children: ReactNode }) {
  return <span className={`st st-${status}`}><span className="ic" aria-hidden>{ICON[status]}</span>{children}</span>;
}

/** The teacher's target pose for a vowel word. */
export const poseFor = (prompt: PromptItem): TeacherPose => prompt.vowelTargets?.find((v) => v) ?? "rest";

/** `/ref/<id>.wav` if it exists. Vite answers missing files with index.html, so check that it's audio. */
export function useRefAudio(prompt: PromptItem): string | null {
  const url = prompt.refAudioUrl ?? `/ref/${prompt.id}.wav`;
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let current = true;
    setOk(false);
    fetch(url, { method: "HEAD" })
      .then((r) => current && setOk(r.ok && (r.headers.get("content-type") ?? "").startsWith("audio")))
      .catch(() => undefined);
    return () => { current = false; };
  }, [url]);
  return ok ? url : null;
}

export const play = (url: string) => void new Audio(url).play().catch((e) => console.warn("Couldn't play", url, e));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Smooth path through points (Catmull-Rom as cubic Béziers), as in the design's hero chart. */
function smooth(xy: [number, number][]): string {
  if (xy.length < 2) return "";
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] ?? p2;
    const c = (a: number, b: number) => (a / 6 + b).toFixed(1);
    d += ` C${c(p2[0] - p0[0], p1[0])},${c(p2[1] - p0[1], p1[1])} ${c(p1[0] - p3[0], p2[0])},${c(p1[1] - p3[1], p2[1])} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export interface ChartSyllable { label: string; target: number[]; you: number[]; previous?: number[] }

/** Native (purple) vs. you (coral) on the 1–5 pitch scale, one column per syllable. */
export function PitchChart({ syllables, height = 150, animateKey }: { syllables: ChartSyllable[]; height?: number; animateKey?: string }) {
  const W = 520, pad = 18, colW = (W - 2 * pad) / Math.max(syllables.length, 1);
  const y = (level: number) => pad + ((5.5 - Math.max(0.5, Math.min(5.5, level))) / 5) * (height - 2 * pad);
  const pts = (p: number[], i: number): [number, number][] =>
    p.map((v, j) => [pad + i * colW + 10 + (j / Math.max(p.length - 1, 1)) * (colW - 20), y(v)]);
  return (
    <div className="chart">
      <svg key={animateKey} viewBox={`0 0 ${W} ${height + 22}`} role="img"
        aria-label={syllables.map((s) => `${s.label}: ${s.you.length ? "your pitch shown against the native curve" : "no pitch heard"}`).join("; ")}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="grid" x1={pad} x2={W - pad} y1={pad + f * (height - 2 * pad)} y2={pad + f * (height - 2 * pad)} />)}
        <text className="axis" x={4} y={pad + 4}>high</text>
        <text className="axis" x={4} y={height - pad + 4}>low</text>
        {syllables.map((s, i) => (
          <g key={i}>
            {s.previous && s.previous.length > 1 && <path className="prev" d={smooth(pts(s.previous, i))} />}
            <path className="native" d={smooth(pts(s.target, i))} pathLength={1} strokeDasharray={1} />
            {s.you.length > 1 && <path className="you" d={smooth(pts(s.you, i))} pathLength={1} strokeDasharray={1} />}
            <text className="syl" x={pad + (i + 0.5) * colW} y={height + 14} textAnchor="middle">{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ChartLegend({ previous }: { previous?: boolean }) {
  return (
    <div className="legend">
      <span><i style={{ background: "var(--purple)" }} />Native</span>
      <span><i style={{ background: "var(--coral)" }} />You</span>
      {previous && <span><i style={{ background: "var(--coral)", opacity: 0.3 }} />Last try</span>}
    </div>
  );
}
