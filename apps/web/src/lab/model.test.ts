import { describe, expect, it } from "vitest";
import type { FaceFeatures } from "@shared/contracts/types";
import { PROMPTS } from "../content/prompts";
import { fixtureAnalysis, fixtureCalibration, fixtureFace } from "../fixtures";
import { relativeTime, timelineOf, viewOf, type Take } from "./model";

const take = (promptId: string, variant: string, withFace = true): Take => ({
  id: 1, prompt: PROMPTS.find((p) => p.id === promptId)!, createdAt: 0,
  audio: fixtureAnalysis(promptId, variant), frames: [], face: withFace ? fixtureFace(promptId, variant) : [],
  calibration: fixtureCalibration.audio, faceCal: null, l1: "en",
});
const areas = (cards: { area: string }[]) => cards.map((c) => c.area);

describe("Lab view of a take", () => {
  it("女 'noo': tongue is the big card, lips are fine", () => {
    const v = viewOf(take("nv", "noo"));
    expect(areas(v.main)).toEqual(["Tongue"]);
    expect(v.main[0]).toMatchObject({ status: "fix", headline: "Keep your tongue forward", syl: "女 nǚ" });
    expect(v.main[0].note).toContain("English has no ü");
    expect(v.main[0].tongue!.you![0]).toBeGreaterThan(0.6);       // x: toward the back
    expect(v.compact.find((c) => c.area === "Lips")).toMatchObject({ status: "good", lips: { lo: 0.6, hi: 1 } });
    expect(v.chips.map((c) => [c.area, c.mark])).toEqual([["Pitch", "good"], ["Lips", "good"], ["Tongue", "fix"]]);
    expect(v.ring).toBe("red");
  });

  it("女 'nee': the reverse", () => {
    const v = viewOf(take("nv", "nee"));
    expect(areas(v.main)).toEqual(["Lips"]);
    expect(v.main[0].lips!.you).toBeLessThan(0.3);
    expect(v.compact.find((c) => c.area === "Tongue")?.status).toBe("good");
  });

  it("女 'noo' without the camera: the tongue can't be told apart", () => {
    const v = viewOf(take("nv", "noo", false));
    const tongue = [...v.main, ...v.compact].find((c) => c.area === "Tongue")!;
    expect(tongue).toMatchObject({ status: "unsure", tongue: { you: null } });
  });

  it("never shows a 'Good' lips chip when the camera saw nothing", () => {
    const v = viewOf(take("nv", "correct", false));
    expect(v.chips.find((c) => c.area === "Lips")).toMatchObject({ mark: "unsure", word: "Not seen" });
    expect(viewOf(take("nv", "correct")).chips.find((c) => c.area === "Lips")?.mark).toBe("good");
  });

  it("妈麻马骂 with a dipped 麻 flags only 麻's pitch", () => {
    const v = viewOf(take("ma4", "t2_dip"));
    expect(v.pitch.map((s) => s.flag)).toEqual([false, true, false, false]);
    expect(v.pitch[1].label).toBe("麻 má");
    expect(v.main[0]).toMatchObject({ area: "Pitch", headline: "Rise right away" });
    expect(v.chips.find((c) => c.area === "Lips")).toMatchObject({ mark: "off", word: "Not checked" });
    expect(v.ring).toBe("amber");
  });

  it("你好: tone-change callout, praised only when it was done", () => {
    expect(viewOf(take("nihao", "full_dips")).callout).toBe("你 changes tone here (3+3 → 2+3).");
    expect(viewOf(take("nihao", "correct")).callout).toBe("你 changes tone here (3+3 → 2+3). You did it.");
    expect(viewOf(take("nv", "correct")).callout).toBeNull();
  });

  it("puts pitch on a 0–1 scale and fills the details rows", () => {
    const v = viewOf(take("nv", "correct"));
    expect(Math.max(...v.pitch[0].native)).toBeLessThanOrEqual(1);
    expect(Math.min(...v.pitch[0].native)).toBeGreaterThanOrEqual(0);
    expect(v.rows[0]).toMatchObject({ syl: "女 nǚ", heard: "ü (60%)" });
    expect(v.ring).toBe("green");
  });
});

describe("mouth timeline", () => {
  const f = (t: number, lipWidth: number, detected = true): FaceFeatures => ({ t, detected, lipWidth, lipHeight: 0.1, pucker: 0.5, funnel: 0, jawOpen: 0.2, smile: 0 });
  const audio = fixtureAnalysis("nv", "correct");
  it("needs real frames, never invents a line", () => {
    expect(timelineOf([], audio, null, ["女"])).toBeNull();
    expect(timelineOf([f(0.1, 0.4, false), f(0.2, 0.4, false), f(0.3, 0.4, false)], audio, null, ["女"])).toBeNull();
  });
  it("scales lip width between your 'oo' and 'ee' and marks the vowel window", () => {
    const cal = { ...fixtureCalibration.face, ee: { ...fixtureCalibration.face.ee, lipWidth: 0.5 }, oo: { ...fixtureCalibration.face.oo, lipWidth: 0.3 } };
    const tl = timelineOf([f(0.1, 0.5), f(0.2, 0.4), f(0.3, 0.3)], audio, cal, ["女"])!;
    expect(tl.series[0].map(([, v]) => v)).toEqual([1, expect.closeTo(0.5), 0]);
    expect(tl.windows[0].label).toBe("女");
    expect(tl.windows[0].a).toBeGreaterThan(0);
    expect(tl.windows[0].b).toBeLessThanOrEqual(1);
  });
});

describe("relativeTime", () => {
  it.each([[10_000, "just now"], [120_000, "2 min ago"], [7_200_000, "2 h ago"]])("%d ms → %s", (ms, text) => expect(relativeTime(0, ms)).toBe(text));
});
