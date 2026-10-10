// Cases the fixtures don't cover: SPEC.md B1 rules on made-up words.
import { describe, expect, it } from "vitest";
import type { PromptItem } from "@shared/contracts/types";
import { targetsFor } from "./sandhi";

const word = (hanzi: string, pinyin: string[], reading: PromptItem["reading"] = "word"): PromptItem =>
  ({ id: "t", hanzi, pinyin, gloss: "", reading, focus: ["tone"] });
const surface = (p: PromptItem) => targetsFor(p).map((t) => [t.surfaceTone, t.variant, t.sandhiNote]);

describe("targetsFor sandhi rules", () => {
  it("不 changes only before tone 4", () => {
    expect(surface(word("不好", ["bu4", "hao3"]))[0]).toEqual([4, "T4", undefined]);
  });

  it("一 becomes yì before tones 1, 2 and 3, and stays yi1 when final", () => {
    expect(surface(word("一天", ["yi1", "tian1"]))[0]).toEqual([4, "T4", "一 before tone 1 → yì"]);
    expect(surface(word("一起", ["yi1", "qi3"]))[0]).toEqual([4, "T4", "一 before tone 3 → yì"]);
    expect(surface(word("十一", ["shi2", "yi1"]))[1]).toEqual([1, "T1", undefined]);
  });

  it("a run of three third tones keeps only the last one", () => {
    expect(surface(word("我很好", ["wo3", "hen3", "hao3"]))).toEqual([
      [2, "T2", "3+3 → 2+3"],
      [2, "T2", "3+3 → 2+3"],
      [3, "T3_full", undefined],
    ]);
  });

  it("list reading treats every syllable as isolated", () => {
    expect(surface(word("你 好", ["ni3", "hao3"], "list"))).toEqual([
      [3, "T3_full", undefined],
      [3, "T3_full", undefined],
    ]);
  });

  it("neutral tone keeps the T5 variant", () => {
    expect(surface(word("妈妈", ["ma1", "ma5"]))[1]).toEqual([5, "T5", undefined]);
  });
});
