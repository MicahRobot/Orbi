# Orbi

Orbi listens to you say a Mandarin word, watches your lips, and tells you which tone or mouth shape went wrong and how to fix it. Apps give you a score; a teacher tells you what your mouth is doing. Orbi does the teacher part.

The full build spec (working name ToneMirror) is in [SPEC.md](SPEC.md).

## Quick start

You need Node 20+ and Python 3.11+.

**Web app.** Runs on recorded fixtures out of the box: no microphone, camera or audio service needed.

```bash
cd apps/web
npm install
npm run dev            # http://localhost:5173
```

**Audio service.**

```bash
cd services/audio
python3 -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000 --env-file .env   # API docs at http://localhost:8000/docs
```

To point the web app at the service, copy `apps/web/.env.example` to `apps/web/.env` and set `VITE_AUDIO_MODE=live`.

**Tests.** `npm test` in `apps/web`, `pytest` in `services/audio`. CI runs both on every push and pull request.

## Two people, two lanes

The work is split so we can each build on our own computer without blocking the other.

| | Lane A: face & screens | Lane B: ears & brain |
|---|---|---|
| Builds | Mic + camera capture, MediaPipe lip tracking, the four screens, pitch chart, demo mode | Python audio service (syllables, tones, vowels), tone sandhi, diagnosis rules, prompts, coaching text |
| Guide | [docs/PERSON_A.md](docs/PERSON_A.md) | [docs/PERSON_B.md](docs/PERSON_B.md) |

Each guide has the folders you own, a build checklist, and kickoff prompts to paste into your coding agent. How we branch, merge, change contracts and integrate: [docs/WORKFLOW.md](docs/WORKFLOW.md). Start there.

The lanes meet at three seams: the data shapes in `shared/contracts/`, the audio service's HTTP endpoints, and the `targetsFor` / `diagnose` functions the UI calls. Each lane builds a mock behind its seam first, so neither waits on the other.

## Ponytail

Both of our coding agents use [ponytail](https://github.com/DietrichGebert/ponytail): write the smallest change that fully solves the task, never cut validation, security or tests.

- **Claude Code:** open the repo and accept the trust prompt. `.claude/settings.json` registers the ponytail marketplace and turns the plugin on (check with `/plugin`). Run `/ponytail-review` before each pull request and `/ponytail-audit` at integration checkpoints.
- **Other agents** (Cursor, Codex, Copilot, ...): they read [AGENTS.md](AGENTS.md), which carries ponytail's rules along with our lane rules.

## Layout

```
SPEC.md                    the build spec
AGENTS.md / CLAUDE.md      rules every coding agent reads (lanes, seams, ponytail)
NOTES.md                   cross-lane requests and decisions
docs/                      workflow and lane guides
shared/contracts/types.ts  data shapes: the source of truth
shared/fixtures/           generated results for every prompt, plus golden WAVs later
apps/web/                  Vite + React + TypeScript app
  src/ui, capture, face, api, fixtures.ts     lane A
  src/diagnosis, content                      lane B
services/audio/            FastAPI + Parselmouth service, lane B
```
