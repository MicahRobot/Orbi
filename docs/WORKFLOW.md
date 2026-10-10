# How we work together

Two people, two computers, two lanes. Each of us owns different folders, so we can both vibecode all day without stepping on each other. The only things we change together are the contracts in `shared/`.

## 1. One-time setup (each of us)

1. **Repo access.** The repo owner adds the other person: GitHub → the Orbi repo → Settings → Collaborators → Add people.
2. **Clone and install.**
   ```bash
   git clone https://github.com/MicahRobot/orbi.git && cd orbi
   (cd apps/web && npm install)
   cd services/audio && python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt && cp .env.example .env
   ```
   You need Node 20+ and Python 3.11+. Both of us install both halves, so either can run the whole app.
3. **Ponytail.** Open the repo in Claude Code (terminal, desktop app or IDE) and accept the "trust this folder" prompt. `.claude/settings.json` registers the ponytail marketplace and turns the plugin on; run `/plugin` to check it's listed. If it isn't, type these as two separate messages: `/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail`. Ponytail's hooks need `node` on your PATH. Using Cursor, Codex or another agent instead? It reads `AGENTS.md`, which carries the same rules.
4. **Pick a lane.** Read the guide for yours: [PERSON_A.md](PERSON_A.md) or [PERSON_B.md](PERSON_B.md).

| | Lane A: face & screens | Lane B: ears & brain |
|---|---|---|
| In one line | Everything the learner sees and touches | Everything that judges the sound |
| Builds | Mic + camera capture, MediaPipe lip tracking, the four screens, pitch chart, demo mode | Python audio service (syllables, tones, vowels), sandhi rules, diagnosis rules, prompts, coaching text |
| Good fit for | Whoever likes UI and browser APIs | Whoever likes logic and signal processing; ideally the stronger Mandarin speaker |
| Spec agents covered | A1 Frontend + A2 Face | A3 Audio + A4 Brain |

Exact folders per lane are in [AGENTS.md](../AGENTS.md).

## 2. The daily loop

```bash
git switch main && git pull
git switch -c a/pitch-chart          # prefix a/ or b/ with your lane
# ... work with your agent, commit small and often ...
git push -u origin a/pitch-chart     # then open a pull request on GitHub
```

1. Start your agent with the kickoff prompt from your lane guide, then give it one task at a time from your checklist.
2. Before opening a PR, run `/ponytail-review` in Claude Code. It reads the code your change touches and flags bugs, missing tests and what to cut.
3. Open a PR into `main`. CI runs the web typecheck, tests and build, plus the Python tests.
4. CI green and the PR only touches your lane? Merge it yourself (squash). Post a one-liner in your chat so the other person knows to pull.
5. Pull `main` at least every couple of hours. Lanes don't overlap, so conflicts should be rare.

Never push broken fixture mode: with the audio service stopped and no camera, `npm run dev` must still show the app.

## 3. Changing a contract (anything in `shared/`)

The contracts are the only thing that couples our lanes, so they change on purpose, never as a side effect.

1. Say what you want to change and why in chat (or add it under "Requests" in [NOTES.md](../NOTES.md)).
2. Open a PR that only does the contract change, and updates all of these together:
   - `shared/contracts/types.ts`
   - `services/audio/app/models.py`
   - the fixtures: edit `shared/fixtures/make_fixtures.py`, then run `python3 shared/fixtures/make_fixtures.py`
3. The other person approves it before it merges. Then both of you pull.

The same applies to the seams that aren't in `shared/`: the HTTP endpoints, and the `targetsFor` / `diagnose` signatures in `apps/web/src/diagnosis/index.ts`.

## 4. Integration checkpoints (do these together)

Each lane builds on mocks first, so nothing blocks. Then we connect the real pieces in this order (SPEC.md, "Integration order"). Get on a call, one person drives.

| # | Connect | Who | Done when |
|---|---|---|---|
| 1 | Record → `/analyze` → pitch chart | A capture + B tone scoring | Saying 妈 麻 马 骂 shows four real pitch curves. Run the web app with `VITE_AUDIO_MODE=live`. |
| 2 | Sandhi targets in, tone fix cards out | B's `targetsFor` + `diagnose` | 你好 with two full dips shows the sandhi card |
| 3 | Face summaries into the diagnosis engine | A face + B rules | Lip roundness reaches `diagnose()`. `VITE_FACE_MODE=live` |
| 4 | Vowel path (formants + roundness) | Both | 女 said as "nee" and as "noo" get two different fixes |
| 5 | Coaching text, calibration polish, demo mode | Both | The 3-minute demo script runs start to finish |

The spec's hour-12 gate applies: if checkpoint 1 isn't working by then, the face side stays in fixture mode for the demo.

## 5. Optional: two agents each

Each lane covers two of the spec's agents. To run both at once, give each agent its own worktree so they don't share a working copy:

```bash
git worktree add ../orbi-face -b a/face     # second checkout on its own branch
cd ../orbi-face && claude                   # start the second agent here
```

Paste the matching kickoff prompt into each. Merge both branches through PRs as usual.

## 6. Recordings

Whoever speaks Mandarin best records, early (SPEC.md, "Content"):

- Reference audio: each prompt three times, best take saved as `apps/web/public/ref/<promptId>.wav`.
- Golden test set: five takes each of the correct demo words and the deliberate mistakes, saved in `shared/fixtures/audio/` as `<promptId>.<variant>.<take>.wav` (variants as in `shared/fixtures/index.json`).

No fluent speaker? Use a zh-CN neural TTS voice for the reference audio and lean on the tone templates (SPEC.md, risks).
