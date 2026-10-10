# How we work together

Three people (two at the start, one joining later), three computers, three lanes, **three hours**. Each of us owns different folders, so we can all vibecode at once without stepping on each other. The only things we change together are the contracts in `shared/`.

## 1. Setup (first 15 minutes)

**Each person**

1. **Repo access.** Micah adds the others: GitHub → the Orbi repo → Settings → Collaborators → Add people.
2. **Clone and install.** You need Node 20+ and Python 3.11+.
   ```bash
   git clone https://github.com/MicahRobot/orbi.git && cd orbi
   (cd apps/web && npm install && cp .env.example .env)
   cd services/audio && python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt && cp .env.example .env
   ```
3. **Ponytail.** Open the repo in Claude Code and accept the "trust this folder" prompt. `.claude/settings.json` registers the ponytail marketplace and turns the plugin on; run `/plugin` to check. If it's missing, send these as two separate messages: `/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail`. Its hooks need `node` on your PATH. Cursor, Codex and other agents read `AGENTS.md`, which carries the same rules.
4. **Pick your lane** and open its guide.

**Once, by one person** (lane A does Supabase, lane B does Gemini; share the values in your team chat, never in git):

- **Gemini**: create an API key in [Google AI Studio](https://aistudio.google.com). Everyone puts it in `services/audio/.env` as `GEMINI_API_KEY`.
- **Supabase**: create a project; paste `supabase/migrations/0001_init.sql` into the SQL editor and run it; turn on Authentication → Sign In / Providers → **Allow anonymous sign-ins**; copy the project URL and publishable key into `apps/web/.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Nothing waits on these: without keys, coaching shows template text and progress stays in the browser.

| | Lane A: screens & data | Lane B: ears & brain | Lane C: face & teacher |
|---|---|---|---|
| In one line | Everything the learner sees and taps | Everything that judges the sound | The learner's lips and the teacher's mouth |
| Builds | Onboarding, home, practice, results (ring, lights, pitch curve, streak), mic capture, Supabase | Python audio service, sandhi, diagnosis rules, L1 engine, Gemini coaching + reference audio | MediaPipe lip tracking, then the 3D teacher head |
| Starts | 0:00 | 0:00 | when the third person arrives |
| Good fit | Likes UI and polish | Likes logic and signal processing; ideally the best Mandarin speaker | Likes 3D, graphics, computer vision |
| Guide | [PERSON_A.md](PERSON_A.md) | [PERSON_B.md](PERSON_B.md) | [PERSON_C.md](PERSON_C.md) |

Exact folders per lane are in [AGENTS.md](../AGENTS.md).

## 2. The loop

```bash
git switch main && git pull
git switch -c a/results-ring          # prefix a/, b/ or c/ with your lane
# ... work with your agent, commit small ...
git push -u origin a/results-ring     # open a pull request
```

1. Start your agent with the kickoff prompt from your lane guide, then give it one checklist item at a time.
2. In a 3-hour build, merge small and often: aim for a PR every 20–30 minutes.
3. Before opening a PR, run `/ponytail-review` if you have a minute. It flags bugs, missing tests and what to cut.
4. CI green and the PR only touches your lane? Merge it yourself (squash) and post a one-liner in chat so the others pull.
5. Pull `main` whenever someone merges. Lanes don't overlap, so conflicts should be rare.

Never break fixture mode: with the audio service stopped, no camera and no keys, `npm run dev` must still show the app.

## 3. Changing a contract (anything in `shared/`)

The contracts are the only thing coupling our lanes, so they change on purpose.

1. Say what you want to change and why in chat (or under "Requests" in [NOTES.md](../NOTES.md)).
2. One small PR that updates everything together:
   - `shared/contracts/types.ts`
   - `services/audio/app/models.py`
   - `supabase/migrations/` if `Profile` or `AttemptRecord` changed (add a new numbered file)
   - the fixtures: edit `shared/fixtures/make_fixtures.py`, then run `python3 shared/fixtures/make_fixtures.py`
3. Someone from the other lane approves it before it merges. Then everyone pulls.

The same goes for the in-browser seams listed in AGENTS.md (`targetsFor`, `diagnose`, `TeacherHead`, the store functions) and the HTTP endpoints.

## 4. Schedule and integration checkpoints

| Time | What | Done when |
|---|---|---|
| 0:00–0:15 | Setup (above) | Everyone runs the app in fixture mode |
| 0:15–1:15 | Build on mocks | A: screens on fixtures. B: sandhi + rules, then tone scoring. C: face loop |
| **1:15** | **Checkpoint 1: tone path**, A + B | Saying 妈 麻 马 骂 into the mic shows four real pitch curves and a ring (`VITE_AUDIO_MODE=live`). If not, tones are demoed from fixtures |
| 1:15–2:15 | Integrate | Vowel path with real face data (`VITE_FACE_MODE=live`), Gemini tips, reference audio, Supabase save/load, 3D teacher, demo mode |
| **2:15** | **Feature freeze** | Only fixes and polish after this |
| 2:15–2:45 | Polish | Copy, spacing, loading/error states; each demo attempt tested 10 times |
| 2:45–3:00 | Rehearse | Script twice with the headset mic; backup video recorded |

Do checkpoints on a call, one person driving.

## 5. When the third person joins

1. Do the "each person" setup above (5 minutes), then read [PERSON_C.md](PERSON_C.md).
2. Until then the face runs in fixture mode and the teacher is an SVG placeholder, so nobody is blocked.
3. If nobody has joined by 1:00, whoever is ahead starts lane C's face tracking (it's on the demo path). The 3D teacher can land any time before the freeze.

## 6. Recordings

Whoever speaks Mandarin best records in the first hour (SPEC.md, "Content"):

- Tuning takes: two takes of each demo attempt, saved as `shared/fixtures/audio/<promptId>.<variant>.<take>.wav` (variants as in `shared/fixtures/index.json`).
- Reference audio comes from Gemini TTS (`services/audio/scripts/make_reference_audio.py`). Listen to each file and re-record any word that sounds off.
