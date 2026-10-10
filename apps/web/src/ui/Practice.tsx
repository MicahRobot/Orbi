// Practice screen (SPEC.md Module F, screen 3): the word, "Hear it", the teacher's target pose, and recording
// (button or space bar, 3-2-1, auto-stop, level checks). In fixture mode, recorded attempts replace the microphone.
import { useEffect, useRef, useState } from "react";
import type { AudioAnalysis, Calibration, FaceSummary, PromptItem } from "@shared/contracts/types";
import { analyze, LIVE_AUDIO, LIVE_FACE } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { LEVEL_MESSAGES, meterLevel } from "../capture/wav";
import { usableFaceCalibration } from "../face/calibration";
import { summarize } from "../face/features";
import { type FaceSession, startFaceSession } from "../face/session";
import { FIXTURES, fixtureAnalysis, fixtureFace } from "../fixtures";
import { TeacherHead } from "../teacher";
import { WordHeader, play, poseFor, sleep, useRefAudio } from "./shared";

type Phase = "idle" | "countdown" | "recording" | "checking";

export const MIC_BLOCKED = "Orbi needs your microphone. Allow it in the address bar, then try again.";
const SERVICE_DOWN = "I couldn't reach the sound checker. Make sure the audio service is running, then try again.";

export function Practice({ prompt, calibration, onResult, onHome }: {
  prompt: PromptItem;
  calibration: Calibration;
  onResult: (audio: AudioAnalysis, face: FaceSummary[], wavUrl?: string) => void;
  onHome: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const face = useRef<FaceSession | null>(null);
  // Lips are only scored against the learner's own calibration; otherwise diagnose() goes audio-only.
  const faceCal = LIVE_FACE ? usableFaceCalibration(calibration.face) : null;
  const refUrl = useRefAudio(prompt);
  const vowelWord = prompt.focus.includes("vowel");
  const list = prompt.reading === "list";

  useEffect(() => {
    let mounted = true;
    // With the face loop live, open the camera on arrival so the learner can get into frame before recording.
    if (LIVE_FACE) {
      openMedia(true).then(async (s) => {
        if (!mounted) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (!video.current) return;
        video.current.srcObject = s;
        const session = await startFaceSession(video.current);
        if (mounted) face.current = session; else session.stop();
      }).catch((e) => console.warn("Camera unavailable; practicing with sound only", e));
    }
    return () => {
      mounted = false;
      face.current?.stop();
      face.current = null;
      stopRecording.current?.();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  async function start() {
    if (phase === "recording") return stopRecording.current?.();
    if (phase !== "idle") return;
    setMessage(null);
    try {
      // A denied or busy camera shouldn't block practicing with sound only.
      stream.current ??= await openMedia(LIVE_FACE).catch(() => openMedia(false));
    } catch {
      return setMessage(MIC_BLOCKED);
    }
    try {
      setPhase("countdown");
      for (const n of [3, 2, 1]) { setCount(n); await sleep(800); }
      setPhase("recording");
      // Lists get a longer silence allowance so the pauses between 妈 麻 马 骂 don't end the take.
      face.current?.begin();
      const rec = await record(stream.current, { maxSec: list ? 4 : 3, silenceMs: list ? 1000 : 600, onLevel: (rms) => setLevel(meterLevel(rms)) });
      stopRecording.current = rec.stop;
      const take = await rec.done;
      const frames = face.current?.end(take.t0) ?? [];
      stopRecording.current = null;
      setLevel(0);
      if (take.problem) { setPhase("idle"); return setMessage(LEVEL_MESSAGES[take.problem]); }
      setPhase("checking");
      const audio = await analyze(prompt, take.wav, calibration);
      const levelWarning = audio.warnings.find((w) => w === "too_quiet" || w === "clipped");
      if (levelWarning) { setPhase("idle"); return setMessage(LEVEL_MESSAGES[levelWarning]); }
      const lips = faceCal && frames.length
        ? summarize(frames, audio.syllables.map((s) => ({ index: s.index, start: s.vowelStart, end: s.vowelEnd })), faceCal) : [];
      onResult(audio, lips, URL.createObjectURL(take.wav));
    } catch (e) {
      console.error(e);
      setPhase("idle");
      setMessage(SERVICE_DOWN);
    }
  }

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!LIVE_AUDIO) return;
    const onKey = (e: KeyboardEvent) => {
      // A focused button already answers the space bar itself.
      if (e.code !== "Space" || e.repeat || (e.target as Element).closest("button, input, select, textarea, summary, a")) return;
      e.preventDefault();
      void startRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hint = {
    idle: list ? "Press Record or the space bar, then say each one on its own with a short pause." : "Press Record or the space bar, then say the word.",
    countdown: "Get ready…",
    recording: "Listening… I'll stop when you finish.",
    checking: "Checking your pronunciation…",
  }[phase];

  return (
    <main className="page practice">
      <nav className="topbar"><button className="btn ghost" onClick={onHome}>← Home</button></nav>

      <div className={`practice-grid ${vowelWord || LIVE_FACE ? "two" : ""}`}>
        <section className="card word-card">
          <WordHeader prompt={prompt} />
          {refUrl && <button className="btn" onClick={() => play(refUrl)}>▶ Hear it</button>}
        </section>
        {(vowelWord || LIVE_FACE) && (
          <section className="card side-card">
            {LIVE_FACE && <video ref={video} autoPlay muted playsInline className="camera" aria-label="Your camera" />}
            {vowelWord && <><h2 className="card-title">Your mouth should look like this</h2><TeacherHead pose={poseFor(prompt)} /></>}
          </section>
        )}
      </div>

      {LIVE_AUDIO ? (
        <section className="record">
          <button className={`record-btn ${phase}`} onClick={() => void start()} disabled={phase === "countdown" || phase === "checking"}>
            {phase === "idle" && <><span className="rec-dot" aria-hidden /> Record</>}
            {phase === "countdown" && <span className="count">{count}</span>}
            {phase === "recording" && <>■ Stop</>}
            {phase === "checking" && <span className="spinner" aria-label="Checking" />}
          </button>
          <p className="hint" aria-live="polite">{hint}</p>
          <div className={`meter ${phase === "recording" ? "on" : ""}`} aria-hidden><span style={{ width: `${level * 100}%` }} /></div>
        </section>
      ) : (
        <section className="card">
          <h2 className="card-title">Try a recorded attempt</h2>
          <p className="muted small">Fixture mode replays recorded results, so no microphone is needed.</p>
          <div className="chips">
            {FIXTURES.filter((f) => f.promptId === prompt.id).map((f) => (
              <button key={f.variant} className="chip" onClick={() => onResult(fixtureAnalysis(prompt.id, f.variant), fixtureFace(prompt.id, f.variant))}>
                {f.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {message && <p className="message" role="alert">{message}</p>}
    </main>
  );
}
