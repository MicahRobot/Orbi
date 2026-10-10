// Home (SPEC.md Module F, screen 2): practice sets as cards, a check on mastered words, demo mode, redo calibration.
import type { AttemptRecord } from "@shared/contracts/types";
import { LIVE_AUDIO } from "../api/audio";
import { PRACTICE_SETS, PROMPTS } from "../content/prompts";
import { isMastered, streakFor, STREAK_TO_MASTER } from "../data/progress";
import { supabase } from "../data/store";
import { toneMarks } from "./scoring";

export function Home({ attempts, onPractice, onDemo, onRecalibrate }: {
  attempts: AttemptRecord[]; onPractice: (promptId: string) => void; onDemo: () => void; onRecalibrate: () => void;
}) {
  return (
    <main className="page home">
      <header className="home-head">
        <div>
          <h1 className="brand">Orbi</h1>
          <p className="muted">Pick a word. Orbi listens, watches your lips and tells you what to fix.</p>
        </div>
        <button className="btn ghost small" onClick={onRecalibrate}>Redo calibration</button>
      </header>

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
                  <button className={`word-tile ${mastered ? "mastered" : ""}`} onClick={() => onPractice(id)}>
                    <span className={`hanzi ${p.pinyin.length > 2 ? "long" : ""}`} lang="zh-Hans">{p.hanzi}</span>
                    <span className="pinyin">{p.pinyin.map(toneMarks).join(" ")}</span>
                    <span className="gloss">{p.gloss}</span>
                    {mastered ? <span className="tag good">✓ Mastered</span>
                      : streak > 0 ? <span className="tag">{streak} of {STREAK_TO_MASTER}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="home-foot">
        <button className="btn" onClick={onDemo}>▶ Demo mode</button>
        <span className="muted small">
          {LIVE_AUDIO ? "Live microphone" : "Fixture mode: recorded results, no microphone needed"}
          {supabase ? " · progress syncs to Supabase" : " · progress saved in this browser"}
        </span>
      </footer>
    </main>
  );
}
