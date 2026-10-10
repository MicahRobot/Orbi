// Diagnostic rig: real mic + camera through the real pipeline (/analyze, face summary, diagnose()), with raw readouts.
// Not the product UI. Open http://localhost:5173/rig.html with the audio service in AUDIO_MODE=real.
import { useEffect, useRef, useState } from "react";
import type { AudioAnalysis, AudioCalibration, FaceCalibration, FaceFeatures, FaceSummary, FeedbackItem, L1Code } from "@shared/contracts/types";
import { analyze, calibrateAudio } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { LEVEL_MESSAGES, meterLevel } from "../capture/wav";
import { L1S } from "../content/l1";
import { PROMPTS } from "../content/prompts";
import { diagnose } from "../diagnosis";
import { LIP_BOTTOM, LIP_TOP, MOUTH_L, MOUTH_R, features, roundness, summarize } from "../face/features";
import { type Frame, LIP_EDGES } from "../face/landmarker";
import { type FaceSession, centralPose, startFaceSession } from "../face/session";
import { fixtureAnalysis, fixtureCalibration } from "../fixtures";
import { type Insight, insightsFor } from "../insights";
import { TongueMap } from "../insights/TongueMap";

type Step = "glide" | "ee" | "oo" | "ah";
const STEPS: { step: Step; sec: number; say: string }[] = [
  { step: "glide", sec: 3, say: "Slide your voice from your highest to your lowest note (a siren)" },
  { step: "ee", sec: 2, say: "Hold “ee” (as in see)" },
  { step: "oo", sec: 2, say: "Hold “oo” (as in food)" },
  { step: "ah", sec: 2, say: "Hold “ah”" },
];

const AUDIO_URL = import.meta.env.VITE_AUDIO_URL || "http://localhost:8000";
const health = () => fetch(AUDIO_URL + "/health").then((r) => r.ok, () => false);

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(`orbi.rig.${k}`) ?? "null"); } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(`orbi.rig.${k}`, JSON.stringify(v)); } catch { /* blocked */ } },
};

function download(data: Blob | object, name: string) {
  const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface Result {
  promptId: string; name: string; wav: Blob; url: string; problem: string | null;
  audio?: AudioAnalysis; face: FaceSummary[]; frames: FaceFeatures[]; cards: FeedbackItem[]; insights: Insight[]; error?: string;
}

export default function Rig() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [startError, setStartError] = useState("");
  const [faceStatus, setFaceStatus] = useState("off");
  const [service, setService] = useState<boolean | null>(null);
  const face = useRef<FaceSession | null>(null);
  const [, setTick] = useState(0);
  const [level, setLevel] = useState(0);   // 0–1 meter
  const [busy, setBusy] = useState("");
  // The service answers from shared/fixtures unless started with AUDIO_MODE=real; /health can't tell, the answers can.
  const [fixtureMode, setFixtureMode] = useState(false);

  const [audioCal, setAudioCal] = useState<AudioCalibration | null>(() => store.get("audioCal"));
  const [faceCal, setFaceCal] = useState<FaceCalibration | null>(() => store.get("faceCal"));
  const [neutral, setNeutral] = useState<FaceFeatures | null>(() => faceCal?.neutral ?? null);
  const [takes, setTakes] = useState<Partial<Record<Step, { wav: Blob; pose: FaceFeatures | null }>>>({});
  const [calError, setCalError] = useState("");

  const [promptId, setPromptId] = useState("nv");
  const [variant, setVariant] = useState("take");
  const [l1, setL1] = useState<L1Code>("en");
  const [results, setResults] = useState<Result[]>([]);
  const counter = useRef<Record<string, number>>({});

  useEffect(() => { health().then(setService); const id = setInterval(() => health().then(setService), 5000); return () => clearInterval(id); }, []);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 100); return () => clearInterval(id); }, []);

  async function start() {
    setStartError("");
    try {
      const s = await openMedia(true);
      setStream(s);
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setFaceStatus("loading model…");
      face.current = await startFaceSession(v, draw);
      setFaceStatus("tracking");
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
      setFaceStatus("off");
    }
  }

  function draw(fr: Frame) {
    const c = canvas.current, v = video.current;
    if (!c || !v) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const p = fr.points;
    if (!p) return;
    g.strokeStyle = "#22d3ee"; g.lineWidth = 2;
    g.beginPath();
    for (const { start, end } of LIP_EDGES) { g.moveTo(p[start].x, p[start].y); g.lineTo(p[end].x, p[end].y); }
    g.stroke();
    for (const [i, color] of [[MOUTH_L, "#f472b6"], [MOUTH_R, "#f472b6"], [LIP_TOP, "#4ade80"], [LIP_BOTTOM, "#4ade80"]] as const) {
      g.fillStyle = color; g.beginPath(); g.arc(p[i].x, p[i].y, 4, 0, 7); g.fill();
    }
  }

  /** Records audio while buffering face frames; returns PCM and frames re-timed to the audio clock. */
  async function take(maxSec: number, autoStop: boolean) {
    face.current?.begin();
    const r = await record(stream!, { maxSec, silenceMs: autoStop ? 600 : undefined, onLevel: (rms) => setLevel(meterLevel(rms)) });
    const { wav, t0, problem } = await r.done;
    const frames = face.current?.end(t0) ?? [];
    setLevel(0);
    return { wav, problem, frames };
  }

  async function calStep(step: Step, sec: number) {
    setBusy(step); setCalError("");
    try {
      const { wav, frames } = await take(sec, false);
      setTakes((t) => ({ ...t, [step]: { wav, pose: centralPose(frames, sec) } }));
    } finally { setBusy(""); }
  }

  async function sendCalibration() {
    setBusy("calibrating"); setCalError("");
    try {
      const a = await calibrateAudio({ glide: takes.glide!.wav, ee: takes.ee!.wav, oo: takes.oo!.wav, ah: takes.ah!.wav });
      if (JSON.stringify(a) === JSON.stringify(fixtureCalibration.audio)) { setFixtureMode(true); throw new Error("The service returned the sample calibration: it's in fixture mode."); }
      setAudioCal(a); store.set("audioCal", a);
      if (neutral && takes.ee?.pose && takes.oo?.pose && takes.ah?.pose) {
        const f: FaceCalibration = { neutral, ee: takes.ee.pose, oo: takes.oo.pose, ah: takes.ah.pose };
        setFaceCal(f); store.set("faceCal", f);
      } else setCalError("Audio calibrated. Face calibration needs the neutral face and a face seen during ee, oo and ah.");
    } catch (e) { setCalError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  async function run(promptId: string, wav: Blob, frames: FaceFeatures[], problem: string | null) {
    const prompt = PROMPTS.find((p) => p.id === promptId)!;
    const n = (counter.current[`${promptId}.${variant}`] ?? 0) + 1;
    counter.current[`${promptId}.${variant}`] = n;
    const base: Result = { promptId, name: `${promptId}.${variant}.${n}`, wav, url: URL.createObjectURL(wav), problem, face: [], frames, cards: [], insights: [] };
    try {
      const audio = await analyze(prompt, wav, { audio: audioCal ?? fixtureCalibration.audio, face: fixtureCalibration.face, createdAt: "" });
      setFixtureMode(JSON.stringify(audio) === JSON.stringify(fixtureAnalysis(promptId, "correct")));
      const face = frames.length && faceCal
        ? summarize(frames, audio.syllables.map((s) => ({ index: s.index, start: s.vowelStart, end: s.vowelEnd })), faceCal) : [];
      const cards = diagnose(prompt, audio, face, l1);
      setResults((r) => [{ ...base, audio, face, cards, insights: insightsFor(prompt, audio, face, cards, audioCal ?? fixtureCalibration.audio) }, ...r]);
    } catch (e) {
      setResults((r) => [{ ...base, error: e instanceof Error ? e.message : String(e) }, ...r]);
    }
  }

  async function recordWord() {
    setBusy("recording");
    try {
      const prompt = PROMPTS.find((p) => p.id === promptId)!;
      const { wav, problem, frames } = await take(prompt.reading === "list" ? 4 : 3, true);
      setBusy("analyzing");
      await run(promptId, wav, frames, problem && LEVEL_MESSAGES[problem]);
    } finally { setBusy(""); }
  }

  async function analyzeFile(file: File) {
    setBusy("analyzing");
    try { await run(promptId, file, [], null); } finally { setBusy(""); }
  }

  const live = face.current?.live() ?? { features: features(0, undefined, undefined), hint: "", fps: 0 };
  const f = live.features;
  const prompt = PROMPTS.find((p) => p.id === promptId)!;
  const allTakes = STEPS.every((s) => takes[s.step]);

  return (
    <main>
      <h1>Orbi rig: mic + camera diagnostics</h1>
      {fixtureMode && <p className="panel bad"><b>The audio service is in fixture mode</b>, so results are canned sample data. Restart it with AUDIO_MODE=real in services/audio/.env (and --env-file .env).</p>}
      <p className="row">
        <span className={service ? "ok" : "bad"}>Audio service: {service === null ? "checking…" : service ? "up" : "down (start it on :8000)"}</span>
        <span>Face: {faceStatus}{live.fps ? ` · ${live.fps} fps` : ""}</span>
        <span className={audioCal ? "ok" : "warn"}>Voice calibration: {audioCal ? "yours" : "sample (calibrate below)"}</span>
        <span className={faceCal ? "ok" : "warn"}>Face calibration: {faceCal ? "yours" : "none (roundness off)"}</span>
      </p>

      <section className="panel">
        <h2>1. Camera and mic</h2>
        {!stream && <button className="primary" onClick={start}>Start camera &amp; mic</button>}
        {startError && <p className="bad">Couldn't start: {startError}</p>}
        <div className="cam" hidden={!stream}>
          <div className="stage">
            <video ref={video} playsInline muted />
            <canvas ref={canvas} />
            {live.hint && <div className="hint">{live.hint}</div>}
          </div>
          <table className="live">
            <tbody>
              <tr><th>Face</th><td>{f.detected ? "found" : "not found"}</td></tr>
              <tr><th>Lip width</th><td>{f.lipWidth.toFixed(3)}</td></tr>
              <tr><th>Lip gap</th><td>{f.lipHeight.toFixed(3)}</td></tr>
              <tr><th>Pucker</th><td>{f.pucker.toFixed(2)}</td></tr>
              <tr><th>Funnel</th><td>{f.funnel.toFixed(2)}</td></tr>
              <tr><th>Jaw open</th><td>{f.jawOpen.toFixed(2)}</td></tr>
              <tr><th>Smile</th><td>{f.smile.toFixed(2)}</td></tr>
              <tr><th>Roundness</th><td>{faceCal && f.detected ? <Bar value={roundness(f, faceCal)} left="ee" right="oo" /> : "calibrate first"}</td></tr>
              <tr><th>Mic</th><td><Bar value={level} left="-60 dB" right="0" /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>2. Calibrate (about 10 seconds)</h2>
        <ol>
          <li>
            Relax your face, mouth closed. <button disabled={!stream || !f.detected} onClick={() => { setNeutral({ ...f }); }}>Capture neutral face</button>
            {neutral && <span className="ok"> ✓</span>}
          </li>
          {STEPS.map(({ step, sec, say }) => (
            <li key={step}>
              {say} ({sec} s){" "}
              <button disabled={!stream || !!busy} onClick={() => calStep(step, sec)}>{busy === step ? "Recording…" : takes[step] ? "Redo" : "Record"}</button>
              {takes[step] && <><span className="ok"> ✓</span> face {takes[step]!.pose ? "seen" : <span className="bad">not seen</span>} <button className="link" onClick={() => download(takes[step]!.wav, `calib.${step}.wav`)}>WAV</button></>}
            </li>
          ))}
        </ol>
        <button className="primary" disabled={!allTakes || !!busy} onClick={sendCalibration}>{busy === "calibrating" ? "Sending…" : "Send calibration"}</button>
        {audioCal && <button className="link" onClick={() => { setAudioCal(null); setFaceCal(null); setNeutral(null); store.set("audioCal", null); store.set("faceCal", null); }}>Clear saved calibration</button>}
        {calError && <p className="bad">{calError}</p>}
        {(audioCal || faceCal) && <details><summary>Calibration JSON</summary><pre>{JSON.stringify({ audio: audioCal, face: faceCal }, null, 2)}</pre></details>}
      </section>

      <section className="panel">
        <h2>3. Say a word</h2>
        <p className="row">
          <label>Word <select value={promptId} onChange={(e) => setPromptId(e.target.value)}>
            {PROMPTS.map((p) => <option key={p.id} value={p.id}>{p.hanzi} · {p.pinyin.join(" ")} · {p.id}</option>)}
          </select></label>
          <label>Take label <input value={variant} onChange={(e) => setVariant(e.target.value.replace(/[^a-z0-9_]/gi, ""))} size={10} /></label>
          <label>Native language <select value={l1} onChange={(e) => setL1(e.target.value as L1Code)}>{L1S.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
        </p>
        <p className="big">{prompt.hanzi} <span className="muted">{prompt.pinyin.join(" ")} · {prompt.gloss}</span></p>
        <p className="row">
          <button className="primary" disabled={!stream || !!busy} onClick={recordWord}>{busy === "recording" ? "Listening… (stops on silence)" : busy === "analyzing" ? "Analyzing…" : "Record"}</button>
          <label className="file">or analyze a WAV file (no face) <input type="file" accept="audio/wav,.wav" disabled={!!busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void analyzeFile(file); }} /></label>
        </p>
      </section>

      {results.map((r, i) => <ResultView key={results.length - i} r={r} />)}
    </main>
  );
}

function Bar({ value, left, right }: { value: number; left: string; right: string }) {
  return (
    <span className="bar"><small>{left}</small><span className="track"><span className="fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} /></span><small>{right}</small> {value.toFixed(2)}</span>
  );
}

const W = 520, H = 140;
function Curves({ produced, target }: { produced: number[]; target: number[] }) {
  const y = (l: number) => 8 + ((5.5 - l) / 5) * (H - 16);
  const path = (pts: number[]) => pts.map((p, i) => `${i ? "L" : "M"}${(i / Math.max(pts.length - 1, 1)) * (W - 20) + 10},${y(p)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve">
      {[1, 2, 3, 4, 5].map((l) => <line key={l} x1={0} x2={W} y1={y(l)} y2={y(l)} className="grid" />)}
      <path d={path(target)} className="target" />
      {produced.length > 1 && <path d={path(produced)} className="produced" />}
    </svg>
  );
}

/** Lip movement over the take: roundness-ish signals vs. time, with each syllable's vowel window shaded. */
function MouthTimeline({ frames, audio }: { frames: FaceFeatures[]; audio: AudioAnalysis }) {
  const end = Math.max(audio.durationSec, ...frames.map((f) => f.t));
  const x = (t: number) => 10 + (Math.max(0, t) / end) * (W - 20);
  const y = (v: number) => H - 10 - Math.min(1.2, Math.max(0, v)) * (H - 20) / 1.2;
  const series = (k: "lipWidth" | "pucker" | "jawOpen") => frames.filter((f) => f.detected && f.t >= 0).map((f, i) => `${i ? "L" : "M"}${x(f.t)},${y(f[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve">
      {audio.syllables.map((s) => <rect key={s.index} x={x(s.vowelStart)} width={x(s.vowelEnd) - x(s.vowelStart)} y={0} height={H} className="win" />)}
      <path d={series("lipWidth")} className="s-width" />
      <path d={series("pucker")} className="s-pucker" />
      <path d={series("jawOpen")} className="s-jaw" />
    </svg>
  );
}

const STATUS = { good: ["ok", "✓ Good"], fix: ["bad", "✕ Fix"], tip: ["warn", "i Tip"], unsure: ["warn", "? Unsure"] } as const;

function InsightView({ x }: { x: Insight }) {
  const [cls, word] = STATUS[x.status];
  return (
    <div className="insight">
      <p className="small"><b className={cls}>{word}</b> · syllable {x.syllableIndex} · {x.area}</p>
      <p><b>{x.headline}</b></p>
      <p className="small">{x.what}</p>
      {x.note && <p className="small"><em>{x.note}</em></p>}
      {x.how.length > 0 && <ol className="small">{x.how.map((h, i) => <li key={i}>{h}</li>)}</ol>}
      {x.tongue && <TongueMap you={x.tongue.you} target={x.tongue.target} />}
      {x.lips && <Bar value={x.lips.roundness} left="spread" right="rounded" />}
    </div>
  );
}

function ResultView({ r }: { r: Result }) {
  return (
    <section className="panel">
      <h2>{r.name}</h2>
      <p className="row">
        <button className="link" onClick={() => download(r.wav, `${r.name}.wav`)}>Download WAV</button>
        {r.audio && <button className="link" onClick={() => download(r.audio!, `${r.name}.analysis.json`)}>Analysis JSON</button>}
        {r.frames.length > 0 && <button className="link" onClick={() => download(r.frames, `${r.name}.face.json`)}>Face frames JSON</button>}
        <audio controls src={r.url} />
      </p>
      {r.problem && <p className="warn">Level check: {r.problem}</p>}
      {r.error && <p className="bad">{r.error}</p>}
      {r.audio && (
        <>
          {r.audio.warnings.length > 0 && <p className="warn">Service warnings: {r.audio.warnings.join(", ")}</p>}
          <h3>Insights</h3>
          <div className="insights">{r.insights.map((x, i) => <InsightView key={i} x={x} />)}</div>
          <h3>Fix cards from diagnose()</h3>
          {r.cards.length ? <ul>{r.cards.map((c, i) => (
            <li key={i}><b>sev {c.diagnosis.severity} · {c.diagnosis.articulator} · {c.diagnosis.issueId}</b> (syllable {c.diagnosis.syllableIndex}): {c.title}. {c.instruction}{c.l1Note && <em> [{c.l1Note}]</em>}</li>
          ))}</ul> : <p className="ok">No fixes: passes.</p>}
          <div className="sylls">
            {r.audio.syllables.map((s) => {
              const fs = r.face.find((x) => x.syllableIndex === s.index);
              return (
                <div key={s.index} className="syll">
                  <h3>{s.target.pinyin} <small>{s.start.toFixed(2)}–{s.end.toFixed(2)} s{s.target.sandhiNote && ` · ${s.target.sandhiNote}`}</small></h3>
                  <Curves produced={s.tone.producedChao} target={s.tone.targetChao} />
                  <p className="small">Tone: target {s.tone.target}, nearest <b>{s.tone.nearest}</b>, score <b>{s.tone.score}</b>, rmse {s.tone.rmse}, voiced {Math.round(s.tone.voicedRatio * 100)}%, issues {s.tone.issues.join(", ") || "none"}</p>
                  {s.vowel && <p className="small">Vowel: target {s.vowel.target}, heard <b>{s.vowel.heardAs}</b> (confidence {s.vowel.confidence}), F1/F2/F3 {s.vowel.formants.F1}/{s.vowel.formants.F2}/{s.vowel.formants.F3}, f2n {s.vowel.f2n}, f3ratio {s.vowel.f3ratio}, glide {String(s.vowel.glide)}</p>}
                  {fs && <p className="small">Lips in vowel window {s.vowelStart.toFixed(2)}–{s.vowelEnd.toFixed(2)} s: roundness <b>{fs.roundness.toFixed(2)}</b>, jaw {fs.jawOpen.toFixed(2)}, face seen {Math.round(fs.coverage * 100)}%</p>}
                </div>
              );
            })}
          </div>
          {r.frames.length > 0 && (
            <>
              <h3>Mouth over time <small><span className="k-width">lip width</span> · <span className="k-pucker">pucker</span> · <span className="k-jaw">jaw open</span> · shaded = vowel windows</small></h3>
              <MouthTimeline frames={r.frames} audio={r.audio} />
            </>
          )}
          <details><summary>Raw analysis JSON</summary><pre>{JSON.stringify({ audio: r.audio, face: r.face }, null, 2)}</pre></details>
        </>
      )}
    </section>
  );
}
