// SPEC.md B1: written tones to surface tone targets.
import type { PromptItem, SyllableTarget, Tone, ToneVariant } from "@shared/contracts/types";

const VARIANT: Record<Tone, ToneVariant> = { 1: "T1", 2: "T2", 3: "T3_full", 4: "T4", 5: "T5" };
const MARKED: Record<string, string> = { bu2: "bú", yi2: "yí", yi4: "yì" };

export function targetsFor(prompt: PromptItem): SyllableTarget[] {
  const hanzi = [...prompt.hanzi.replace(/\s/g, "")];
  const tones = prompt.pinyin.map((p) => Number(p.at(-1)) as Tone);
  const notes: (string | undefined)[] = tones.map(() => undefined);
  const isolated = prompt.reading === "list";
  const last = tones.length - 1;

  if (!isolated) {
    // Rules 1–2: 不 and 一, decided by the written tone of the next syllable.
    tones.forEach((tone, i) => {
      const next = prompt.pinyin[i + 1] ? Number(prompt.pinyin[i + 1].at(-1)) : undefined;
      let surface = tone;
      if (hanzi[i] === "不" && next === 4) surface = 2;
      if (hanzi[i] === "一" && next !== undefined && next !== 5) surface = next === 4 ? 2 : 4;
      if (surface !== tone) {
        tones[i] = surface;
        notes[i] = `${hanzi[i]} before tone ${next} → ${MARKED[`${prompt.pinyin[i].slice(0, -1)}${surface}`]}`;
      }
    });
    // Rule 3: in a run of third tones, all but the last become tone 2.
    for (let i = 0; i < last; i++) {
      if (tones[i] === 3 && tones[i + 1] === 3) {
        tones[i] = 2;
        notes[i] = "3+3 → 2+3";
      }
    }
  }

  return prompt.pinyin.map((pinyin, index) => {
    const surfaceTone = tones[index];
    // Rule 4: a non-final tone 3 is the half third tone.
    const half = !isolated && surfaceTone === 3 && index < last;
    const sandhiNote = half ? "half third tone: stays low" : notes[index];
    const vowel = prompt.vowelTargets?.[index] ?? undefined;
    return {
      index,
      pinyin,
      surfaceTone,
      variant: half ? "T3_half" : VARIANT[surfaceTone],
      ...(sandhiNote && { sandhiNote }),
      ...(vowel && { vowel }),
    };
  });
}
