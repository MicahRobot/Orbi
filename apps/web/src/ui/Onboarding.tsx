// Onboarding (SPEC.md Module F, screen 1): welcome → native language → ~10 s calibration → "speakers of X often find…".
// "Redo calibration" from Home re-enters at the calibration step.
import { useState } from "react";
import type { Calibration, L1Code, Profile } from "@shared/contracts/types";
import { calibrateAudio, LIVE_AUDIO, type CalibrationTakes } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { meterLevel } from "../capture/wav";
import { L1S } from "../content/l1";
import { fixtureCalibration } from "../fixtures";
import { MIC_BLOCKED } from "./Practice";
import { sleep } from "./shared";

type Step = "welcome" | "language" | "calibrate" | "notes";

export function Onboarding({ redo, onDone }: { redo?: Profile; onDone: (profile: Profile) => void }) {
  const [step, setStep] = useState<Step>(redo ? "calibrate" : "welcome");
  const [l1, setL1] = useState<L1Code>(redo?.l1 ?? "en");
  const [calibration, setCalibration] = useState<Calibration>();
  const info = L1S.find((l) => l.code === l1)!;

  if (step === "welcome") return (
    <main className="page center">
      <div className="hero">
        <p className="hero-mark" lang="zh-Hans" aria-hidden>你好</p>
        <h1>Orbi</h1>
        <p className="lead">Say a Mandarin word. Orbi listens, watches your lips, and shows you exactly what to fix, like a teacher would.</p>
        <button className="btn primary big" onClick={() => setStep("language")} autoFocus>Get started</button>
      </div>
    </main>
  );

  if (step === "language") return (
    <main className="page center">
      <Progress at={0} />
      <h1>What's your native language?</h1>
      <p className="muted">Orbi uses it to explain what it hears. It never changes your score.</p>
      <div className="tiles">
        {L1S.map((l) => (
          <button key={l.code} className="tile" onClick={() => { setL1(l.code); setStep("calibrate"); }}>{l.name}</button>
        ))}
      </div>
    </main>
  );

  if (step === "calibrate") return (
    <Calibrate onDone={(c) => {
      if (redo) return onDone({ l1, calibration: c });
      setCalibration(c);
      setStep("notes");
    }} />
  );

  return (
    <main className="page center">
      <Progress at={2} />
      {info.patterns.length ? (
        <>
          <h1>Speakers of {info.name} often find…</h1>
          <ul className="notes">{info.patterns.map((p) => <li key={p.note} className="card">{p.note}</li>)}</ul>
          <p className="muted">Orbi will point these out when it hears them.</p>
        </>
      ) : (
        <>
          <h1>You're all set</h1>
          <p className="lead">Every language finds different parts of Mandarin tricky. Orbi will point out what it hears, in plain words.</p>
        </>
      )}
      <button className="btn primary big" onClick={() => onDone({ l1, calibration })} autoFocus>Start practicing</button>
    </main>
  );
}

function Progress({ at }: { at: number }) {
  return (
    <ol className="progress-dots" aria-label={`Step ${at + 1} of 3`}>
      {["Language", "Voice", "Tips"].map((s, i) => <li key={s} className={i <= at ? "on" : ""}><span className="sr-only">{s}</span></li>)}
    </ol>
  );
}

const TAKES: { name: keyof CalibrationTakes; sec: number; say: string }[] = [
  { name: "glide", sec: 3, say: "Slide your voice from high to low, like a siren" },
  { name: "ee", sec: 2, say: "Say “ee” and hold it" },
  { name: "oo", sec: 2, say: "Say “oo” and hold it" },
  { name: "ah", sec: 2, say: "Say “ah” and hold it" },
];

/** About 10 seconds: a pitch glide and three held vowels, sent to /calibrate/audio. */
function Calibrate({ onDone }: { onDone: (c: Calibration) => void }) {
  const [phase, setPhase] = useState<"intro" | "running" | "sending" | "failed">("intro");
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const sample = () => onDone({ ...fixtureCalibration, createdAt: new Date().toISOString() });

  async function run() {
    setPhase("running");
    let stream: MediaStream | undefined;
    try {
      stream = await openMedia(false);
      const takes: Partial<CalibrationTakes> = {};
      for (const [i, t] of TAKES.entries()) {
        setIndex(i);
        setListening(false);
        await sleep(1200);   // time to read the next instruction
        setListening(true);
        const rec = await record(stream, { maxSec: t.sec, onLevel: (rms) => setLevel(meterLevel(rms)) });
        takes[t.name] = (await rec.done).wav;
      }
      setListening(false);
      setPhase("sending");
      const audio = await calibrateAudio(takes as CalibrationTakes);
      // shortcut: face poses come from the fixture until lane C's captureCalibrationPose lands.
      onDone({ audio, face: fixtureCalibration.face, createdAt: new Date().toISOString() });
    } catch (e) {
      console.error(e);
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? MIC_BLOCKED : "Calibration didn't finish. Make sure the audio service is running, then try again.");
      setPhase("failed");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setLevel(0);
    }
  }

  return (
    <main className="page center">
      <Progress at={1} />
      <h1>Let Orbi learn your voice</h1>
      {phase === "intro" && (
        <>
          <p className="lead">Four short sounds, about 10 seconds. Orbi uses them to tell your high from your low, and your “ee” from your “oo”.</p>
          <ol className="calib-list">{TAKES.map((t) => <li key={t.name}>{t.say}</li>)}</ol>
          {LIVE_AUDIO
            ? <button className="btn primary big" onClick={() => void run()} autoFocus>Start</button>
            : <><p className="muted small">Fixture mode uses a recorded voice profile, so there's nothing to record.</p>
                <button className="btn primary big" onClick={sample} autoFocus>Continue</button></>}
        </>
      )}
      {(phase === "running" || phase === "sending") && (
        <section className="card calib" aria-live="polite">
          <ol className="progress-dots big" aria-hidden>
            {TAKES.map((t, i) => <li key={t.name} className={i < index || phase === "sending" ? "on" : i === index ? "now" : ""} />)}
          </ol>
          {phase === "sending" ? <p className="lead">Got it. Setting up your voice…</p> : (
            <>
              <p className="calib-say">{TAKES[index].say}</p>
              <p className="hint">{listening ? "Now!" : "Get ready…"}</p>
              <div className={`meter ${listening ? "on" : ""}`}><span style={{ width: `${level * 100}%` }} /></div>
            </>
          )}
        </section>
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
    </main>
  );
}
