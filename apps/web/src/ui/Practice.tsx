// Practice screen (SPEC.md Module F, screen 3): the word, "Hear it", the camera with a live lip outline, and recording
// (button or space bar, 3-2-1, auto-stop, level checks). Lip frames recorded with each take become per-vowel
// summaries for diagnose(). In fixture mode, recorded attempts replace the microphone.
import { useEffect, useRef, useState } from "react";
import type { AudioAnalysis, Calibration, FaceSummary, PromptItem } from "@shared/contracts/types";
import { analyze, LIVE_AUDIO, LIVE_FACE } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { LEVEL_MESSAGES, meterLevel } from "../capture/wav";
import { usableFaceCalibration } from "../face/calibration";
import { LIP_BOTTOM, LIP_TOP, MOUTH_L, MOUTH_R, roundness, summarize } from "../face/features";
import { type Frame, LIP_EDGES } from "../face/landmarker";
import { type FaceSession, startFaceSession } from "../face/session";
import { FIXTURES, fixtureAnalysis, fixtureFace } from "../fixtures";
import { TeacherHead } from "../teacher";
import { toneMarks } from "./scoring";
import { TopBar, play, poseFor, sleep, useRefAudio } from "./shared";

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
  const [, setTick] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const face = useRef<FaceSession | null>(null);
  // Lips are only scored against the learner's own calibration; otherwise diagnose() goes audio-only.
  const faceCal = LIVE_FACE ? usableFaceCalibration(calibration.face) : null;
  const refUrl = useRefAudio(prompt);
  const vowel = prompt.vowelTargets?.find((v) => v);
  const list = prompt.reading === "list";
  const writtenU = vowel === "y" && !prompt.pinyin.some((p) => p.includes("v"));

  useEffect(() => {
    let mounted = true;
    // With the face loop live, open the camera on arrival so the learner can get into frame before recording.
    if (LIVE_FACE) {
      openMedia(true).then(async (s) => {
        if (!mounted) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (!video.current) return;
        video.current.srcObject = s;
        const session = await startFaceSession(video.current, drawLips);
        if (mounted) face.current = session; else session.stop();
      }).catch((e) => console.warn("Camera unavailable; practicing with sound only", e));
    }
    const id = setInterval(() => setTick((n) => n + 1), 120);   // live meter and hint refresh
    return () => {
      mounted = false;
      clearInterval(id);
      face.current?.stop();
      face.current = null;
      stopRecording.current?.();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  function drawLips(fr: Frame) {
    const c = canvas.current, v = video.current;
    if (!c || !v) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const p = fr.points;
    if (!p) return;
    g.strokeStyle = "#FFC93C"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath();
    for (const { start, end } of LIP_EDGES) { g.moveTo(p[start].x, p[start].y); g.lineTo(p[end].x, p[end].y); }
    g.stroke();
    g.fillStyle = "#FF6B4A";
    for (const i of [MOUTH_L, MOUTH_R, LIP_TOP, LIP_BOTTOM]) { g.beginPath(); g.arc(p[i].x, p[i].y, 5, 0, 7); g.fill(); }
  }

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
      face.current?.begin();
      // Lists get a longer silence allowance so the pauses between 妈 麻 马 骂 don't end the take.
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
  const live = face.current?.live();
  const r = live?.features.detected && faceCal ? roundness(live.features, faceCal) : null;

  return (
    <div className="shell">
      <TopBar onLogo={onHome}><button className="btn ghost" onClick={onHome}>← All words</button></TopBar>
      <main className="page">
        <div className={`practice ${LIVE_FACE || vowel ? "two" : ""}`}>
          <section className="card word-card enter">
            <p className="hz" lang="zh-Hans">{prompt.hanzi}</p>
            <p className="py">{prompt.pinyin.map(toneMarks).join(" ")}</p>
            <p className="gl">{prompt.gloss}</p>
            {writtenU && <p className="trap">This u is really ü: lips rounded, tongue forward</p>}
            {refUrl && <button className="btn" onClick={() => play(refUrl)}>🔊 Hear it</button>}
            {LIVE_AUDIO ? (
              <div className="recorder" style={{ marginTop: 16 }}>
                <button className={`rec ${phase}`} onClick={() => void start()} disabled={phase === "countdown" || phase === "checking"}
                  aria-label={phase === "recording" ? "Stop recording" : "Record"}>
                  {phase === "idle" && "Record"}
                  {phase === "countdown" && <span className="count">{count}</span>}
                  {phase === "recording" && "Stop"}
                  {phase === "checking" && <span className="spinner" aria-label="Checking" />}
                </button>
                <p className="muted small" aria-live="polite">{hint}</p>
                <div className="level" aria-hidden><span style={{ width: `${phase === "recording" ? level * 100 : 0}%` }} /></div>
              </div>
            ) : (
              <div className="stack" style={{ marginTop: 16, alignItems: "center" }}>
                <p className="faint small">Fixture mode: pick a recorded attempt.</p>
                <div className="chips" style={{ justifyContent: "center" }}>
                  {FIXTURES.filter((f) => f.promptId === prompt.id).map((f) => (
                    <button key={f.variant} className="chip" onClick={() => onResult(fixtureAnalysis(prompt.id, f.variant), fixtureFace(prompt.id, f.variant))}>{f.label}</button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {(LIVE_FACE || vowel) && (
            <section className="stack">
              {LIVE_FACE && (
                <>
                  <div className="cam">
                    <video ref={video} autoPlay muted playsInline aria-label="Your camera, with your lips outlined" />
                    <canvas ref={canvas} aria-hidden />
                    {live?.hint && <span className="hint">{live.hint}</span>}
                  </div>
                  <div className="lipmeter" aria-label={r === null ? "Lip meter: calibrate to turn on" : `Lips ${Math.round(r * 100)}% of the way from ee to oo`}>
                    <span>ee · spread</span>
                    <span className="track">
                      {vowel && <span className="zone" style={vowel === "i" ? { left: 0, width: "30%" } : { left: "60%", right: 0 }} />}
                      {r !== null && <span className="thumb" style={{ left: `${r * 100}%` }} />}
                    </span>
                    <span>oo · rounded</span>
                  </div>
                  {!faceCal && <p className="faint small">Redo calibration with the camera on to turn on lip feedback.</p>}
                </>
              )}
              {vowel && (
                <div className="card teacher">
                  <h2>Shape your mouth like this</h2>
                  <TeacherHead pose={poseFor(prompt)} />
                </div>
              )}
            </section>
          )}
        </div>
        {message && <p className="message" role="alert">{message}</p>}
      </main>
    </div>
  );
}
