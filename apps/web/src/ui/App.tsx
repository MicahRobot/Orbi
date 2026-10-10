// The app shell: which screen is up, the learner's profile and attempts, and what happens after each attempt
// (diagnose → score → save in the background → swap in Gemini tips). Screens: SPEC.md Module F.
import { useEffect, useState } from "react";
import type { AttemptRecord, AudioAnalysis, FaceSummary, FeedbackItem, Profile, PromptItem } from "@shared/contracts/types";
import { coach, LIVE_AUDIO } from "../api/audio";
import { PROMPTS } from "../content/prompts";
import { streakFor } from "../data/progress";
import { loadAttempts, loadProfile, saveAttempt, saveProfile } from "../data/store";
import { diagnose } from "../diagnosis";
import { FIXTURES, fixtureAnalysis, fixtureCalibration, fixtureFace } from "../fixtures";
import { Home } from "./Home";
import { Onboarding } from "./Onboarding";
import { Practice } from "./Practice";
import { Results } from "./Results";
import { nextPromptId, summarize, type Ring } from "./scoring";

export interface Attempt {
  prompt: PromptItem;
  audio: AudioAnalysis;
  face: FaceSummary[];
  cards: FeedbackItem[];
  match: number;
  ring: Ring;
  passed: boolean;
  streak: number;
  wavUrl?: string;
  previous?: AudioAnalysis;   // the last try at this word, drawn faintly on the pitch panel
}

type Screen =
  | { name: "loading" }
  | { name: "onboarding"; redo?: Profile }
  | { name: "home" }
  | { name: "practice"; promptId: string }
  | { name: "results"; attempt: Attempt; demoStep?: number };

const DEMO = FIXTURES.filter((f) => f.beat);
const promptById = (id: string) => PROMPTS.find((p) => p.id === id)!;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [demoAttempts, setDemoAttempts] = useState<AttemptRecord[]>([]);
  const [lastTry, setLastTry] = useState<Record<string, AudioAnalysis>>({});

  useEffect(() => {
    void Promise.all([loadProfile(), loadAttempts()]).then(([p, a]) => {
      setProfile(p);
      setAttempts(a);
      setScreen(p ? { name: "home" } : { name: "onboarding" });
    });
  }, []);

  // Back to the top on every new screen, but not when Gemini's tips swap into the same results.
  const page = screen.name === "practice" ? screen.promptId : screen.name === "results" ? screen.attempt.audio : null;
  useEffect(() => { window.scrollTo(0, 0); }, [screen.name, page]);

  const l1 = profile?.l1 ?? "en";

  function finish(prompt: PromptItem, audio: AudioAnalysis, face: FaceSummary[], wavUrl?: string, demoStep?: number) {
    const cards = diagnose(prompt, audio, face, l1);
    const score = summarize(audio, cards);
    const record: AttemptRecord = {
      promptId: prompt.id, passed: score.passed, score: score.match, issueIds: cards.map((c) => c.diagnosis.issueId), createdAt: new Date().toISOString(),
    };
    // Demo mode replays fixtures: it keeps its own history and never touches the learner's progress.
    const history = [...(demoStep === undefined ? attempts : demoStep === 0 ? [] : demoAttempts), record];
    if (demoStep === undefined) {
      setAttempts(history);
      void saveAttempt(record);
    } else setDemoAttempts(history);

    const attempt: Attempt = { prompt, audio, face, cards, ...score, streak: streakFor(history, prompt.id), wavUrl, previous: lastTry[prompt.id] };
    setLastTry((t) => ({ ...t, [prompt.id]: audio }));
    setScreen({ name: "results", attempt, demoStep });

    if (LIVE_AUDIO) {
      void coach(prompt, cards, l1).then((tips) => {
        if (!tips.length) return;
        const coached = cards.map((c) => ({ ...c, coaching: tips.find((t) => t.issueId === c.diagnosis.issueId)?.text ?? c.coaching }));
        setScreen((s) => (s.name === "results" && s.attempt === attempt ? { ...s, attempt: { ...attempt, cards: coached } } : s));
      });
    }
  }

  function demo(step: number) {
    const f = DEMO[step];
    finish(promptById(f.promptId), fixtureAnalysis(f.promptId, f.variant), fixtureFace(f.promptId, f.variant), undefined, step);
  }

  function saveAndGoHome(p: Profile) {
    setProfile(p);
    void saveProfile(p);
    setScreen({ name: "home" });
  }

  switch (screen.name) {
    case "loading":
      return <main className="page center"><span className="spinner" aria-label="Loading" /></main>;
    case "onboarding":
      return <Onboarding redo={screen.redo} onDone={saveAndGoHome} />;
    case "home":
      return (
        <Home attempts={attempts} onPractice={(promptId) => setScreen({ name: "practice", promptId })} onDemo={() => demo(0)}
          onRecalibrate={() => setScreen({ name: "onboarding", redo: profile ?? { l1 } })} />
      );
    case "practice": {
      const prompt = promptById(screen.promptId);
      return (
        <Practice key={prompt.id} prompt={prompt} calibration={profile?.calibration ?? fixtureCalibration}
          onResult={(audio, face, wavUrl) => finish(prompt, audio, face, wavUrl)} onHome={() => setScreen({ name: "home" })} />
      );
    }
    case "results": {
      const { attempt, demoStep } = screen;
      return (
        <Results attempt={attempt}
          onRetry={() => setScreen({ name: "practice", promptId: attempt.prompt.id })}
          onNext={() => setScreen({ name: "practice", promptId: nextPromptId(attempt.prompt.id) })}
          onHome={() => setScreen({ name: "home" })}
          demo={demoStep === undefined ? undefined : {
            step: demoStep, total: DEMO.length, beat: DEMO[demoStep].beat,
            onNext: demoStep + 1 < DEMO.length ? () => demo(demoStep + 1) : undefined,
            onExit: () => setScreen({ name: "home" }),
          }} />
      );
    }
  }
}
