// Live pitch while you speak: the target for each syllable in its "close enough" corridor, and your pitch drawn
// into it in real time, so you can steer while you're still saying the word. It's an approximation (in-browser
// pitch on short frames, a nominal syllable length); the verdict still comes from /analyze when you stop.
// The 30 Hz loop writes straight into the SVG, so nothing else on the page re-renders.
import { memo, useEffect, useMemo, useRef } from "react";
import type { AudioCalibration, PromptItem } from "@shared/contracts/types";
import { TOLERANCE, detectPitch, hzToLevel, liveState, liveStep, liveTargets, targetAt } from "./pitch";

const W = 680, H = 236, L = 44, R = 8, TOP = 16, PH = 172;
const unit = (level: number) => Math.min(1, Math.max(0, (level - 0.5) / 5));
const yOf = (level: number) => TOP + (1 - unit(level)) * PH;

function path(pts: [number, number][]) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export const LivePitch = memo(function LivePitch({ prompt, f0, tuned, analyser, listening, count }: {
  prompt: PromptItem;
  f0: AudioCalibration["f0"];
  tuned: boolean;           // false with the sample voice: draw the line but don't steer
  analyser: () => { an: AnalyserNode; rate: number } | null;
  listening: boolean;
  count: number | null;     // 3-2-1 before recording, null while listening
}) {
  const targets = useMemo(() => liveTargets(prompt), [prompt]);
  const n = targets.length, sw = (W - L - R) / n, pad = Math.min(24, sw * 0.12);
  const xAt = (i: number, f: number) => L + i * sw + pad + f * (sw - 2 * pad);
  const lines = useRef<(SVGPathElement | null)[]>([]);
  const dot = useRef<SVGCircleElement>(null);
  const hint = useRef<HTMLSpanElement>(null);

  // On narrow layouts the results column sits below the recorder: bring the live view into sight once.
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) {
      box.current!.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }, []);

  useEffect(() => {
    if (!listening) return;   // stopping freezes the line in place until the next take
    const segs: [number, number][][] = targets.map(() => []);
    const state = liveState();
    let buf: Float32Array<ArrayBuffer> | null = null;
    const setHint = (text: string, tone: string) => {
      if (!hint.current || hint.current.textContent === text) return;
      hint.current.textContent = text;
      hint.current.dataset.tone = tone;
    };
    lines.current.forEach((el) => el?.setAttribute("d", ""));
    dot.current?.setAttribute("opacity", "0");
    setHint(tuned ? "Speak now" : "Tune to your voice for live hints", "idle");
    const tick = () => {
      const a = analyser();
      if (!a) return;
      if (!buf || buf.length !== a.an.fftSize) buf = new Float32Array(a.an.fftSize);
      a.an.getFloatTimeDomainData(buf);
      const hz = detectPitch(buf, a.rate, Math.max(55, f0.lowHz * 0.7), Math.min(700, f0.highHz * 1.5));
      const p = liveStep(state, performance.now(), hz === null ? null : hzToLevel(hz, f0), n);
      if (!p) {
        if (hz === null) dot.current?.setAttribute("opacity", "0");
        return;
      }
      segs[p.syllable].push([xAt(p.syllable, p.progress), yOf(p.level)]);
      lines.current[p.syllable]?.setAttribute("d", path(segs[p.syllable]));
      dot.current?.setAttribute("cx", String(xAt(p.syllable, p.progress)));
      dot.current?.setAttribute("cy", String(yOf(p.level)));
      dot.current?.setAttribute("opacity", "1");
      // With someone else's voice range the direction could be wrong, so only steer once you're tuned.
      if (!tuned) return;
      const diff = targetAt(targets[p.syllable].target, p.progress) - p.level;
      const label = targets[p.syllable].label;
      if (Math.abs(diff) <= TOLERANCE) setHint(`On track · ${label}`, "ok");
      else setHint(`${diff > 0 ? "Go higher" : "Go lower"} · ${label}`, "move");
    };
    // A steady 30 Hz clock rather than animation frames: plenty for a line, and it keeps sampling even when the
    // browser throttles frames for a tab that isn't painted.
    const id = setInterval(tick, 33);
    return () => clearInterval(id);
  }, [listening, targets, f0, analyser, tuned]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={box} className="card live enter" aria-label="Live pitch">
      <div className="card-head">
        <h3>Live pitch</h3>
        <span ref={hint} className="live-hint" data-tone="idle" aria-hidden>{count !== null ? `Starting in ${count}…` : listening ? "Speak now" : "Checking…"}</span>
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Your pitch, drawn live against the target band for each syllable">
          {[0, 0.5, 1].map((v) => <line key={v} x1={L} x2={W - R} y1={TOP + (1 - v) * PH} y2={TOP + (1 - v) * PH} className="grid" />)}
          <text x={L - 10} y={TOP + 4} textAnchor="end" className="axis">High</text>
          <text x={L - 10} y={TOP + PH + 4} textAnchor="end" className="axis">Low</text>
          {targets.map((t, i) => {
            const pts = t.target.map((v, k): [number, number] => [xAt(i, k / 9), yOf(v)]);
            const band = (TOLERANCE / 5) * PH;
            const outline = [...pts.map(([x, y]) => [x, y - band]), ...[...pts].reverse().map(([x, y]) => [x, y + band])];
            return (
              <g key={`${prompt.id}-${i}`}>
                {i > 0 && <line x1={L + i * sw} x2={L + i * sw} y1={TOP} y2={TOP + PH} className="divider" />}
                <path d={`${path(outline as [number, number][])} Z`} className="band" />
                <path d={path(pts)} className="native ghost" />
                <path ref={(el) => { lines.current[i] = el; }} className="you live-line" d="" />
                <text x={L + i * sw + sw / 2} y={H - 10} textAnchor="middle" className="syl">{t.label}</text>
              </g>
            );
          })}
          <circle ref={dot} r={6} className="live-dot" opacity={0} />
        </svg>
      </div>
      <p className="faint small">A live estimate to steer by. Your full result appears when you stop.</p>
    </section>
  );
});
