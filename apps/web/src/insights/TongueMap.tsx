// A side view of where the tongue should be (dashed ring) and where it probably was (dot), from insightsFor().
import type { TonguePosition } from ".";

const W = 280, H = 160, L = 44, R = W - 12, T = 12, B = H - 30, IN = 20;
const x = (front: number) => L + IN + (1 - front) * (R - L - 2 * IN);     // front of the mouth on the left
const y = (height: number) => T + IN + (1 - height) * (B - T - 2 * IN);

export function TongueMap({ you, target, label = "Tongue position" }: { you: TonguePosition | null; target: TonguePosition; label?: string }) {
  const where = (p: TonguePosition) => `${p.front > 0.5 ? "front" : "back"}, ${p.height > 0.5 ? "high" : "low"}`;
  const text = { fontSize: 12, fill: "currentColor", opacity: 0.6 };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", color: "var(--ink-2, #5B5670)" }} role="img"
      aria-label={`${label}: target ${where(target)}; yours ${you ? where(you) : "unknown"}`}>
      <rect x={L} y={T} width={R - L} height={B - T} rx={14} fill="currentColor" opacity={0.06} />
      <text x={L - 8} y={T + 14} textAnchor="end" {...text}>high</text>
      <text x={L - 8} y={B - 4} textAnchor="end" {...text}>low</text>
      <text x={L} y={H - 10} {...text}>← front (“ee”)</text>
      <text x={R} y={H - 10} textAnchor="end" {...text}>back (“oo”) →</text>
      <circle cx={x(target.front)} cy={y(target.height)} r={15} fill="none" stroke="#6C4CF5" strokeWidth={3} strokeDasharray="5 4" />
      {you && <line x1={x(you.front)} y1={y(you.height)} x2={x(target.front)} y2={y(target.height)} stroke="#FF6B4A" strokeWidth={2} opacity={0.4} />}
      {you && <circle cx={x(you.front)} cy={y(you.height)} r={9} fill="#FF6B4A" stroke="#FFFFFF" strokeWidth={2} />}
      {!you && <text x={(L + R) / 2} y={(T + B) / 2 + 4} textAnchor="middle" {...text}>needs the camera</text>}
    </svg>
  );
}
