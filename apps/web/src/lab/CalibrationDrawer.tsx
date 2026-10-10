// "Tune to my voice": the shared calibration (capture/calibration.ts) in a side sheet. Uses the Lab's one stream and
// face session; a failed run never replaces the calibration you already have.
import { useEffect, useRef, useState } from "react";
import type { Calibration } from "@shared/contracts/types";
import type { CalibrationTakes } from "../api/audio";
import { type CalProgress, runCalibration, stepsFor } from "../capture/calibration";
import { meterLevel } from "../capture/wav";
import type { FaceSession } from "../face/session";
import { serviceError } from "./errors";
import { Check, Close, Download } from "./icons";

type Phase = "ready" | "running" | "sending" | "done" | "failed";

export function CalibrationDrawer({ open, stream, getFace, onClose, onNeedMedia, onDone, download }: {
  open: boolean;
  stream: MediaStream | null;
  getFace: () => FaceSession | null;   // read at run time: opening the camera from here starts the face loop
  onClose: () => void;
  onNeedMedia: () => Promise<MediaStream | null>;
  onDone: (c: Calibration) => void;
  download: (blob: Blob, name: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState<CalProgress>({ index: 0, phase: "prep" });
  const [stepStart, setStepStart] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [takes, setTakes] = useState<CalibrationTakes | null>(null);
  const [, tick] = useState(0);
  const face = getFace();
  const steps = stepsFor(!!face);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const busy = phase === "running" || phase === "sending";

  useEffect(() => { if (open) { closeBtn.current?.focus(); if (phase === "done" || phase === "failed") setPhase("ready"); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [busy]);

  async function start() {
    setError("");
    const s = stream ?? (await onNeedMedia());
    if (!s) return setError("Orbi needs your microphone. Allow it in the address bar, then try again.");
    setPhase("running");
    try {
      const result = await runCalibration(s, getFace() ?? undefined, {
        onProgress: (p) => { setProgress(p); setStepStart(performance.now()); },
        onLevel: (rms) => setLevel(meterLevel(rms)),
        prepMs: 800,
      });
      setPhase("sending");
      setTakes(result.takes);
      onDone(result.calibration);
      setPhase("done");
    } catch (e) {
      console.error(e);
      const err = serviceError(e);
      setError(err.kind === "rejected" ? `${err.detail} Try once more, a little louder and steadier.` : err.detail);
      setPhase("failed");
    } finally {
      setLevel(0);
    }
  }

  if (!open) return null;
  const step = steps[Math.min(progress.index, steps.length - 1)];
  const remaining = progress.phase === "rec" ? Math.max(1, Math.ceil(step.sec - (performance.now() - stepStart) / 1000)) : null;
  const doneIdx = phase === "done" || phase === "sending" ? steps.length : phase === "running" ? progress.index : 0;

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cal-title">
        <div className="sheet-head">
          <div>
            <h2 id="cal-title">Tune to my voice</h2>
            <p className="muted">{steps.length} short steps, about 10 seconds.</p>
          </div>
          <button ref={closeBtn} className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><Close /></button>
        </div>

        <div className="cal-progress" aria-hidden>
          {steps.map((s, i) => <span key={s.key} className={i < doneIdx ? "done" : i === progress.index && phase === "running" ? "now" : ""} />)}
        </div>

        <div className="cal-now">
          <div className="cal-cam">
            {stream?.getVideoTracks().length ? <video autoPlay muted playsInline ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} /> : <span>Camera off</span>}
          </div>
          <div className="cal-text" aria-live="polite">
            <span className="eyebrow">{phase === "done" ? "All set" : phase === "sending" ? "Almost there" : `Step ${Math.min(progress.index + 1, steps.length)} of ${steps.length}`}</span>
            <strong>{phase === "done" ? "Orbi is tuned to you" : phase === "sending" ? "Learning your voice…" : phase === "running" ? step.title : "Ready when you are"}</strong>
            <span className="muted">
              {phase === "done" ? `Pitch lines${face ? " and the lip meter" : ""} now use your own range.`
                : phase === "running" ? (progress.phase === "prep" ? "Get ready…" : step.sub)
                : phase === "sending" ? "Checking the takes." : "Find a quiet spot, face the camera, and press Start."}
            </span>
          </div>
        </div>

        <div className="cal-action">
          <div className={`cal-count ${progress.phase === "rec" && phase === "running" ? "rec" : ""} ${phase === "done" ? "ok" : ""}`}>
            {phase === "done" ? <Check size={26} /> : remaining ?? (phase === "running" ? "·" : "10s")}
          </div>
          {phase === "done"
            ? <button className="btn primary grow" onClick={onClose}>Done</button>
            : <button className="btn primary grow" onClick={() => void start()} disabled={busy}>{busy ? (progress.phase === "rec" ? "Recording…" : "Get ready…") : phase === "failed" ? "Try again" : "Start"}</button>}
        </div>
        {phase === "running" && progress.phase === "rec" && step.key !== "relaxed" && (
          <div className="meter" aria-hidden><span style={{ width: `${level * 100}%` }} /></div>
        )}
        {error && <p className="alert" role="alert">{error}</p>}

        <ol className="cal-steps">
          {steps.map((s, i) => {
            const state = i < doneIdx ? "done" : i === progress.index && phase === "running" ? "now" : "";
            return (
              <li key={s.key} className={state}>
                <span className="num">{state === "done" ? <Check size={14} /> : i + 1}</span>
                <span className="grow">{s.title}</span>
                <span className="faint tabular">{s.sec} s</span>
              </li>
            );
          })}
        </ol>

        {takes && (
          <div className="cal-downloads">
            <span className="eyebrow">Takes for tuning</span>
            <div className="row">
              {(Object.keys(takes) as (keyof CalibrationTakes)[]).map((k) => (
                <button key={k} className="link-btn" onClick={() => download(takes[k], `calib.${k}.wav`)}><Download size={15} />{k}.wav</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
