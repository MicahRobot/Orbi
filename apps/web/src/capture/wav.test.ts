import { describe, expect, it } from "vitest";
import { downsample, encodeWav, levelCheck, meterLevel } from "./wav";

const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 10));

describe("downsample", () => {
  it("averages 48 kHz down to 16 kHz", () => {
    const out = downsample(Float32Array.from([0, 0.3, 0.6, 1, 1, 1]), 48000);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBe(1);
  });

  it("handles 44.1 kHz and keeps the duration", () => {
    expect(downsample(new Float32Array(44100), 44100).length).toBe(16000);
  });

  it("repeats samples when the device rate is below 16 kHz", () => {
    expect([...downsample(Float32Array.from([0.5, -0.5]), 8000)]).toEqual([0.5, 0.5, -0.5, -0.5]);
  });
});

describe("encodeWav", () => {
  it("writes a 16 kHz mono 16-bit header and clamped samples", async () => {
    const v = new DataView(await encodeWav(Float32Array.from([0, 1, -2])).arrayBuffer());
    const text = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(at + i)));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 16000, 16, 6]);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32767]);
  });
});

describe("levelCheck", () => {
  it("passes a normal take", () => expect(levelCheck(tone(16000, 0.3))).toBeNull());
  it("rejects a take that peaks under −30 dBFS", () => expect(levelCheck(tone(16000, 0.02))).toBe("too_quiet"));
  it("rejects more than 1% clipped samples", () => expect(levelCheck(tone(16000, 1.5))).toBe("clipped"));
});

describe("meterLevel", () => {
  it("maps −60..0 dBFS to 0..1", () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(1)).toBeCloseTo(1);
    expect(meterLevel(0.001)).toBeCloseTo(0);
  });
});
