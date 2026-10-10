// Results screen (SPEC.md Module F, screen 4): match ring, guidance lights, pitch panel, teacher, fix cards, streak, details.
import type { AudioAnalysis, FeedbackItem } from "@shared/contracts/types";
import { STREAK_TO_MASTER } from "../data/progress";
import { TeacherHead, type TeacherHighlight } from "../teacher";
import type { Attempt } from "./App";
import { hanziOf, lightsFor, RING_WORD, SEVERITY_STATUS, toneMarks, type LightStatus, type Ring } from "./scoring";
import { WordHeader, poseFor, useRefAudio, play } from "./shared";

const ICON: Record<LightStatus, string> = { good: "✓", tip: "i", almost: "!", fix: "✕", off: "–" };
const STATUS_WORD: Record<LightStatus, string> = { good: "Good", tip: "Tip", almost: "Almost", fix: "Fix this", off: "Not checked" };

export interface DemoControls { step: number; total: number; beat?: string; onNext?: () => void; onExit: () => void }

export function Results({ attempt, onRetry, onNext, onHome, demo }: {
  attempt: Attempt; onRetry: () => void; onNext: () => void; onHome: () => void; demo?: DemoControls;
}) {
  const { prompt, audio, face, cards, match, ring, passed, streak, wavUrl, previous } = attempt;
  const refUrl = useRefAudio(prompt);
  const vowelWord = prompt.focus.includes("vowel");
  const highlight: TeacherHighlight = cards.find((c) => c.diagnosis.articulator === "lips")
    ? "lips" : cards.find((c) => c.diagnosis.articulator === "tongue") ? "tongue" : null;
  const shaky = audio.warnings.some((w) => w === "syllable_count_mismatch" || w === "noisy");

  return (
    <main className="page results">
      <nav className="topbar">
        <button className="btn ghost" onClick={demo ? demo.onExit : onHome}>{demo ? "Exit demo" : "← Home"}</button>
        {demo && <span className="badge">Demo {demo.step + 1} of {demo.total}{demo.beat && ` · ${demo.beat}`}</span>}
      </nav>

      <WordHeader prompt={prompt} compact />

      <div className="results-grid">
        <section className="card summary" aria-live="polite">
          <MatchRing match={match} ring={ring} />
          <p className={`streak ${passed ? "up" : ""}`}>
            {streak >= STREAK_TO_MASTER ? "Mastered! ★" : passed ? `${streak} of ${STREAK_TO_MASTER} in a row` : `${STREAK_TO_MASTER} in a row masters this word`}
          </p>
          <ul className="lights" aria-label="Guidance lights">
            {lightsFor(prompt, cards).map((l) => (
              <li key={l.part} className={`light ${l.status}`}>
                <span className="dot" aria-hidden>{ICON[l.status]}</span>
                <span><strong>{l.part}</strong>{(l.status === "tip" || l.status === "almost" || l.status === "fix") && <span className="sr-only"> {STATUS_WORD[l.status]}:</span>} {l.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="stack">
          {shaky && <p className="note">I wasn't sure where each syllable started, so this result may be a little off.</p>}
          {cards.length > 0 && <section className="stack">{cards.map((c, i) => <FixCard key={i} card={c} />)}</section>}
          {cards.length === 0 && passed && (
            <section className="card fix good">
              <h3>Nothing to fix</h3>
              <p>That sounded right. {streak >= STREAK_TO_MASTER ? "You've mastered this word." : `Say it ${STREAK_TO_MASTER - streak === 1 ? "once" : "twice"} more to master it.`}</p>
            </section>
          )}

          <section className="card">
            <h2 className="card-title">Your pitch</h2>
            <PitchPanel audio={audio} previous={previous} hanzi={hanziOf(prompt)} cards={cards} />
          </section>

          {vowelWord && (
            <section className="card teacher-card">
              <h2 className="card-title">What your mouth should do</h2>
              <TeacherHead pose={poseFor(prompt)} highlight={highlight} />
            </section>
          )}
        </div>
      </div>

      <div className="actions">
        {demo ? (
          demo.onNext ? <button className="btn primary big" onClick={demo.onNext}>Next beat →</button>
            : <button className="btn primary big" onClick={demo.onExit}>Finish demo</button>
        ) : (
          <>
            <button className={`btn big ${passed ? "" : "primary"}`} onClick={onRetry}>Try again</button>
            <button className={`btn big ${passed ? "primary" : ""}`} onClick={onNext}>Next word →</button>
          </>
        )}
        {wavUrl && <button className="btn" onClick={() => play(wavUrl)}>▶ Hear yourself</button>}
        {refUrl && <button className="btn" onClick={() => play(refUrl)}>▶ Hear it</button>}
      </div>

      <details className="card details">
        <summary>Details</summary>
        <table>
          <thead><tr><th>Syllable</th><th>Tone score</th><th>Off by (rmse)</th><th>Heard as</th><th>F1 / F2 / F3 (Hz)</th><th>Lip roundness</th></tr></thead>
          <tbody>
            {audio.syllables.map((s) => {
              const f = face.find((x) => x.syllableIndex === s.index);
              return (
                <tr key={s.index}>
                  <td>{toneMarks(s.target.pinyin)} <span className="muted">({s.target.variant}{s.tone.nearest !== s.target.variant && `, sounded like ${s.tone.nearest}`})</span></td>
                  <td>{s.tone.score}</td>
                  <td>{s.tone.rmse.toFixed(2)}</td>
                  <td>{s.vowel ? `${s.vowel.heardAs === "y" ? "ü" : s.vowel.heardAs} (${Math.round(s.vowel.confidence * 100)}%)` : "–"}</td>
                  <td>{s.vowel ? `${s.vowel.formants.F1} / ${s.vowel.formants.F2} / ${s.vowel.formants.F3}` : "–"}</td>
                  <td>{f ? <>{f.roundness.toFixed(2)}{f.snapshot && <img src={f.snapshot} alt="Your mouth at the middle of the vowel" className="snapshot" />}</> : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </main>
  );
}

function MatchRing({ match, ring }: { match: number; ring: Ring }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <figure className={`ring ${ring}`} role="img" aria-label={`Match ${match} out of 100: ${RING_WORD[ring]}`}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={r} className="ring-track" />
        <circle cx="64" cy="64" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - match / 100)} transform="rotate(-90 64 64)" />
        <text x="64" y="70" textAnchor="middle" className="ring-number">{match}</text>
      </svg>
      <figcaption className="ring-word"><span aria-hidden>{ICON[ring === "green" ? "good" : ring === "red" ? "fix" : "almost"]}</span> {RING_WORD[ring]}</figcaption>
    </figure>
  );
}

function FixCard({ card }: { card: FeedbackItem }) {
  const status = SEVERITY_STATUS[card.diagnosis.severity];
  return (
    <article className={`card fix ${status}`}>
      <h3><span className="dot" aria-hidden>{ICON[status]}</span> {card.title}</h3>
      <p>{card.coaching ?? card.instruction}</p>
      {card.l1Note && <aside className="l1-note">{card.l1Note}</aside>}
    </article>
  );
}

const COL = 170, TOP = 14, PLOT = 110, PAD = 22;
const yOf = (level: number) => TOP + ((5.5 - Math.max(0.5, Math.min(5.5, level))) / 5) * PLOT;
const path = (points: number[], col: number) =>
  points.map((v, i) => `${i ? "L" : "M"}${(col * COL + PAD + (i / (points.length - 1)) * (COL - 2 * PAD)).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");

/** Target (dashed) vs. learner (solid) on the 1–5 pitch scale, one column per syllable; the last try drawn faintly. */
function PitchPanel({ audio, previous, hanzi, cards }: { audio: AudioAnalysis; previous?: AudioAnalysis; hanzi: string[]; cards: FeedbackItem[] }) {
  const n = audio.syllables.length;
  const statusOf = (i: number) => {
    const sev = cards.find((c) => c.diagnosis.syllableIndex === i && c.diagnosis.articulator === "pitch")?.diagnosis.severity;
    return sev ? SEVERITY_STATUS[sev] : "good";
  };
  return (
    <div className="pitch">
      <svg viewBox={`0 0 ${n * COL} ${TOP + PLOT + 44}`} role="img" style={{ maxWidth: n * COL * 1.6 }}
        aria-label={audio.syllables.map((s) => `${toneMarks(s.target.pinyin)}: tone score ${s.tone.score}`).join("; ")}>
        {[1, 2, 3, 4, 5].map((level) => <line key={level} x1={0} x2={n * COL} y1={yOf(level)} y2={yOf(level)} className="grid" />)}
        <text x={4} y={yOf(5) - 3} className="axis">high</text>
        <text x={4} y={yOf(1) + 12} className="axis">low</text>
        {audio.syllables.map((s, i) => (
          <g key={s.index}>
            {i > 0 && <line x1={i * COL} x2={i * COL} y1={TOP - 6} y2={TOP + PLOT + 6} className="divider" />}
            {previous?.syllables[i] && <path d={path(previous.syllables[i].tone.producedChao, i)} className="curve previous" />}
            <path d={path(s.tone.targetChao, i)} className="curve target" />
            <path d={path(s.tone.producedChao, i)} className={`curve learner ${statusOf(i)}`} />
            <text x={i * COL + COL / 2} y={TOP + PLOT + 22} textAnchor="middle" className="syl">{hanzi[i]} {toneMarks(s.target.pinyin)}</text>
          </g>
        ))}
      </svg>
      <p className="legend"><span className="key target" /> target <span className="key learner" /> you {previous && <><span className="key previous" /> last try</>}</p>
      {audio.syllables.filter((s) => s.target.sandhiNote).map((s) => (
        <p key={s.index} className="sandhi">{hanzi[s.index]}: {s.target.sandhiNote}</p>
      ))}
    </div>
  );
}
