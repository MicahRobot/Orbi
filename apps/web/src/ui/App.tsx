// Placeholder screen proving the fixture pipeline: fixture analysis -> diagnose() -> cards.
// Lane A replaces this with the four screens in SPEC.md Module F.
import { useState } from "react";
import { PROMPTS } from "../content/prompts";
import { diagnose } from "../diagnosis";
import { FIXTURES, fixtureAnalysis, fixtureFace } from "../fixtures";
import { TeacherHead } from "../teacher";

export default function App() {
  const [promptId, setPromptId] = useState(PROMPTS[0].id);
  const [variant, setVariant] = useState("correct");
  const prompt = PROMPTS.find((p) => p.id === promptId)!;
  const attempts = FIXTURES.filter((f) => f.promptId === promptId);
  const attempt = attempts.find((f) => f.variant === variant) ?? attempts[0];
  const audio = fixtureAnalysis(promptId, attempt.variant);
  const cards = diagnose(prompt, audio, fixtureFace(promptId, attempt.variant), "en");

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "2rem auto", padding: "0 16px" }}>
      <h1>Orbi</h1>
      <p>Fixture mode: replays recorded results, no microphone, camera or audio service needed.</p>
      <p>
        <label>
          Prompt{" "}
          <select value={promptId} onChange={(e) => { setPromptId(e.target.value); setVariant("correct"); }}>
            {PROMPTS.map((p) => <option key={p.id} value={p.id}>{p.hanzi} ({p.pinyin.join(" ")})</option>)}
          </select>
        </label>{" "}
        <label>
          Attempt{" "}
          <select value={attempt.variant} onChange={(e) => setVariant(e.target.value)}>
            {attempts.map((f) => <option key={f.variant} value={f.variant}>{f.label}</option>)}
          </select>
        </label>
      </p>
      <TeacherHead pose={prompt.vowelTargets?.[0] ?? "rest"} />
      <h2>Syllables</h2>
      <ul>
        {audio.syllables.map((s) => (
          <li key={s.index}>
            {s.target.pinyin}: target {s.target.variant}
            {s.target.sandhiNote && ` (${s.target.sandhiNote})`}, tone score {s.tone.score}
            {s.vowel && `, vowel heard as ${s.vowel.heardAs}`}
          </li>
        ))}
      </ul>
      <h2>Fixes</h2>
      {cards.length ? cards.map((c, i) => (
        <article key={i}><h3>{c.title}</h3><p>{c.instruction}</p>{c.l1Note && <p><em>{c.l1Note}</em></p>}</article>
      )) : <p>No fixes.</p>}
    </main>
  );
}
