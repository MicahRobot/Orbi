import { describe, expect, it } from "vitest";
import { PROMPTS } from "../content/prompts";
import { fixtureAnalysis, fixtureCalibration } from "../fixtures";
import { corrections, detectPitch, hzToLevel, keyPoints, liveState, liveStep, liveTargets, targetAt, templateFor } from "./pitch";

describe("tone templates match the service", () => {
  it.each(PROMPTS.map((p) => [p.id, p] as const))("%s", (_, p) => {
    const fromService = fixtureAnalysis(p.id, "correct").syllables.map((s) => s.tone.targetChao);
    liveTargets(p).forEach((t, i) => t.target.forEach((v, k) => expect(v).toBeCloseTo(fromService[i][k], 1)));
  });
  it("draws a flat neutral tone at the given height", () => expect(templateFor("T5", 4)).toEqual(Array(10).fill(4)));
});

describe("detectPitch", () => {
  const tone = (hz: number, sr = 48000, n = 2048, amp = 0.3) => Float32Array.from({ length: n }, (_, i) =>
    amp * (Math.sin((2 * Math.PI * hz * i) / sr) + 0.5 * Math.sin((4 * Math.PI * hz * i) / sr) + 0.25 * Math.sin((6 * Math.PI * hz * i) / sr)));
  it.each([90, 140, 220, 330])("finds %d Hz in a voice-like tone", (hz) => {
    expect(detectPitch(tone(hz), 48000)!).toBeCloseTo(hz, -0.3);   // within ~1 Hz
  });
  it("returns null for silence and noise", () => {
    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull();
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    const noise = Float32Array.from({ length: 2048 }, () => 0.2 * rand());
    expect(detectPitch(noise, 48000)).toBeNull();
  });
});

describe("hzToLevel", () => {
  const f0 = fixtureCalibration.audio.f0;
  it("puts your low note at 1 and your high note at 5", () => {
    expect(hzToLevel(f0.lowHz, f0)).toBeCloseTo(1);
    expect(hzToLevel(f0.highHz, f0)).toBeCloseTo(5);
    expect(hzToLevel(10, f0)).toBe(0.5);
  });
});

describe("corrections", () => {
  it("麻 dipping before the rise: rise sooner (its end is just inside the band)", () => {
    const s = fixtureAnalysis("ma4", "t2_dip").syllables[1].tone;
    const c = corrections(s.producedChao, s.targetChao);
    expect(c.map((x) => x.label)).toEqual(["Rise sooner"]);
    expect(c[0].index).toBe(6);   // the widest gap: 2.0 against 4.04
    expect(c[0].to).toBeGreaterThan(c[0].from);
  });
  it("a shallow tone 4 should finish lower", () => {
    const s = fixtureAnalysis("ma4", "t4_shallow").syllables[3].tone;
    expect(corrections(s.producedChao, s.targetChao).map((x) => x.label)).toContain("Finish lower");
  });
  it("a matched syllable gets no arrows", () => {
    const s = fixtureAnalysis("ma4", "correct").syllables[1].tone;
    expect(corrections(s.producedChao, s.targetChao)).toEqual([]);
  });
});

describe("keyPoints", () => {
  it("麻: start fine, dips too low and too late, end just inside the band", () => {
    const s = fixtureAnalysis("ma4", "t2_dip").syllables[1].tone;
    expect(keyPoints(s.producedChao, s.targetChao).map((k) => [k.name, k.verdict])).toEqual([
      ["Start", "ok"], ["Lowest point", "too low"], ["Lowest point at", "too late"], ["End", "ok"],
    ]);
  });
  it("tone 4 has no low-point timing", () => {
    expect(keyPoints(templateFor("T4"), templateFor("T4")).map((k) => k.name)).toEqual(["Start", "Lowest point", "End"]);
  });
});

describe("targetAt", () => {
  it("interpolates and clamps", () => {
    const t = templateFor("T4");
    expect(targetAt(t, 0)).toBe(5);
    expect(targetAt(t, 1)).toBe(1);
    expect(targetAt(t, 0.5)).toBeCloseTo(3);
    expect(targetAt(t, 2)).toBe(1);
  });
});

describe("liveStep", () => {
  /** Frames every 33 ms: `levels` is one entry per frame, null = unvoiced. */
  function run(levels: (number | null)[], syllables: number) {
    const s = liveState(), out: { syllable: number; level: number }[] = [];
    levels.forEach((l, i) => { const p = liveStep(s, 1000 + i * 33, l, syllables); if (p) out.push(p); });
    return out;
  }
  const voiced = (n: number, v: number) => Array<number>(n).fill(v);
  const gap = (n: number) => Array<null>(n).fill(null);

  it("recovers from an octave slip at the onset", () => {
    const out = run([4.9, ...voiced(10, 2.8)], 1);   // first frame doubled, then the real pitch
    expect(out.length).toBeGreaterThan(6);
    expect(out.at(-1)!.level).toBeCloseTo(2.8);
  });
  it("keeps a single tone 3 on one syllable through a creaky dropout", () => {
    const out = run([...voiced(4, 2), ...gap(6), ...voiced(5, 3.5)], 1);
    expect(new Set(out.map((p) => p.syllable))).toEqual(new Set([0]));
    expect(out.at(-1)!.level).toBeCloseTo(3.5);
  });
  it("a real pause after enough of a syllable starts the next one", () => {
    const out = run([...voiced(10, 5), ...gap(8), ...voiced(8, 3)], 4);
    expect([...new Set(out.map((p) => p.syllable))]).toEqual([0, 1]);
  });
  it("ignores voicing after the last syllable", () => {
    const out = run([...voiced(10, 5), ...gap(8), ...voiced(10, 3), ...gap(8), ...voiced(10, 1)], 2);
    expect(Math.max(...out.map((p) => p.syllable))).toBe(1);
    expect(out.every((p) => p.level !== 1)).toBe(true);
  });
});
