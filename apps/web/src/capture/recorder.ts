// Microphone capture (SPEC.md Module A): AudioWorklet → raw PCM → 16 kHz mono WAV, auto-stop after silence, level check.
import { downsample, encodeWav, levelCheck, type LevelProblem } from "./wav";

// shortcut: a fixed speech threshold; raise it if room noise keeps takes from auto-stopping (SPEC.md "Risks").
const SPEECH_DBFS = -40;
const BLOCK_SEC = 0.02;   // loudness is judged on 20 ms blocks

const WORKLET = `registerProcessor("orbi-pcm", class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;

/** Mic (and camera when the face loop is live). Processing off: it bends pitch. */
export function openMedia(video: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
    video: video && { width: 640, height: 480, facingMode: "user" },
  });
}

export interface Take {
  wav: Blob;
  t0: number;             // performance.now() when capture started: the clock the face loop stamps frames with
  durationSec: number;
  problem: LevelProblem | null;
}

export interface RecordOptions {
  maxSec: number;
  silenceMs?: number;     // stop this long after speech ends; omit to always record maxSec
  onLevel?: (rms: number) => void;
}

/** Starts recording right away. `done` resolves after auto-stop, maxSec or stop(). */
export async function record(stream: MediaStream, opts: RecordOptions): Promise<{ done: Promise<Take>; stop: () => void }> {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "orbi-pcm");
  source.connect(node);
  node.connect(ctx.destination);   // keeps the node running; it outputs silence
  await ctx.resume();

  const rate = ctx.sampleRate;
  const blockLen = Math.round(rate * BLOCK_SEC);
  const chunks: Float32Array[] = [];
  let sumSq = 0, inBlock = 0, heard = false, quietMs = 0, stopped = false;
  let finish!: (take: Take) => void;
  const done = new Promise<Take>((resolve) => { finish = resolve; });
  const t0 = performance.now();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
    void ctx.close();
    const raw = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    chunks.reduce((at, c) => (raw.set(c, at), at + c.length), 0);
    finish({ wav: encodeWav(downsample(raw, rate)), t0, durationSec: raw.length / rate, problem: levelCheck(raw) });
  };
  const timer = setTimeout(stop, opts.maxSec * 1000);

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data);
    for (const x of e.data) sumSq += x * x;
    inBlock += e.data.length;
    if (inBlock < blockLen) return;
    const rms = Math.sqrt(sumSq / inBlock);
    const blockMs = (inBlock / rate) * 1000;
    sumSq = 0;
    inBlock = 0;
    opts.onLevel?.(rms);
    if (20 * Math.log10(rms + 1e-9) > SPEECH_DBFS) { heard = true; quietMs = 0; }
    else if (heard && opts.silenceMs && (quietMs += blockMs) >= opts.silenceMs) stop();
  };
  return { done, stop };
}
