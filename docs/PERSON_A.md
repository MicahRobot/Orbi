# Lane A: screens & data

You build everything the learner sees and taps, and you own **how it feels**: onboarding, home, practice and results, plus microphone capture and saving progress to Supabase. Friendly, clear UI is the main goal of this build, so this lane carries the demo.

**You own** (edit only these): `apps/web/src/ui/`, `apps/web/src/capture/`, `apps/web/src/api/`, `apps/web/src/data/`, `apps/web/src/fixtures.ts`, `apps/web/src/main.tsx`, `supabase/`, and the web config files.

**Spec sections:** Demo script, Architecture, Module A ("Capture"), Module F (all of it), Module I, Shared data contracts.

## What's already here

- `src/ui/App.tsx`: a placeholder that replays fixtures through `diagnose()` and shows the teacher placeholder. Replace it.
- `src/fixtures.ts`: `FIXTURES`, `fixtureAnalysis`, `fixtureFace`, `fixtureCalibration`.
- `src/data/store.ts`: done. `loadProfile`, `saveProfile`, `saveAttempt`, `loadAttempts`, on Supabase with anonymous sign-in, falling back to localStorage. `supabase/migrations/0001_init.sql` has the tables.
- From lane B (call, don't edit): `PROMPTS`, `PRACTICE_SETS` (`src/content/prompts.ts`), `L1S`, `l1NoteFor` (`src/content/l1.ts`), `targetsFor()` / `diagnose()` (`src/diagnosis/index.ts`, mocks until B lands them).
- From lane C: `<TeacherHead pose highlight />` (`src/teacher/index.tsx`, SVG placeholder until the 3D head lands).
- The audio service answers `/analyze` and `/calibrate/audio` from fixtures and `/coach` with template text, so the real HTTP path works today.

## Build order

Everything works in fixture mode first. Keep the UI principles in SPEC.md Module F in front of your agent the whole time.

- [ ] **0. Supabase project** (setup, 5 min): create it, run the migration, turn on anonymous sign-ins, share URL + publishable key ([WORKFLOW.md §1](WORKFLOW.md#1-setup-first-15-minutes)).
- [ ] **1. Results screen on fixtures** (`src/ui/`). It sells the demo, so it comes first: match ring (rule in Module F), Pitch / Lips / Tongue lights, SVG pitch panel (levels 1–5, dashed target, solid learner, sandhi note), teacher with highlight, up to two fix cards with the L1 note, streak, Details toggle. Pick the attempt from `FIXTURES` while there's no recorder.
- [ ] **2. Onboarding and home.** Welcome → native language tiles (`L1S`) → calibration (fixture calibration for now) → "Speakers of X often find…" → home. Home shows practice sets with mastered checks from `loadAttempts()`. Save with `saveProfile` / `saveAttempt`.
- [ ] **3. Practice screen and capture** (`src/capture/`). Word card, "Hear it" (`/ref/<id>.wav`, hide the button if the file is missing), camera preview slot for lane C's overlay, record button + space bar, 3-2-1 countdown, AudioWorklet → 16 kHz WAV, auto-stop, level checks with friendly messages.
- [ ] **4. API client** (`src/api/audio.ts`). `POST /analyze`, `POST /calibrate/audio`, `POST /coach` (pass the profile's `l1`; 2.5 s timeout; swap tips in when they arrive). Switch on `import.meta.env.VITE_AUDIO_MODE`. Real calibration replaces the fixture one.
- [ ] **5. Demo mode** and polish: replay the `FIXTURES` entries that have a `beat`, in order; loading and error states; reduced motion; tab order and focus rings.

**Done when**: a first-time user gets from Welcome to a green ring without help; the four demo attempts render the scripted results; a reload brings back the profile and progress; everything still runs with the service stopped and no keys.

## Kickoff prompt

Paste both blocks into your agent.

```text
SHARED PREAMBLE
You are building one lane of Orbi, a Mandarin pronunciation coach, in a 3-hour build.
Read AGENTS.md, SPEC.md in full, and docs/PERSON_A.md, then re-read the spec sections named below.
Data shapes are in shared/contracts/types.ts. Do not edit shared/ or another lane's folders.
Build against fixtures and mocks first, then the real thing behind the same interface.
Keep fixture mode working. Write a test for every function with logic. Keep commits small.
If the spec is ambiguous, choose the simplest option and log it in NOTES.md.
```

```text
LANE A: SCREENS & DATA
Own apps/web/src/ui, capture, api, data, fixtures.ts, main.tsx, supabase/ and the web config.
Sections: Demo script, Architecture, Module A (capture), Module F, Module I. The priority is a
clear, friendly UI that follows Module F's principles. Step 1: the results screen on fixtures
(match ring, Pitch/Lips/Tongue lights, SVG pitch panel, TeacherHead with highlight, fix cards
with l1Note, streak, Details toggle). Step 2: onboarding (welcome, L1 tiles from L1S,
calibration, L1 notes) and home with mastered checks, saving through src/data/store.ts.
Step 3: practice screen, mic capture (AudioWorklet, 16 kHz WAV, auto-stop, level checks).
Step 4: src/api/audio.ts for /analyze, /calibrate/audio and /coach, switched by VITE_AUDIO_MODE.
Step 5: demo mode replaying FIXTURES entries with a `beat`, then polish.
```
