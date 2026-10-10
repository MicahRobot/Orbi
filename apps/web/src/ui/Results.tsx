// Results screen (SPEC.md Module F, screen 4): match ring, guidance lights, streak, then insights (what happened and
// how to fix it, per syllable: pitch from the curve, lips from the camera, tongue estimated from the sound),
// the Native-vs-You pitch chart, the teacher, and details.
// Insights are computed here from attempt.cards so Gemini's tips, which swap into the cards later, show up too.
import type { AudioCalibration } from "@shared/contracts/types";
import { STREAK_TO_MASTER } from "../data/progress";
import { type Insight, insightsFor } from "../insights";
import { TongueMap } from "../insights/TongueMap";
import { TeacherHead, type TeacherHighlight } from "../teacher";
import type { Attempt } from "./App";
import { hanziOf, lightsFor, RING_WORD, toneMarks, type Ring } from "./scoring";
import { ChartLegend, PitchChart, StatusText, TopBar, play, poseFor, useRefAudio, type Status } from "./shared";

export interface DemoControls { step: number; total: number; beat?: string; onNext?: () => void; onExit: () => void }

const AREA = { pitch: "Pitch", lips: "Lips", tongue: "Tongue", jaw: "Jaw" };
const STATUS_WORD: Record<Insight["status"], string> = { fix: "Fix this", tip: "Tip", unsure: "Not sure", good: "Good" };

export function Results({ attempt, calibration, onRetry, onNext, onHome, demo }: {
  attempt: Attempt; calibration: AudioCalibration; onRetry: () => void; onNext: () => void; onHome: () => void; demo?: DemoControls;
}) {
  const { prompt, audio, face, cards, match, ring, passed, streak, wavUrl, previous } = attempt;
  const refUrl = useRefAudio(prompt);
  const hanzi = hanziOf(prompt);
  const insights = insightsFor(prompt, audio, face, cards, calibration);
  const open = insights.filter((x) => x.status !== "good").sort((a, b) => rank(a) - rank(b));
  const good = insights.filter((x) => x.status === "good");
  const highlight: TeacherHighlight = cards.some((c) => c.diagnosis.articulator === "lips" && c.diagnosis.severity > 1) ? "lips"
    : cards.some((c) => c.diagnosis.articulator === "tongue" && c.diagnosis.severity > 1) ? "tongue" : null;
  const shaky = audio.warnings.some((w) => w === "syllable_count_mismatch" || w === "noisy");
  const charOf = (i: number) => hanzi[i] ?? audio.syllables[i]?.target.pinyin;

  return (
    <div className="shell">
      <TopBar onLogo={demo ? demo.onExit : onHome}>
        <button className="btn ghost" onClick={demo ? demo.onExit : onHome}>{demo ? "Exit demo" : "← All words"}</button>
      </TopBar>
      <main className="page">
        {demo && (
          <section className="demo-bar" aria-label="Demo mode">
            <span><span className="label">Demo {demo.step + 1} of {demo.total}</span>{demo.beat?.replace(/^\d+:\d+\s*/, "")}</span>
            {demo.onNext ? <button className="btn" onClick={demo.onNext}>Next →</button> : <button className="btn" onClick={demo.onExit}>Finish</button>}
          </section>
        )}

        <section className="card summary enter" aria-live="polite">
          <MatchRing match={match} ring={ring} />
          <div className="stack">
            <div className="row" style={{ alignItems: "baseline" }}>
              <h1 tabIndex={-1} lang="zh-Hans" style={{ fontFamily: "var(--hanzi)" }}>{prompt.hanzi}</h1>
              <span className="muted">{prompt.pinyin.map(toneMarks).join(" ")} · {prompt.gloss}</span>
            </div>
            <p className="streak" aria-label={`${Math.min(streak, STREAK_TO_MASTER)} of ${STREAK_TO_MASTER} in a row`}>
              {Array.from({ length: STREAK_TO_MASTER }, (_, i) => <i key={i} className={i < streak ? "on" : ""} />)}
              <span>{streak >= STREAK_TO_MASTER ? "Mastered!" : passed ? `${streak} of ${STREAK_TO_MASTER} in a row` : `${STREAK_TO_MASTER} in a row masters this word`}</span>
            </p>
            <ul className="lights" aria-label="Guidance lights">
              {lightsFor(prompt, cards).map((l) => (
                <li key={l.part} className={`bg-${l.status}`}><b>{l.part}</b><StatusText status={l.status as Status}>{l.text}</StatusText></li>
              ))}
            </ul>
          </div>
        </section>

        {shaky && <p className="note">I wasn't sure where each syllable started, so this result may be a little off.</p>}

        {open.length > 0 ? (
          <section className="stack" aria-labelledby="fix-h">
            <h2 id="fix-h">What to work on</h2>
            <div className="insights">{open.map((x, i) => <InsightCard key={i} x={x} char={charOf(x.syllableIndex)} />)}</div>
          </section>
        ) : (
          <section className="card stack">
            <h2>Nothing to fix</h2>
            <p className="muted">That sounded right. {streak >= STREAK_TO_MASTER ? "You've mastered this word." : `Say it ${STREAK_TO_MASTER - streak === 1 ? "once" : `${STREAK_TO_MASTER - streak} times`} more in a row to master it.`}</p>
          </section>
        )}

        {good.length > 0 && (
          <section className="goods" aria-label="What went well">
            {good.map((x, i) => <span key={i} className="pill bg-good"><StatusText status="good">{AREA[x.area]} · {charOf(x.syllableIndex)}: {x.headline.replace(/:.*$/, "")}</StatusText></span>)}
          </section>
        )}

        <section className="card stack">
          <h2>Your pitch</h2>
          <PitchChart animateKey={String(audio.durationSec) + audio.syllables.map((s) => s.tone.score).join()}
            syllables={audio.syllables.map((s, i) => ({ label: `${charOf(i)} ${toneMarks(s.target.pinyin)}`, target: s.tone.targetChao, you: s.tone.producedChao, previous: previous?.syllables[i]?.tone.producedChao }))} />
          <ChartLegend previous={!!previous} />
          {audio.syllables.filter((s) => s.target.sandhiNote).map((s) => <p key={s.index} className="note">{charOf(s.index)}: {s.target.sandhiNote}</p>)}
        </section>

        {prompt.focus.includes("vowel") && (
          <section className="card teacher">
            <h2>What your mouth should do</h2>
            <TeacherHead pose={poseFor(prompt)} highlight={highlight} />
          </section>
        )}

        <div className="actions">
          {demo ? null : (
            <>
              <button className={`btn big ${passed ? "" : "primary"}`} onClick={onRetry}>Try again</button>
              <button className={`btn big ${passed ? "primary" : ""}`} onClick={onNext}>Next word →</button>
            </>
          )}
          {wavUrl && <button className="btn" onClick={() => play(wavUrl)}>▶ Hear yourself</button>}
          {refUrl && <button className="btn" onClick={() => play(refUrl)}>🔊 Hear it</button>}
        </div>

        <details className="card">
          <summary>Details</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Syllable</th><th>Tone score</th><th>Off by (rmse)</th><th>Heard as</th><th>F1 / F2 / F3 (Hz)</th><th>Lip roundness</th></tr></thead>
              <tbody>
                {audio.syllables.map((s) => {
                  const f = face.find((x) => x.syllableIndex === s.index);
                  return (
                    <tr key={s.index}>
                      <td>{toneMarks(s.target.pinyin)} <span className="faint">({s.target.variant}{s.tone.nearest !== s.target.variant && `, sounded like ${s.tone.nearest}`})</span></td>
                      <td>{s.tone.score}</td>
                      <td>{s.tone.rmse.toFixed(2)}</td>
                      <td>{s.vowel ? `${s.vowel.heardAs === "y" ? "ü" : s.vowel.heardAs} (${Math.round(s.vowel.confidence * 100)}%)` : "–"}</td>
                      <td>{s.vowel ? `${s.vowel.formants.F1} / ${s.vowel.formants.F2} / ${s.vowel.formants.F3}` : "–"}</td>
                      <td>{f ? <>{f.roundness.toFixed(2)} <span className="faint">({Math.round(f.coverage * 100)}% seen)</span>{f.snapshot && <img src={f.snapshot} alt="Your mouth at the middle of the vowel" className="snapshot" />}</> : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </main>
    </div>
  );
}

const rank = (x: Insight) => ({ fix: 0, tip: 1, unsure: 2, good: 3 })[x.status];

function InsightCard({ x, char }: { x: Insight; char: string }) {
  return (
    <article className={`card insight ${x.status}`}>
      <div className="meta"><span>{AREA[x.area]} · <span lang="zh-Hans">{char}</span></span><StatusText status={x.status}>{STATUS_WORD[x.status]}</StatusText></div>
      <h3>{x.headline}</h3>
      <p className="muted">{x.what}</p>
      {x.lips && (
        <div className="lipmeter" aria-label={`Your lips: ${Math.round(x.lips.roundness * 100)}% of the way from ee to oo; target ${x.lips.target}`}>
          <span>spread</span>
          <span className="track">
            <span className="zone" style={x.lips.target === "spread" ? { left: 0, width: "30%" } : { left: "60%", right: 0 }} />
            <span className="thumb" style={{ left: `${x.lips.roundness * 100}%` }} />
          </span>
          <span>rounded</span>
        </div>
      )}
      {x.tongue && <TongueMap you={x.tongue.you} target={x.tongue.target} />}
      {x.how.length > 0 && <><b>Try this</b><ol>{x.how.map((h, i) => <li key={i}>{h}</li>)}</ol></>}
      {x.note && <p className="l1">{x.note}</p>}
    </article>
  );
}

function MatchRing({ match, ring }: { match: number; ring: Ring }) {
  const r = 62, c = 2 * Math.PI * r;
  const color = ring === "green" ? "var(--mint)" : ring === "red" ? "var(--coral)" : "var(--yellow)";
  const status: Status = ring === "green" ? "good" : ring === "red" ? "fix" : "almost";
  return (
    <figure className="ring" role="img" aria-label={`Match ${match} out of 100: ${RING_WORD[ring]}`}>
      <svg viewBox="0 0 150 150" aria-hidden>
        <circle cx="75" cy="75" r={r} className="track-c" />
        <circle cx="75" cy="75" r={r} className="fill-c" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - match / 100)} />
      </svg>
      <div className="num" aria-hidden><b>{match}</b><StatusText status={status}>{RING_WORD[ring]}</StatusText></div>
    </figure>
  );
}
