# Orbi

Orbi listens to you say a Mandarin word, watches your lips, and tells you which tone or mouth shape went wrong and how to fix it, with a 3D teacher head that shows what your lips and tongue should do. Apps give you a score; a teacher tells you what your mouth is doing. Orbi does the teacher part.

Built in 3 hours with **Gemini** (Google DeepMind) for coaching and native reference audio, **Supabase** for profiles and progress, and MediaPipe for on-device lip tracking. The build spec is [SPEC.md](SPEC.md).

## Quick start

You need Node 20+ and Python 3.11+.

**Web app.** Runs on recorded fixtures out of the box: no microphone, camera, audio service or keys needed.

```bash
cd apps/web
npm install
cp .env.example .env   # add Supabase keys here when you have them
npm run dev            # http://localhost:5173
```

**Audio service.**

```bash
cd services/audio
python3 -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY here
uvicorn app.main:app --reload --port 8000 --env-file .env   # API docs at http://localhost:8000/docs
```

Set `VITE_AUDIO_MODE=live` in `apps/web/.env` to use the service, and `VITE_FACE_MODE=live` to use the camera. Supabase and Gemini setup (5 minutes): [docs/WORKFLOW.md §1](docs/WORKFLOW.md#1-setup-first-15-minutes).

**Tests.** `npm test` in `apps/web`, `pytest` in `services/audio`. CI runs both on every push and pull request.

## Three people, three lanes

| | Lane A: screens & data | Lane B: ears & brain | Lane C: face & teacher |
|---|---|---|---|
| Builds | Onboarding, results (match ring, guidance lights, pitch curve), capture, Supabase | Audio analysis service, sandhi and diagnosis rules, native-language engine, Gemini | MediaPipe lip tracking, 3D teacher head |
| Guide | [docs/PERSON_A.md](docs/PERSON_A.md) | [docs/PERSON_B.md](docs/PERSON_B.md) | [docs/PERSON_C.md](docs/PERSON_C.md) |

Lanes A and B start right away; lane C is ready for the third person whenever they arrive. Each guide has the folders you own, a build checklist, and a kickoff prompt to paste into your coding agent. Schedule, branching, merging and contract changes: [docs/WORKFLOW.md](docs/WORKFLOW.md). Start there.

The lanes meet at a few seams: the data shapes in `shared/contracts/`, the audio service's endpoints, and a handful of functions and one component the UI calls (listed in [AGENTS.md](AGENTS.md)). Every seam already has a working mock, so nobody waits on anybody.

## Ponytail

Our coding agents use [ponytail](https://github.com/DietrichGebert/ponytail): write the smallest change that fully solves the task, and never cut validation, security, accessibility or tests.

- **Claude Code:** open the repo and accept the trust prompt. `.claude/settings.json` registers the ponytail marketplace and turns the plugin on (check with `/plugin`). Run `/ponytail-review` before a pull request.
- **Other agents** (Cursor, Codex, Copilot, ...): they read [AGENTS.md](AGENTS.md), which carries ponytail's rules along with our lane rules.

## Layout

```
SPEC.md                    the build spec (v2: 3 hours, 3 people)
AGENTS.md / CLAUDE.md      rules every coding agent reads (lanes, seams, ponytail)
NOTES.md                   cross-lane requests and decisions
docs/                      workflow and lane guides
shared/contracts/types.ts  data shapes: the source of truth
shared/fixtures/           generated results for every prompt
supabase/migrations/       profiles + attempts tables, row-level security
apps/web/                  Vite + React + TypeScript
  src/ui capture api data fixtures.ts   lane A
  src/diagnosis content                 lane B
  src/face teacher                      lane C
services/audio/            FastAPI + Parselmouth + Gemini, lane B
```
