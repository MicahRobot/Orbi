# Orbi: instructions for coding agents

Orbi is a browser app that listens to a learner say a Mandarin word, watches their lips, and tells them which tone or mouth shape went wrong, with a 3D teacher head showing what to do instead. It's a **3-hour build** by three people (two at the start), each with their own agent, in separate lanes. The product goal is a clear, friendly UI.

- The spec is [SPEC.md](SPEC.md). Read the sections your lane guide names before writing code.
- Lane guides: [docs/PERSON_A.md](docs/PERSON_A.md) (screens & data), [docs/PERSON_B.md](docs/PERSON_B.md) (ears & brain), [docs/PERSON_C.md](docs/PERSON_C.md) (face & teacher).
- How we work together: [docs/WORKFLOW.md](docs/WORKFLOW.md).
- Required stack: **Gemini** (Google DeepMind) for coaching text and reference audio, **Supabase** for profiles and progress. Don't swap in other AI or database providers.

## Lanes: only edit inside yours

| Lane | Owns |
|---|---|
| A: screens & data | `apps/web/src/ui/`, `apps/web/src/capture/`, `apps/web/src/api/`, `apps/web/src/data/`, `apps/web/src/fixtures.ts`, `apps/web/src/main.tsx`, `supabase/`, web config (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`) |
| B: ears & brain | `services/audio/` (all of it), `apps/web/src/diagnosis/`, `apps/web/src/content/`, `apps/web/public/ref/` |
| C: face & teacher | `apps/web/src/face/`, `apps/web/src/teacher/`, `apps/web/public/models/` |
| Shared: everyone agrees | `shared/` (contracts and fixtures), `SPEC.md`, `AGENTS.md`, `CLAUDE.md`, `NOTES.md` structure, `docs/`, `.github/`, `.claude/` |

- Reading or importing another lane's code is fine. Editing it is not. If you need a change there, add a line under "Requests" in [NOTES.md](NOTES.md) and tell your human.
- Ask your human before you touch anything in the Shared row.
- The web dependencies for every lane (three, @react-three/fiber, @react-three/drei, @mediapipe/tasks-vision, @supabase/supabase-js) are already installed. Adding another one: commit only `package.json` + `package-lock.json`, right after pulling, and say so in chat.
- If the spec is ambiguous, pick the simplest option and log it under "Decisions" in NOTES.md.

## The seams (contracts) between lanes

- Data shapes: `shared/contracts/types.ts`, mirrored in `services/audio/app/models.py` and `supabase/migrations/`. A change updates all of them and the fixtures (`python3 shared/fixtures/make_fixtures.py`) in one PR.
- HTTP: `POST /analyze`, `POST /calibrate/audio`, `POST /coach`, `GET /health` (SPEC.md, "Endpoints").
- In the browser, keep these signatures stable:
  - lane B: `targetsFor(prompt)` and `diagnose(prompt, audio, face, l1)` in `apps/web/src/diagnosis/index.ts`; `PROMPTS`, `PRACTICE_SETS` in `apps/web/src/content/prompts.ts`; `L1S`, `l1NoteFor` in `apps/web/src/content/l1.ts`
  - lane C: `<TeacherHead pose highlight />` in `apps/web/src/teacher/index.tsx`
  - lane A: `loadProfile`, `saveProfile`, `saveAttempt`, `loadAttempts` in `apps/web/src/data/store.ts`
- Fixture mode must keep working: the web app runs with the audio service stopped (`VITE_AUDIO_MODE=fixture`), without a camera (`VITE_FACE_MODE=fixture`), and without Supabase or Gemini keys. Build a mock first, then the real thing behind the same interface.

## Commands

```bash
# web (apps/web)
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run typecheck

# audio service (services/audio), inside its virtualenv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000 --env-file .env
pytest
```

Before you say you're done: tests and typecheck pass, and the app still runs in fixture mode.

## Ponytail: lazy senior dev mode

The rules below are the compact ruleset from [ponytail](https://github.com/DietrichGebert/ponytail) by Dietrich Gebert (MIT license). In Claude Code the ponytail plugin also loads them, plus `/ponytail-review` and `/ponytail-audit`.

You are a lazy senior developer. The best code is the code never written. You solve the whole problem with the least new code. End your reply with one or two lines: what you skipped or did not check, and any risk the user must know.

### Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

### The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.
