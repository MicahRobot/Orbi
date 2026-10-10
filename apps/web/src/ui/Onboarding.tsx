// Onboarding (Orbi.dc.html flow + SPEC.md Module F): language → native language → level → goals → ~10 s voice and
// lip calibration → save. "Redo calibration" from Home re-enters at the calibration step and returns.
// Level and goals only shape the welcome; they aren't stored (the Profile contract has no place for them).
import { useRef, useState } from "react";
import type { Calibration, FaceFeatures, L1Code, Profile } from "@shared/contracts/types";
import { calibrateAudio, LIVE_AUDIO, LIVE_FACE, type CalibrationTakes } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { meterLevel } from "../capture/wav";
import { L1S } from "../content/l1";
import { supabase } from "../data/store";
import { faceCalibrationFrom } from "../face/calibration";
import { pose } from "../face/features";
import { type FaceSession, centralPose, startFaceSession } from "../face/session";
import { fixtureCalibration } from "../fixtures";
import { MIC_BLOCKED } from "./Practice";
import { TopBar, sleep } from "./shared";

type Step = "lang" | "native" | "level" | "goals" | "voice" | "save";
const FLOW: Step[] = ["lang", "native", "level", "goals", "voice", "save"];

const DOTS = ["var(--coral)", "var(--purple)", "var(--sky)", "var(--yellow)", "var(--mint)", "#FF8FC7"];
const LANGS = [
  ["Mandarin", "普通话"], ["Cantonese", "廣東話"], ["Japanese", "日本語"], ["Korean", "한국어"], ["Vietnamese", "Tiếng Việt"],
  ["Thai", "ภาษาไทย"], ["Spanish", "Español"], ["French", "Français"], ["Italian", "Italiano"], ["Portuguese", "Português"],
  ["German", "Deutsch"], ["Swedish", "Svenska"], ["Arabic", "العربية"], ["Hindi", "हिन्दी"], ["Yoruba", "Yorùbá"], ["English", "English"],
].map(([name, native], i) => ({ name, native, dot: DOTS[i % DOTS.length], ready: name === "Mandarin" }));
const NATIVE_TEXT: Record<L1Code, string> = { en: "English", es: "Español", fr: "Français", ja: "日本語", ko: "한국어", vi: "Tiếng Việt", other: "Something else" };
const LEVELS = [
  { name: "New to it", desc: "Starting from the first sounds" },
  { name: "A little", desc: "I know some words but sound off" },
  { name: "Conversational", desc: "People understand me, but I don't sound native" },
  { name: "Fluent", desc: "Polishing accent and expression" },
];
const GOALS = ["Tones", "Accent", "Intonation", "Word stress", "Rhythm", "Listening", "Confidence"];
const GOAL_COLORS = [["var(--purple)", "#FFFFFF"], ["var(--coral)", "#FFFFFF"], ["var(--sky)", "#0B3A5C"], ["var(--yellow)", "#1B1534"], ["var(--mint)", "#06311F"], ["#FF8FC7", "#5C0F38"], ["var(--ink)", "#FFFFFF"]];

export function Onboarding({ redo, onDone, onExit }: { redo?: Profile; onDone: (profile: Profile) => void; onExit: () => void }) {
  const [step, setStep] = useState<Step>(redo ? "voice" : "lang");
  const [query, setQuery] = useState("");
  const [l1, setL1] = useState<L1Code | null>(redo?.l1 ?? null);
  const [level, setLevel] = useState<number | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [calibration, setCalibration] = useState<Calibration>();
  const at = FLOW.indexOf(step);
  const go = (s: Step) => { setStep(s); window.scrollTo(0, 0); };
  const back = () => (redo || at === 0 ? onExit() : go(FLOW[at - 1]));
  const valid = step === "native" ? !!l1 : step === "level" ? level !== null : step === "goals" ? goals.length > 0 : true;
  const next = () => valid && go(FLOW[at + 1]);

  const q = query.trim().toLowerCase();
  const langs = LANGS.filter((l) => !q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));
  const info = L1S.find((l) => l.code === l1);

  return (
    <div className="shell">
      <TopBar>
        {!redo && <div className="steps" aria-label={`Step ${Math.min(at + 1, 5)} of 5`}>{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < at ? "on" : ""} />)}</div>}
        <button className="btn ghost" onClick={back}>Back</button>
      </TopBar>
      <main className="page narrow">
        {step === "lang" && (
          <section className="stack enter">
            <h1 tabIndex={-1}>Which language?</h1>
            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any language" aria-label="Search languages" />
            <div className="tiles">
              {langs.map((l) => (
                <button key={l.name} className="tile" disabled={!l.ready} aria-pressed={l.ready} onClick={next}>
                  <span className="dot" style={{ background: l.dot }} />
                  <span className="name"><b>{l.name}</b><span>{l.native}</span></span>
                  {!l.ready && <span className="soon">Soon</span>}
                </button>
              ))}
            </div>
            {q && !langs.length && <p className="muted">Orbi teaches Mandarin for now. More languages are coming.</p>}
          </section>
        )}

        {step === "native" && (
          <section className="stack enter">
            <h1 tabIndex={-1}>What's your native language?</h1>
            <p className="muted">Orbi uses it to explain what it hears. It never changes your score.</p>
            <div className="tiles">
              {L1S.map((l, i) => (
                <button key={l.code} className="tile" aria-pressed={l1 === l.code} onClick={() => setL1(l.code)}>
                  <span className="dot" style={{ background: DOTS[i % DOTS.length] }} />
                  <span className="name"><b>{l.name}</b><span>{NATIVE_TEXT[l.code]}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "level" && (
          <section className="stack enter">
            <h1 tabIndex={-1}>How's your Mandarin?</h1>
            <div className="options">
              {LEVELS.map((l, i) => (
                <button key={l.name} className="tile option" aria-pressed={level === i} onClick={() => setLevel(i)}>
                  <span className="bars" aria-hidden>{[0, 1, 2, 3].map((b) => <span key={b} className={b <= i ? "on" : ""} style={{ height: 8 + b * 5 }} />)}</span>
                  <span className="name"><b>{l.name}</b><span>{l.desc}</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "goals" && (
          <section className="stack enter">
            <h1 tabIndex={-1}>What do you want to work on?</h1>
            <p className="muted">Pick as many as you like.</p>
            <div className="chips">
              {GOALS.map((g, i) => {
                const on = goals.includes(g);
                return (
                  <button key={g} className="chip" aria-pressed={on} style={on ? { background: GOAL_COLORS[i][0], color: GOAL_COLORS[i][1] } : undefined}
                    onClick={() => setGoals((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))}>{g}</button>
                );
              })}
            </div>
          </section>
        )}

        {step === "voice" && (
          <Calibrate onDone={(c) => {
            if (redo) return onDone({ l1: redo.l1, calibration: c });
            setCalibration(c);
            go("save");
          }} />
        )}

        {step === "save" && (
          <section className="stack enter">
            <h1 tabIndex={-1}>{info?.patterns.length ? `Speakers of ${info.name} often find…` : "You're all set"}</h1>
            {info?.patterns.map((p) => <p key={p.note} className="note">{p.note}</p>)}
            <div className="chips" aria-label="Your plan">
              {["Mandarin", info?.name, level !== null ? LEVELS[level].name : null, ...goals].filter(Boolean).map((v, i) => (
                <span key={v} className="pill" style={{ background: ["var(--purple-soft)", "var(--coral-soft)", "var(--yellow-soft)"][Math.min(i, 2)], color: "var(--ink)", fontSize: 14, padding: "8px 14px" }}>{v}</span>
              ))}
            </div>
            <div className="card stack" style={{ boxShadow: "none", border: "2px solid var(--line)" }}>
              <h2>Save your progress</h2>
              <p className="muted">
                {supabase ? "Orbi keeps your words and streaks in a private space linked to this browser. No account or password needed."
                  : "Orbi keeps your words and streaks in this browser. No account or password needed."}
              </p>
              <div><button className="btn primary big" onClick={() => onDone({ l1: l1 ?? "other", calibration })} autoFocus>Save and start practicing</button></div>
            </div>
          </section>
        )}

        {["native", "level", "goals"].includes(step) && (
          <div><button className="btn primary big" disabled={!valid} onClick={next}>Continue</button></div>
        )}
      </main>
    </div>
  );
}

const TAKES: { name: keyof CalibrationTakes; sec: number; say: string }[] = [
  { name: "glide", sec: 3, say: "Slide your voice from high to low, like a siren" },
  { name: "ee", sec: 2, say: "Say “ee” and hold it" },
  { name: "oo", sec: 2, say: "Say “oo” and hold it" },
  { name: "ah", sec: 2, say: "Say “ah” and hold it" },
];

/** About 10 seconds: a pitch glide and three held vowels for /calibrate/audio; the camera learns your lips from the same takes. */
function Calibrate({ onDone }: { onDone: (c: Calibration) => void }) {
  const [phase, setPhase] = useState<"intro" | "running" | "sending" | "failed">("intro");
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const sample = () => onDone({ ...fixtureCalibration, createdAt: new Date().toISOString() });

  async function run() {
    setPhase("running");
    let stream: MediaStream | undefined;
    let face: FaceSession | undefined;
    try {
      // Without a camera, calibration is voice-only and practice scores the sound alone.
      stream = await openMedia(LIVE_FACE).catch(() => openMedia(false));
      if (stream.getVideoTracks().length && video.current) {
        video.current.srcObject = stream;
        face = await startFaceSession(video.current).catch(() => undefined);
      }
      const takes: Partial<CalibrationTakes> = {};
      const poses: Partial<Record<"neutral" | "ee" | "oo" | "ah", FaceFeatures | null>> = {};
      for (const [i, t] of TAKES.entries()) {
        setIndex(i);
        setListening(false);
        face?.begin();
        await sleep(1200);   // time to read the next instruction; the first pause doubles as the relaxed face
        const relaxed = face?.end(performance.now()) ?? [];
        if (i === 0) poses.neutral = pose(relaxed);
        setListening(true);
        face?.begin();
        const rec = await record(stream, { maxSec: t.sec, onLevel: (rms) => setLevel(meterLevel(rms)) });
        const take = await rec.done;
        takes[t.name] = take.wav;
        if (t.name !== "glide") poses[t.name] = centralPose(face?.end(take.t0) ?? [], t.sec);
      }
      setListening(false);
      setPhase("sending");
      const audio = await calibrateAudio(takes as CalibrationTakes);
      // Your own lips when all four poses came through; otherwise the sample face, which practice ignores.
      onDone({ audio, face: faceCalibrationFrom(poses) ?? fixtureCalibration.face, createdAt: new Date().toISOString() });
    } catch (e) {
      console.error(e);
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? MIC_BLOCKED : "Calibration didn't finish. Make sure the audio service is running, then try again.");
      setPhase("failed");
    } finally {
      face?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      setLevel(0);
    }
  }

  return (
    <section className="stack enter">
      <h1 tabIndex={-1}>Tune Orbi to your voice</h1>
      {phase === "intro" && (
        <>
          <p className="muted">Four short sounds, about 10 seconds. Orbi learns your high and low notes, and how your “ee” and “oo” look and sound.</p>
          <ol className="plan">{TAKES.map((t) => <li key={t.name}>{t.say}</li>)}</ol>
          {LIVE_AUDIO
            ? <div><button className="btn primary big" onClick={() => void run()} autoFocus>Start</button></div>
            : <><p className="faint small">Fixture mode uses a recorded voice profile, so there's nothing to record.</p>
                <div><button className="btn primary big" onClick={sample} autoFocus>Continue</button></div></>}
        </>
      )}
      {(phase === "running" || phase === "sending") && (
        <div className="card calib" aria-live="polite">
          {LIVE_FACE && <div className="cam small"><video ref={video} autoPlay muted playsInline aria-label="Your camera" /></div>}
          <ol className="calib-dots" aria-hidden>
            {TAKES.map((t, i) => <li key={t.name} className={i < index || phase === "sending" ? "on" : i === index ? "now" : ""} />)}
          </ol>
          {phase === "sending" ? <p className="say">Got it. Tuning to you…</p> : (
            <>
              <p className="say">{TAKES[index].say}</p>
              <p className="muted">{listening ? "Now!" : "Get ready…"}</p>
              <div className="level" aria-hidden><span style={{ width: `${listening ? level * 100 : 0}%` }} /></div>
            </>
          )}
        </div>
      )}
      {phase === "failed" && (
        <>
          <p className="message" role="alert">{error}</p>
          <div className="actions">
            <button className="btn primary" onClick={() => void run()}>Try again</button>
            <button className="btn" onClick={sample}>Use a standard voice profile</button>
          </div>
        </>
      )}
    </section>
  );
}
