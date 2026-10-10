// The 11 practice prompts from SPEC.md "Content". Lane B owns this file.
import type { PromptItem } from "@shared/contracts/types";

export const PROMPTS: PromptItem[] = [
  { id: "ma4", hanzi: "妈 麻 马 骂", pinyin: ["ma1", "ma2", "ma3", "ma4"], gloss: "mother, hemp, horse, scold", reading: "list", focus: ["tone"] },
  { id: "nihao", hanzi: "你好", pinyin: ["ni3", "hao3"], gloss: "hello", reading: "word", focus: ["tone"] },
  { id: "nv", hanzi: "女", pinyin: ["nv3"], gloss: "woman", reading: "word", focus: ["vowel", "tone"], vowelTargets: ["y"], targetVisual: "rounded" },
  { id: "ni", hanzi: "你", pinyin: ["ni3"], gloss: "you", reading: "word", focus: ["vowel"], vowelTargets: ["i"], targetVisual: "spread" },
  { id: "nu", hanzi: "努", pinyin: ["nu3"], gloss: "to strive", reading: "word", focus: ["vowel"], vowelTargets: ["u"], targetVisual: "rounded" },
  { id: "qu", hanzi: "去", pinyin: ["qu4"], gloss: "to go", reading: "word", focus: ["vowel"], vowelTargets: ["y"], targetVisual: "rounded" },
  { id: "yu", hanzi: "鱼", pinyin: ["yu2"], gloss: "fish", reading: "word", focus: ["vowel", "tone"], vowelTargets: ["y"], targetVisual: "rounded" },
  { id: "bushi", hanzi: "不是", pinyin: ["bu4", "shi4"], gloss: "is not", reading: "word", focus: ["tone"] },
  { id: "yige", hanzi: "一个", pinyin: ["yi1", "ge4"], gloss: "one (of something)", reading: "word", focus: ["tone"] },
  { id: "laoshi", hanzi: "老师", pinyin: ["lao3", "shi1"], gloss: "teacher", reading: "word", focus: ["tone"] },
  { id: "zhongguo", hanzi: "中国", pinyin: ["zhong1", "guo2"], gloss: "China", reading: "word", focus: ["tone"] },
];

export const PRACTICE_SETS: Record<string, string[]> = {
  Tones: ["ma4", "zhongguo", "laoshi"],
  Sandhi: ["nihao", "bushi", "yige"],
  "The ü sound": ["nv", "ni", "nu", "qu", "yu"],
};
