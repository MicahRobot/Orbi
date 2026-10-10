// Small pieces more than one screen uses.
import { useEffect, useState } from "react";
import type { PromptItem } from "@shared/contracts/types";
import type { TeacherPose } from "../teacher";
import { toneMarks } from "./scoring";

export function WordHeader({ prompt, compact = false }: { prompt: PromptItem; compact?: boolean }) {
  return (
    <header className={`word ${compact ? "compact" : ""}`}>
      <p className="hanzi" lang="zh-Hans">{prompt.hanzi}</p>
      <p className="pinyin">{prompt.pinyin.map(toneMarks).join(" ")}</p>
      <p className="gloss">{prompt.gloss}</p>
    </header>
  );
}

/** The teacher's target pose for a vowel word. */
export const poseFor = (prompt: PromptItem): TeacherPose => prompt.vowelTargets?.find((v) => v) ?? "rest";

/** `/ref/<id>.wav` if it exists. Vite answers missing files with index.html, so check that it's audio. */
export function useRefAudio(prompt: PromptItem): string | null {
  const url = prompt.refAudioUrl ?? `/ref/${prompt.id}.wav`;
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let current = true;
    setOk(false);
    fetch(url, { method: "HEAD" })
      .then((r) => current && setOk(r.ok && (r.headers.get("content-type") ?? "").startsWith("audio")))
      .catch(() => undefined);
    return () => { current = false; };
  }, [url]);
  return ok ? url : null;
}

export const play = (url: string) => void new Audio(url).play().catch((e) => console.warn("Couldn't play", url, e));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
