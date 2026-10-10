// Home (SPEC.md Module F, screen 2): practice sets as word cards, streaks and mastered words, demo mode,
// redo calibration, and "Start over" (back to the landing page, e.g. to show onboarding again).
import type { AttemptRecord } from "@shared/contracts/types";
import { LIVE_AUDIO, LIVE_FACE } from "../api/audio";
import { PRACTICE_SETS, PROMPTS } from "../content/prompts";
import { isMastered, streakFor, STREAK_TO_MASTER } from "../data/progress";
import { supabase } from "../data/store";
import { toneMarks } from "./scoring";
import { StatusText, TopBar } from "./shared";

export function Home({ attempts, onPractice, onDemo, onRecalibrate, onStartOver }: {
  attempts: AttemptRecord[]; onPractice: (promptId: string) => void; onDemo: () => void; onRecalibrate: () => void; onStartOver: () => void;
}) {
  return (
    <div className="shell">
      <TopBar>
        <button className="btn ghost" onClick={onRecalibrate}>Redo calibration</button>
        <button className="btn ghost" onClick={onStartOver}>Start over</button>
      </TopBar>
      <main className="page">
        <section className="stack enter">
          <h1 tabIndex={-1}>Pick a word</h1>
          <p className="muted">Orbi listens, watches your lips, and shows you exactly what to change.</p>
        </section>

        <section className="demo-bar" aria-label="Demo mode">
          <span><span className="label">Demo</span>Replays the six rehearsed attempts through these screens</span>
          <button className="btn" onClick={onDemo}>▶ Start demo</button>
        </section>

        {Object.entries(PRACTICE_SETS).map(([name, ids]) => (
          <section key={name} className="set" aria-labelledby={`set-${name}`}>
            <h2 id={`set-${name}`}>{name}</h2>
            <ul className="words">
              {ids.map((id) => {
                const p = PROMPTS.find((x) => x.id === id)!;
                const mastered = isMastered(attempts, id);
                const streak = streakFor(attempts, id);
                return (
                  <li key={id}>
                    <button className="word-tile" onClick={() => onPractice(id)} aria-label={`${p.hanzi}, ${p.gloss}${mastered ? ", mastered" : ""}`}>
                      <span className="hz" lang="zh-Hans">{p.hanzi}</span>
                      <span className="py">{p.pinyin.map(toneMarks).join(" ")}</span>
                      <span className="gl">{p.gloss}</span>
                      {mastered ? <span className="pill bg-good"><StatusText status="good">Mastered</StatusText></span>
                        : streak > 0 ? <span className="pill bg-off">{streak} of {STREAK_TO_MASTER} in a row</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="faint small">
          {LIVE_AUDIO ? `Live microphone${LIVE_FACE ? " and camera" : ""}` : "Fixture mode: recorded results, no microphone needed"}
          {supabase ? " · progress syncs to Supabase" : " · progress saved in this browser"}
        </p>
      </main>
    </div>
  );
}
