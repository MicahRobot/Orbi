// Orbi Lab (Orbi Lab.dc.html): say a word into the real mic in front of the real camera and see what your pitch,
// lips and tongue did, from the real pipeline: capture → /analyze → face summary → diagnose() → insights.
// Live readouts tick in their own small components so the results column never re-renders on the meter clock.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AudioAnalysis, Calibration, FaceFeatures, L1Code, Profile, PromptItem } from "@shared/contracts/types";
import { analyze } from "../api/audio";
import { openMedia, record } from "../capture/recorder";
import { LEVEL_MESSAGES, meterLevel } from "../capture/wav";
import { L1S } from "../content/l1";
import { PROMPTS } from "../content/prompts";
import { loadProfile, saveProfile } from "../data/store";
import { usableFaceCalibration } from "../face/calibration";
import { LIP_BOTTOM, LIP_TOP, MOUTH_L, MOUTH_R, roundness, summarize as summarizeFace } from "../face/features";
import { type Frame, LIP_EDGES } from "../face/landmarker";
import { type FaceSession, startFaceSession } from "../face/session";
import { FIXTURES, fixtureAnalysis, fixtureCalibration, fixtureFace } from "../fixtures";
import { toneMarks } from "../ui/scoring";
import { useRefAudio } from "../ui/shared";
import { CalibrationDrawer } from "./CalibrationDrawer";
import { serviceError } from "./errors";
import { Camera, Chevron, Download, MarkIcon, Mic, Play, Speaker, Tune, Upload } from "./icons";
import { cardsOf, relativeTime, viewOf, type CardView, type Take } from "./model";
import { LipsBar, MouthTimeline, PitchChart, Ring, TongueMap } from "./viz";

const WORD_IDS = ["ma4", "nihao", "nv", "ni", "nu", "qu", "yu"];
const WORDS = WORD_IDS.map((id) => PROMPTS.find((p) => p.id === id)!);
const BEATS = FIXTURES.filter((f) => f.beat);
const MAX_TAKES = 8;
const AUDIO_URL = import.meta.env.VITE_AUDIO_URL || "http://localhost:8000";

type Media = "off" | "starting" | "live" | "micOnly" | "blocked";
type Rec = "idle" | "count" | "listen" | "analyze" | "error";
type Analyzer = "checking" | "up" | "down" | "sample";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isSample = (cal?: Calibration) => !cal || JSON.stringify(cal.audio) === JSON.stringify(fixtureCalibration.audio);

function download(data: Blob | object, name: string) {
  const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Re-renders the calling component every `ms` while `on`. */
function useTick(ms: number, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
}

export default function Lab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [l1, setL1] = useState<L1Code>("en");
  const cal = profile?.calibration;
  const faceCal = usableFaceCalibration(cal?.face);

  const [media, setMedia] = useState<Media>("off");
  const stream = useRef<MediaStream | null>(null);
  const face = useRef<FaceSession | null>(null);
  const meter = useRef<{ ctx: AudioContext; an: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const [analyzer, setAnalyzer] = useState<Analyzer>("checking");
  const [faceFailed, setFaceFailed] = useState(false);
  const [promptId, setPromptId] = useState("nv");
  const prompt = WORDS.find((p) => p.id === promptId)!;
  const [takes, setTakes] = useState<Take[]>([]);
  const [viewId, setViewId] = useState<number | null>(null);
  const nextId = useRef(1);
  const [rec, setRec] = useState<Rec>("idle");
  const [count, setCount] = useState(3);
  const [recError, setRecError] = useState("");
  const stopRec = useRef<(() => void) | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [demo, setDemo] = useState<number | null>(null);

  // Profile (shared with the app): calibration and native language.
  useEffect(() => {
    void loadProfile().then((p) => { setProfile(p); if (p?.l1) setL1(p.l1); });
  }, []);

  // Analyzer health every 5 s.
  useEffect(() => {
    let live = true;
    const check = () => fetch(AUDIO_URL + "/health", { signal: AbortSignal.timeout(2500) })
      .then((r) => r.ok, () => false)
      .then((ok) => live && setAnalyzer((a) => (ok ? (a === "sample" ? a : "up") : "down")));
    void check();
    const id = setInterval(check, 5000);
    return () => { live = false; clearInterval(id); };
  }, []);

  /** Stops the camera, mic, meter and face loop and forgets them, so the next startMedia() opens fresh ones. */
  const stopMedia = useCallback(() => {
    face.current?.stop();
    face.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void meter.current?.ctx.close();
    meter.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  // Tear everything down on the way out.
  const takesRef = useRef(takes);
  takesRef.current = takes;
  useEffect(() => () => {
    stopRec.current?.();
    stopMedia();
    takesRef.current.forEach((t) => t.wavUrl && URL.revokeObjectURL(t.wavUrl));
  }, [stopMedia]);

  const drawLips = useCallback((fr: Frame) => {
    const c = canvas.current, v = video.current;
    if (!c || !v) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const p = fr.points;
    if (!p) return;
    g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (const { start, end } of LIP_EDGES) { g.moveTo(p[start].x, p[start].y); g.lineTo(p[end].x, p[end].y); }
    g.stroke();
    g.fillStyle = "#3ECF95";
    for (const i of [MOUTH_L, MOUTH_R, LIP_TOP, LIP_BOTTOM]) { g.beginPath(); g.arc(p[i].x, p[i].y, 3.5, 0, 7); g.fill(); }
  }, []);

  /** One stream for everything: recording, calibration, the meter and the face loop. */
  const startMedia = useCallback(async (): Promise<MediaStream | null> => {
    // Reuse the stream only while its mic is live: an unplugged mic or a revoked permission ends the track.
    if (stream.current?.getAudioTracks().some((t) => t.readyState === "live")) return stream.current;
    stopMedia();
    setMedia("starting");
    let s: MediaStream;
    try { s = await openMedia(true); } catch {
      try { s = await openMedia(false); } catch { setMedia("blocked"); return null; }
    }
    stream.current = s;
    for (const t of s.getTracks()) {
      t.addEventListener("ended", () => {
        if (stream.current !== s) return;
        if (t.kind === "audio") { stopMedia(); setMedia("off"); }
        else { face.current?.stop(); face.current = null; setMedia("micOnly"); }
      });
    }
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      meter.current = { ctx, an, buf: new Float32Array(an.fftSize) };
    } catch { /* no meter, recording still works */ }
    if (s.getVideoTracks().length && video.current) {
      video.current.srcObject = s;
      try { face.current = await startFaceSession(video.current, drawLips); } catch (e) { console.warn("Face tracking unavailable", e); setFaceFailed(true); }
    }
    setMedia(s.getVideoTracks().length ? "live" : "micOnly");
    return s;
  }, [drawLips, stopMedia]);

  const micLevel = useCallback(() => {
    const m = meter.current;
    if (!m) return 0;
    m.an.getFloatTimeDomainData(m.buf);
    let sum = 0;
    for (const x of m.buf) sum += x * x;
    return meterLevel(Math.sqrt(sum / m.buf.length));
  }, []);

  const addTake = useCallback((t: Take) => {
    setTakes((prev) => {
      const next = [t, ...prev];
      next.slice(MAX_TAKES).forEach((d) => d.wavUrl && URL.revokeObjectURL(d.wavUrl));
      return next.slice(0, MAX_TAKES);
    });
    setViewId(null);
  }, []);

  /** /analyze → lip summary → a take. Shared by the mic and the WAV upload. */
  async function analyzeTake(p: PromptItem, wav: Blob, frames: FaceFeatures[]) {
    const calibration: Calibration = cal ?? { ...fixtureCalibration, createdAt: "" };
    const audio: AudioAnalysis = await analyze(p, wav, calibration);
    setAnalyzer(JSON.stringify(audio) === JSON.stringify(fixtureAnalysis(p.id, "correct")) ? "sample" : "up");
    const level = audio.warnings.find((w) => w === "too_quiet" || w === "clipped");
    if (level) throw Object.assign(new Error(LEVEL_MESSAGES[level]), { friendly: true });
    const lips = faceCal && frames.length
      ? summarizeFace(frames, audio.syllables.map((s) => ({ index: s.index, start: s.vowelStart, end: s.vowelEnd })), faceCal) : [];
    addTake({ id: nextId.current++, prompt: p, createdAt: Date.now(), audio, frames, face: lips, calibration: calibration.audio, faceCal, l1, wav, wavUrl: URL.createObjectURL(wav) });
  }

  function fail(e: unknown) {
    console.error(e);
    const friendly = (e as { friendly?: boolean })?.friendly ? (e as Error).message : serviceError(e).detail;
    if (serviceError(e).kind === "offline") setAnalyzer("down");
    setRecError(friendly);
    setRec("error");
  }

  async function toggleRecord() {
    if (rec === "listen") return stopRec.current?.();
    if (rec === "count" || rec === "analyze" || drawer) return;
    setDemo(null);
    setRecError("");
    const s = await startMedia();
    if (!s) { setRecError("Orbi needs your microphone. Allow it in the address bar, then try again."); return setRec("error"); }
    const p = prompt;
    const list = p.reading === "list";
    try {
      setRec("count");
      for (const n of [3, 2, 1]) { setCount(n); await sleep(600); }
      setRec("listen");
      face.current?.begin();
      // Lists get a longer silence allowance so the pauses between 妈 麻 马 骂 don't end the take.
      const r = await record(s, { maxSec: list ? 4 : 3, silenceMs: list ? 1000 : 600 });
      stopRec.current = r.stop;
      const take = await r.done;
      stopRec.current = null;
      const frames = face.current?.end(take.t0) ?? [];
      if (take.problem) { setRecError(LEVEL_MESSAGES[take.problem]); return setRec("error"); }
      setRec("analyze");
      await analyzeTake(p, take.wav, frames);
      setRec("idle");
    } catch (e) {
      stopRec.current = null;
      face.current?.end(0);
      fail(e);
    }
  }

  async function analyzeFile(file: File) {
    if (rec === "count" || rec === "listen" || rec === "analyze") return;
    setDemo(null);
    setRecError("");
    setRec("analyze");
    try { await analyzeTake(prompt, file, []); setRec("idle"); } catch (e) { fail(e); }
  }

  function playBeat(i: number) {
    const b = BEATS[i];
    const p = PROMPTS.find((x) => x.id === b.promptId)!;
    setDemo(i);
    if (WORD_IDS.includes(p.id)) setPromptId(p.id);
    // Demo beats replay recorded results, analyzed against the sample calibration they were made with.
    addTake({ id: nextId.current++, prompt: p, createdAt: Date.now(), audio: fixtureAnalysis(b.promptId, b.variant), frames: [],
      face: fixtureFace(b.promptId, b.variant), calibration: fixtureCalibration.audio, faceCal: null, l1, demo: b.label });
  }

  function onCalibrated(c: Calibration) {
    // A run without usable lip poses (camera off or blocked) keeps the lip calibration you already had.
    const keepFace = !usableFaceCalibration(c.face) && usableFaceCalibration(profile?.calibration?.face);
    const next: Profile = { l1: profile?.l1 ?? l1, calibration: keepFace ? { ...c, face: profile!.calibration!.face } : c };
    setProfile(next);
    void saveProfile(next);
  }

  // Space records (unless a control has focus, which answers Space itself); Escape closes the sheet.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.key === "Escape" && drawer) return setDrawer(false);
    if (e.code !== "Space" || e.repeat || drawer) return;
    if ((e.target as Element).closest("button, input, select, textarea, a, summary, [role=tab]")) return;
    e.preventDefault();
    void toggleRecord();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (new URLSearchParams(location.search).has("demo")) playBeat(0); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The "You" column sticks below the header when it fits; when it's taller than the window, it sticks by its
  // bottom edge instead, so the record button never hides below the fold.
  const aside = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = aside.current;
    if (!el) return;
    const fit = () => {
      const header = (document.querySelector(".top") as HTMLElement | null)?.offsetHeight ?? 64;
      el.style.top = `${Math.min(header + 20, window.innerHeight - el.offsetHeight - 20)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const top = document.querySelector(".top");
    if (top) ro.observe(top);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  const take = takes.find((t) => t.id === viewId) ?? takes[0];
  const busy = rec === "count" || rec === "listen" || rec === "analyze";

  return (
    <div className="lab">
      <div className="top">
        {demo !== null && (
          <div className="demo-bar">
            <span className="demo-tag">Demo</span>
            <span className="grow">{demo + 1} of {BEATS.length} · {BEATS[demo].label}</span>
            <button className="btn light small" onClick={() => playBeat((demo + 1) % BEATS.length)}>Next</button>
            <button className="btn ghost-light small" onClick={() => setDemo(null)}>Exit</button>
          </div>
        )}
        <header className="bar">
          <a className="brand" href="/" aria-label="Orbi app"><span className="orb" aria-hidden /><span>orbi</span></a>
          <span className="lab-tag">Lab</span>
          <span className="grow" />
          <ul className="status" aria-label="Status">
            <li className={isSample(cal) ? "warn" : "ok"}><i /><span className="k">Voice</span><b>{isSample(cal) ? "Sample voice" : "Tuned to you"}</b></li>
            <li className={media === "live" ? "ok" : media === "blocked" ? "bad" : "off"}><i /><span className="k">Camera</span><b>{{ off: "Off", starting: "Starting…", live: "On", micOnly: "Mic only", blocked: "Blocked" }[media]}</b></li>
            <li className={analyzer === "up" ? "ok" : analyzer === "down" ? "bad" : "warn"}><i /><span className="k">Analyzer</span><b>{{ checking: "Checking…", up: "Connected", down: "Offline", sample: "Sample data" }[analyzer]}</b></li>
          </ul>
          {demo === null && <button className="btn quiet small" onClick={() => playBeat(0)}><Play size={14} />Demo</button>}
          <button className="btn primary small" onClick={() => setDrawer(true)} disabled={busy}><Tune size={16} />Tune to my voice</button>
        </header>
        {analyzer === "sample" && <p className="banner">The analyzer is answering with sample data. Restart it with <code>AUDIO_MODE=real</code> to score your own voice.</p>}
        {analyzer === "down" && <p className="banner bad">Can't reach the analyzer at {AUDIO_URL}. Start it, and this page reconnects on its own.</p>}
      </div>

      <main className="cols">
        <aside ref={aside} className="you" aria-label="You">
          <div className="col-head"><h2>You</h2><TrackText face={face} media={media} failed={faceFailed} /></div>

          <div className={`stage ${media === "live" ? "on" : ""}`}>
            <video ref={video} autoPlay muted playsInline aria-label="Your camera, with your lips outlined" />
            <canvas ref={canvas} aria-hidden />
            {media === "live" && <FaceHint face={face} />}
            {media !== "live" && (
              <div className="stage-off">
                <span className="oval" aria-hidden />
                <p>{{ off: "Orbi uses your camera on this device only, to see your lips.", starting: "Starting camera…", micOnly: "The camera is blocked, so lips and tongue can't be told apart. Sound still works.", blocked: "Camera and mic are blocked. Allow them in the address bar, then try again.", live: "" }[media]}</p>
                {media !== "starting" && media !== "micOnly" && <button className="btn light" onClick={() => void startMedia()}><Camera size={17} />Turn on camera and mic</button>}
              </div>
            )}
          </div>

          <Meters face={face} faceCal={faceCal} level={micLevel} on={media === "live" || media === "micOnly"} vowel={prompt.vowelTargets?.find((v) => v) ?? null} />

          <section className="word card">
            <div className="tabs" role="tablist" aria-label="Word">
              {WORDS.map((w) => (
                <button key={w.id} role="tab" aria-selected={w.id === promptId} lang="zh-Hans" disabled={busy}
                  onClick={() => { setPromptId(w.id); setDemo(null); }}>{w.hanzi.replace(/\s/g, "")}</button>
              ))}
            </div>
            <div className="word-main">
              <div className="word-text">
                <span className={`hz ${prompt.hanzi.replace(/\s/g, "").length > 2 ? "long" : ""}`} lang="zh-Hans">{prompt.hanzi}</span>
                <span className="py">{prompt.pinyin.map(toneMarks).join(" ")}</span>
                <span className="muted">{prompt.gloss}</span>
              </div>
              <HearIt prompt={prompt} />
            </div>
            {prompt.vowelTargets?.includes("y") && !prompt.pinyin.some((p) => p.includes("v")) && <p className="hintline">This u is really ü: lips rounded, tongue forward.</p>}
            <div className="recorder">
              <div className={`rec-wrap ${rec}`}>
                <button className={`rec ${rec}`} onClick={() => void toggleRecord()} disabled={rec === "count" || rec === "analyze"}
                  aria-label={rec === "listen" ? "Stop recording" : "Record"}>
                  {rec === "count" ? <span className="count">{count}</span> : rec === "listen" ? <span className="stop" /> : <Mic size={32} />}
                </button>
              </div>
              <div className="rec-text" aria-live="polite">
                <strong className={rec === "error" ? "err" : ""}>
                  {{ idle: "Record", count: "Get ready…", listen: "Listening…", analyze: "Listening back…", error: recError }[rec]}
                </strong>
                {rec === "listen" ? <Wave level={micLevel} /> : null}
                <span className="muted">
                  {{ idle: <>Press <kbd>Space</kbd> or the button, then say it once.</>, count: "Say it after 1.", listen: "Stops when you finish.", analyze: "Checking pitch, lips and tongue.", error: <>Press <kbd>Space</kbd> to try again.</> }[rec]}
                </span>
              </div>
            </div>
            <label className="lang">Tips written for
              <select value={l1} onChange={(e) => setL1(e.target.value as L1Code)}>
                {L1S.map((l) => <option key={l.code} value={l.code}>{l.code === "other" ? "other" : l.name} speakers</option>)}
              </select>
            </label>
          </section>

        </aside>

        <section className="happened" aria-label="What happened">
          <div className="col-head">
            <h2>What happened</h2>
            {takes.length > 1 && (
              <div className="history" role="tablist" aria-label="Takes">
                {takes.map((t) => <HistoryChip key={t.id} take={t} active={take?.id === t.id} onClick={() => setViewId(t.id)} />)}
              </div>
            )}
          </div>
          {take ? <Result key={`${take.id}-${l1}`} take={take} l1={l1} dim={rec === "analyze"} onAnalyzeFile={analyzeFile} />
            : <Empty prompt={prompt} onAnalyzeFile={analyzeFile} />}
        </section>
      </main>

      <CalibrationDrawer open={drawer} stream={stream.current} getFace={() => face.current} onClose={() => setDrawer(false)}
        onNeedMedia={startMedia} onDone={onCalibrated} download={download} />
    </div>
  );
}

/* ---------- live pieces: each ticks on its own ---------- */

function TrackText({ face, media, failed }: { face: RefObject<FaceSession | null>; media: Media; failed: boolean }) {
  useTick(500, media === "live");
  const l = face.current?.live();
  if (media !== "live") return <span className="track off">{media === "micOnly" ? "Mic only" : "Camera off"}</span>;
  if (!l) return <span className="track off">{failed ? "Face tracking unavailable" : "Loading face model…"}</span>;
  return <span className={`track ${l.features.detected ? "ok" : "off"}`}>{l.features.detected ? `Face tracked · ${l.fps || "…"} fps` : "Looking for your face…"}</span>;
}

function FaceHint({ face }: { face: RefObject<FaceSession | null> }) {
  useTick(250);
  const hint = face.current?.live().hint;
  return hint ? <div className="hint" role="status">{hint}</div> : null;
}

function Meters({ face, faceCal, level, on, vowel }: {
  face: RefObject<FaceSession | null>; faceCal: ReturnType<typeof usableFaceCalibration>; level: () => number; on: boolean; vowel: string | null;
}) {
  useTick(90, on);
  const live = face.current?.live();
  const r = faceCal && live?.features.detected ? roundness(live.features, faceCal) : null;
  const zone = vowel === "i" ? { lo: 0, hi: 0.3 } : vowel ? { lo: 0.6, hi: 1 } : null;
  return (
    <div className="meters card flat">
      <div className="meter-row">
        <span className="meter-name">Lips</span>
        <div className="grow">
          <div className="lipline" role="img" aria-label={r === null ? "Lip meter off: tune to your voice with the camera on" : `Lips ${Math.round(r * 100)}% of the way from ee to oo`}>
            {zone && <span className="zone" style={{ left: `${zone.lo * 100}%`, width: `${(zone.hi - zone.lo) * 100}%` }} />}
            {r !== null && <span className="dot" style={{ left: `${r * 100}%` }} />}
          </div>
          {r === null ? <div className="ends"><span className="faint">Tune to your voice with the camera on to see your lips here.</span></div>
            : <div className="ends"><span>ee · spread</span><span>oo · rounded</span></div>}
        </div>
      </div>
      <div className="meter-row">
        <span className="meter-name">Mic</span>
        <div className="grow micline" aria-hidden><span style={{ width: `${on ? level() * 100 : 0}%` }} /></div>
      </div>
    </div>
  );
}

function Wave({ level }: { level: () => number }) {
  const bars = useRef<number[]>(Array(28).fill(0.06));
  useTick(80);
  bars.current = [...bars.current.slice(1), Math.max(0.06, level())];
  return <div className="wave" aria-hidden>{bars.current.map((v, i) => <span key={i} style={{ height: `${Math.round(4 + v * 30)}px` }} />)}</div>;
}

function Ago({ t }: { t: number }) {
  useTick(30_000);
  return <>{relativeTime(t, Date.now())}</>;
}

function HearIt({ prompt }: { prompt: PromptItem }) {
  const url = useRefAudio(prompt);
  const play = () => {
    if (url) return void new Audio(url).play().catch(() => undefined);
    try { const u = new SpeechSynthesisUtterance(prompt.hanzi); u.lang = "zh-CN"; u.rate = 0.75; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no speech */ }
  };
  return <button className="btn quiet" onClick={play}><Speaker size={17} />Hear it</button>;
}

/* ---------- results ---------- */

const VERDICT = {
  green: { word: "Nailed it", tone: "good" as const },
  amber: { word: "Almost", tone: "almost" as const },
  red: { word: "Try again", tone: "fix" as const },
};
const STATUS_WORD = { fix: "Fix", tip: "Tip", good: "Good", unsure: "Unsure" };

function HistoryChip({ take, active, onClick }: { take: Take; active: boolean; onClick: () => void }) {
  const v = useMemo(() => viewOf(take), [take]);
  return (
    <button role="tab" aria-selected={active} className={`hchip t-${VERDICT[v.ring].tone}`} onClick={onClick} aria-label={`${take.prompt.hanzi}, match ${v.match}`}>
      <span lang="zh-Hans">{take.prompt.hanzi.replace(/\s/g, "")}</span><b>{v.match}</b>
    </button>
  );
}

function Empty({ prompt, onAnalyzeFile }: { prompt: PromptItem; onAnalyzeFile: (f: File) => void }) {
  return (
    <div className="empty card">
      <h3>Say <span lang="zh-Hans">{prompt.hanzi}</span> and watch what your mouth does.</h3>
      <p className="muted">Press Record or the space bar and say it once. Orbi shows your pitch, lips and tongue next to a native speaker's.</p>
      <UploadLink onFile={onAnalyzeFile} />
    </div>
  );
}

function UploadLink({ onFile }: { onFile: (f: File) => void }) {
  return (
    <label className="link-btn upload">
      <Upload size={15} />Analyze a WAV file instead
      <input type="file" accept="audio/wav,.wav" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

const Result = memo(function Result({ take, l1, dim, onAnalyzeFile }: { take: Take; l1: L1Code; dim: boolean; onAnalyzeFile: (f: File) => void }) {
  const v = useMemo(() => viewOf({ ...take, l1 }), [take, l1]);
  const [details, setDetails] = useState(false);
  const verdict = VERDICT[v.ring];
  const name = `orbi-${take.prompt.id}-${take.id}`;
  return (
    <div className={`result ${dim ? "dim" : ""}`}>
      <section className="card summary enter">
        <div className="ring-box">
          <Ring value={v.match} tone={verdict.tone} />
          <span className="ring-num"><b>{v.match}</b><small>Match</small></span>
        </div>
        <div className="summary-text">
          <div className="verdict-line">
            <span className={`verdict t-${verdict.tone}`}><MarkIcon mark={verdict.tone} size={16} />{verdict.word}</span>
            <span className="muted"><span lang="zh-Hans" className="ink">{take.prompt.hanzi}</span> · {take.demo ? `demo: ${take.demo}` : <Ago t={take.createdAt} />}</span>
          </div>
          <ul className="chips" aria-label="Guidance">
            {v.chips.map((c) => <li key={c.area} className={`chip m-${c.mark}`}><span className="ic"><MarkIcon mark={c.mark} /></span>{c.area}<b>{c.word}</b></li>)}
          </ul>
        </div>
      </section>

      <section className="card pitch">
        <div className="card-head">
          <h3>Pitch</h3>
          <div className="legend"><span><i className="native" />Native</span><span><i className="you" />You</span></div>
        </div>
        <div className="chart-box"><PitchChart syllables={v.pitch} /></div>
        {v.callout && <p className="callout"><b>Tone change.</b> {v.callout}</p>}
      </section>

      {v.main.map((c) => <MainCard key={c.key} c={c} l1={l1} />)}

      {v.compact.length > 0 && <div className="compact-grid">{v.compact.map((c) => <CompactCard key={c.key} c={c} />)}</div>}

      <section className="card flat mouth">
        <div className="card-head">
          <h3>Mouth over time</h3>
          {v.timeline && (
            <div className="legend">
              <span><i className="s0" />Lip width</span><span><i className="s1" />Pucker</span><span><i className="s2" />Jaw opening</span><span><i className="win" />Vowel</span>
            </div>
          )}
        </div>
        {v.timeline ? <div className="chart-box"><MouthTimeline timeline={v.timeline} /></div>
          : <p className="muted small">{take.demo ? "Demo takes replay recorded results without camera frames." : "Turn on the camera before recording to see how your lips and jaw moved."}</p>}
      </section>

      <section className="card flat details">
        <button className="disclosure" aria-expanded={details} onClick={() => setDetails(!details)}>Details for nerds<Chevron open={details} /></button>
        {details && (
          <div className="details-body">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Syllable</th><th>Tone score</th><th>Pitch off (rmse)</th><th>Heard as</th><th>F1 / F2 / F3 (Hz)</th><th>Roundness</th></tr></thead>
                <tbody>{v.rows.map((r) => <tr key={r.syl}><td lang="zh-Hans">{r.syl}</td><td>{r.score}</td><td>{r.rmse}</td><td>{r.heard}</td><td>{r.formants}</td><td>{r.roundness}</td></tr>)}</tbody>
              </table>
            </div>
            <pre>{JSON.stringify({ audio: take.audio, face: take.face }, null, 2)}</pre>
            <div className="row">
              {take.wav && <button className="link-btn" onClick={() => download(take.wav!, `${name}.wav`)}><Download size={15} />Download WAV</button>}
              <button className="link-btn" onClick={() => download({ prompt: take.prompt.id, l1, audio: take.audio, face: take.face, frames: take.frames, cards: cardsOf({ ...take, l1 }), calibration: take.calibration }, `${name}.json`)}><Download size={15} />Download JSON</button>
              {take.wavUrl && <button className="link-btn" onClick={() => void new Audio(take.wavUrl).play()}><Play size={13} />Hear this take</button>}
              <UploadLink onFile={onAnalyzeFile} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
});

function StatusPill({ status }: { status: CardView["status"] }) {
  return <span className={`pill m-${status}`}><span className="ic"><MarkIcon mark={status} /></span>{STATUS_WORD[status]}</span>;
}

function MainCard({ c, l1 }: { c: CardView; l1: L1Code }) {
  const lang = L1S.find((l) => l.code === l1)?.name;
  return (
    <article className={`card insight s-${c.status} enter`}>
      <div className="insight-meta"><StatusPill status={c.status} /><span>{c.area} · <span lang="zh-Hans" className="ink">{c.syl}</span></span></div>
      <h3 className="insight-title">{c.headline}</h3>
      <p className="measured">{c.measured}</p>
      <div className={`insight-body ${c.tongue || c.lips ? "two" : ""}`}>
        {c.steps.length > 0 && (
          <div>
            <span className="eyebrow">Try this</span>
            <ol className="steps">{c.steps.map((s, i) => <li key={i}><span className="n">{i + 1}</span><span>{s}</span></li>)}</ol>
          </div>
        )}
        {c.tongue && <figure className="viz"><span className="eyebrow">Tongue map</span><TongueMap tongue={c.tongue} />
          <figcaption className="vizlegend"><span><i className="tgt" />Target</span><span><i className="you" />You</span></figcaption>
          {!c.tongue.you && <span className="overlay">Needs the camera to tell lips from tongue</span>}</figure>}
        {c.lips && <figure className="viz"><span className="eyebrow">Lip roundness</span><LipsBar lips={c.lips} /></figure>}
      </div>
      {c.note && <p className="note"><b>For {lang && lang !== "Another language" ? `${lang} speakers` : "you"}.</b> {c.note}</p>}
    </article>
  );
}

function CompactCard({ c }: { c: CardView }) {
  return (
    <article className={`card flat compact s-${c.status}`}>
      <div className="insight-meta"><StatusPill status={c.status} /><span>{c.area} · <span lang="zh-Hans" className="ink">{c.syl}</span></span></div>
      <h4>{c.headline}</h4>
      <p className="muted small">{c.measured}</p>
      {c.lips && <LipsBar lips={c.lips} small />}
      {c.tongue && <div className="viz small"><TongueMap tongue={c.tongue} small /></div>}
    </article>
  );
}
