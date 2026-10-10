// Pure audio helpers for capture (SPEC.md Module A): downsampling, 16-bit WAV encoding, the pre-send level check.
export const TARGET_RATE = 16000;

/** Average the input samples under each output sample: a cheap low-pass plus decimation. */
export function downsample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 0x7fff), true));
  return new Blob([buf], { type: "audio/wav" });
}

export type LevelProblem = "too_quiet" | "clipped";

export const LEVEL_MESSAGES: Record<LevelProblem, string> = {
  too_quiet: "I couldn't hear you, try a bit louder.",
  clipped: "That was a little too loud. Move back from the mic a little.",
};

/** Reject a take whose peak is under −30 dBFS, or with more than 1% clipped samples. */
export function levelCheck(samples: Float32Array): LevelProblem | null {
  let peak = 0;
  let clipped = 0;
  for (const x of samples) {
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
  }
  if (peak < 10 ** (-30 / 20)) return "too_quiet";
  return clipped > samples.length * 0.01 ? "clipped" : null;
}

/** 0–1 for a level meter: −60 dBFS and below is empty, 0 dBFS is full. */
export const meterLevel = (rms: number) => Math.max(0, Math.min(1, (20 * Math.log10(rms + 1e-9) + 60) / 60));
