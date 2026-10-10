// A side view of where the tongue should be (target ring) and where it probably was (dot), from insightsFor().
import type { TonguePosition } from ".";

const W = 220, H = 140, PAD = 28;
const x = (front: number) => PAD + (1 - front) * (W - 2 * PAD);     // front of the mouth on the left
const y = (height: number) => PAD + (1 - height) * (H - 2 * PAD);

export function TongueMap({ you, target, label = "Tongue position" }: { you: TonguePosition | null; target: TonguePosition; label?: string }) {
  const where = (p: TonguePosition) => `${p.front > 0.5 ? "front" : "back"}, ${p.height > 0.5 ? "high" : "low"}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img"
      aria-label={`${label}: target ${where(target)}; yours ${you ? where(you) : "unknown"}`}>
      <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} rx={14} fill="currentColor" opacity={0.05} />
      <text x={PAD} y={PAD - 10} fontSize={11} fill="currentColor" opacity={0.6}>front (ee)</text>
      <text x={W - PAD} y={PAD - 10} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">back (oo)</text>
      <text x={PAD - 6} y={y(1) + 4} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">high</text>
      <text x={PAD - 6} y={y(0) + 4} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">low</text>
      <circle cx={x(target.front)} cy={y(target.height)} r={14} fill="none" stroke="#6C4CF5" strokeWidth={3} strokeDasharray="5 4" />
      {you && <circle cx={x(you.front)} cy={y(you.height)} r={8} fill="#FF6B4A" />}
      {you && <line x1={x(you.front)} y1={y(you.height)} x2={x(target.front)} y2={y(target.height)} stroke="#FF6B4A" strokeWidth={2} opacity={0.4} />}
      {!you && <text x={W / 2} y={H / 2 + 4} fontSize={12} textAnchor="middle" fill="currentColor" opacity={0.6}>needs the camera</text>}
    </svg>
  );
}
