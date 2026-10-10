// A small, consistent icon set (24px grid, 1.8 stroke) so the Lab never leans on emoji.
import type { SVGProps } from "react";

const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});

export const Mic = ({ size }: { size?: number }) => (
  <svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
);
export const Speaker = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
export const Check = ({ size }: { size?: number }) => <svg {...base(size)} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const Cross = ({ size }: { size?: number }) => <svg {...base(size)} strokeWidth={2.4}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>;
export const Info = ({ size }: { size?: number }) => <svg {...base(size)} strokeWidth={2.4}><path d="M12 11v6" /><path d="M12 7.2v.1" /></svg>;
export const Question = ({ size }: { size?: number }) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M9.2 9a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1-1.3 1.9v.5" /><path d="M12 17.3v.1" /></svg>
);
export const Dash = ({ size }: { size?: number }) => <svg {...base(size)} strokeWidth={2.4}><path d="M7 12h10" /></svg>;
export const Tune = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const Play = ({ size }: { size?: number }) => <svg {...base(size)}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>;
export const Download = ({ size }: { size?: number }) => <svg {...base(size)}><path d="M12 4v11" /><path d="m7 10.5 5 5 5-5" /><path d="M5 20h14" /></svg>;
export const Upload = ({ size }: { size?: number }) => <svg {...base(size)}><path d="M12 20V9" /><path d="m7 13.5 5-5 5 5" /><path d="M5 4h14" /></svg>;
export const Close = ({ size }: { size?: number }) => <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const Camera = ({ size }: { size?: number }) => (
  <svg {...base(size)}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
);
export const Chevron = ({ size, open }: { size?: number; open?: boolean }) => (
  <svg {...base(size)} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}><path d="m6 9 6 6 6-6" /></svg>
);

/** The status glyph for a mark: always paired with a word on screen. */
export function MarkIcon({ mark, size = 12 }: { mark: string; size?: number }) {
  if (mark === "good") return <Check size={size} />;
  if (mark === "fix" || mark === "almost") return <Cross size={size} />;
  if (mark === "tip") return <Info size={size} />;
  if (mark === "unsure") return <Question size={size} />;
  return <Dash size={size} />;
}
