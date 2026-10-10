// Landing (Orbi.dc.html, "01 Landing"): headline, one action, and a floating card that cycles through real
// Orbi results: the native curve against a learner's recorded attempt from shared/fixtures.
import { useEffect, useState } from "react";
import { fixtureAnalysis } from "../fixtures";
import { ChartLegend, PitchChart, TopBar } from "./shared";
import { toneMarks } from "./scoring";

const HERO = [
  { promptId: "ma4", variant: "t2_dip", text: "妈 麻 马 骂", gloss: "mother · hemp · horse · scold", tag: "Four tones", tint: "var(--purple-soft)", ink: "var(--purple-deep)" },
  { promptId: "nihao", variant: "full_dips", text: "你好", gloss: "hello", tag: "Tone change", tint: "var(--coral-soft)", ink: "var(--coral-ink)" },
  { promptId: "zhongguo", variant: "correct", text: "中国", gloss: "China", tag: "Tones 1 + 2", tint: "var(--sky-soft)", ink: "var(--sky-ink)" },
  { promptId: "nv", variant: "correct", text: "女", gloss: "woman", tag: "The ü sound", tint: "var(--yellow-soft)", ink: "var(--yellow-ink)" },
].map((h) => {
  const a = fixtureAnalysis(h.promptId, h.variant);
  return { ...h, syllables: a.syllables.map((s) => ({ label: toneMarks(s.target.pinyin), target: s.tone.targetChao, you: s.tone.producedChao })) };
});

export function Landing({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % HERO.length), 3600);
    return () => clearInterval(id);
  }, []);
  const h = HERO[i];
  return (
    <div className="shell">
      <TopBar><button className="btn ghost" onClick={onDemo}>Watch the demo</button></TopBar>
      <main className="landing">
        <div className="stack enter" style={{ alignItems: "center", gap: 22 }}>
          <h1>Find the <em>melody</em> of Mandarin.</h1>
          <p className="lead">Say a word. See your pitch next to a native speaker's, and what your lips and tongue are doing. Adjust until it sounds right.</p>
          <button className="btn primary big" onClick={onStart} autoFocus>Get started</button>
        </div>

        <div className="hero-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="pill" style={{ background: h.tint, color: h.ink }}>{h.tag}</span>
            <div className="hero-dots">
              {HERO.map((x, n) => (
                <button key={x.promptId} onClick={() => setI(n)} aria-label={`Show ${x.text}`} aria-pressed={n === i}
                  style={{ width: n === i ? 22 : 8, background: n === i ? "var(--ink)" : "rgba(27,21,52,.15)" }} />
              ))}
            </div>
          </div>
          <div className="say"><span lang="zh-Hans">{h.text}</span><span className="muted">{h.gloss}</span></div>
          <PitchChart syllables={h.syllables} animateKey={h.promptId} />
          <ChartLegend />
        </div>
      </main>
    </div>
  );
}
