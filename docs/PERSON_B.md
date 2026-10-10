# Lane B: ears & brain

You build everything that judges the sound: the Python service that splits a recording into syllables and scores tones and vowels, the sandhi and diagnosis rules, the native-language (L1) engine, and the Gemini pieces. You're also the lane that keeps Orbi **accurate**: the UI can only be as trustworthy as your verdicts.

**You own** (edit only these): `services/audio/` (all of it), `apps/web/src/diagnosis/`, `apps/web/src/content/`, `apps/web/public/ref/`.

**Spec sections:** Module A ("Segmentation"), Module B, Module C, Module E, Module F ("Coaching endpoint"), Module H, Content, Shared data contracts.

## What's already here

- `services/audio/app/main.py`: FastAPI with `/health`, `/analyze`, `/calibrate/audio`, `/coach`. With `AUDIO_MODE=fixture` (default) the first two answer from `shared/fixtures/`; your real pipeline goes behind the same endpoints.
- `services/audio/app/coach.py`: **done**. Gemini `gemini-3.5-flash-lite` rewrites each fix with the learner's L1 in mind, 2.5 s timeout, template fallback. Needs `GEMINI_API_KEY` in `.env`.
- `services/audio/scripts/make_reference_audio.py`: **done**. Gemini TTS (`gemini-3.8-flash-tts`) writes `apps/web/public/ref/<id>.wav`.
- `services/audio/app/models.py`: pydantic mirror of the contracts; rejects unknown fields.
- `apps/web/src/content/prompts.ts` and `l1.ts`: the 11 prompts and the seeded L1 tendencies.
- `apps/web/src/diagnosis/index.ts`: **mocks** of `targetsFor()` and `diagnose()` (the mock already attaches `l1Note`). Keep the signatures.
- `apps/web/src/diagnosis/diagnosis.test.ts`: acceptance tests from the fixtures, skipped. Remove each `.skip` as the real code lands.
- `shared/fixtures/make_fixtures.py`: implements B3–B5; its fixtures are your oracle for `tone.py`.

## Build order

- [ ] **0. Gemini key** (setup, 2 min): create it in Google AI Studio, share it, put it in `services/audio/.env`, run `python scripts/make_reference_audio.py` from `services/audio` with the venv active, listen to the files, commit them.
- [ ] **1. Sandhi** (`src/diagnosis/sandhi.ts`, B1) behind `targetsFor()`. Unskip the `targetsFor` tests. (~15 min)
- [ ] **2. Rules engine** (`rules.ts` + `messages.ts`, Module E) behind `diagnose()`, keeping the `l1Note` step. Rule order is in NOTES.md. Unskip the `diagnose` tests. (~30 min)
- [ ] **3. Segmentation and tones** (`pitch.py`, `segment.py`, `tone.py`; Module A, B2–B5). Unit-test on synthetic contours; check against the fixtures. This is the 1:15 checkpoint with lane A.
- [ ] **4. Vowels and calibration** (`vowel.py`, Module C; real `/calibrate/audio`). Then set `AUDIO_MODE=real` in `.env` (and make `main.py` call your pipeline when it's not `fixture`).
- [ ] **5. Tune** with the recordings in `shared/fixtures/audio/` (WORKFLOW.md §6); review the L1 notes with a fluent speaker.

**Done when**: the four demo attempts give exactly the scripted fixes with real audio, 9 of 10 times; all acceptance tests are unskipped and green; Gemini tips arrive within 2.5 s or the template shows.

## Kickoff prompt

Paste both blocks into your agent. If you want two agents at once (brain and audio), give each one its own worktree: `git worktree add ../orbi-audio -b b/audio`.

```text
SHARED PREAMBLE
You are building one lane of Orbi, a Mandarin pronunciation coach, in a 3-hour build.
Read AGENTS.md, SPEC.md in full, and docs/PERSON_B.md, then re-read the spec sections named below.
Data shapes are in shared/contracts/types.ts. Do not edit shared/ or another lane's folders.
Build against fixtures and mocks first, then the real thing behind the same interface.
Keep fixture mode working. Write a test for every function with logic. Keep commits small.
If the spec is ambiguous, choose the simplest option and log it in NOTES.md.
```

```text
LANE B: EARS & BRAIN
Own services/audio, apps/web/src/diagnosis, apps/web/src/content and apps/web/public/ref.
Sections: Module A (segmentation), B, C, E, F (coaching), H, Content. Gemini coaching and the
Gemini TTS script are already done; don't replace Gemini. Step 1: sandhi.ts behind targetsFor().
Step 2: rules.ts + messages.ts behind diagnose(), keeping the l1Note step; unskip the tests in
src/diagnosis/diagnosis.test.ts as they pass. Step 3: real segmentation and tone scoring in the
service (praat-parselmouth), unit-tested on synthetic contours, matching shared/fixtures.
Step 4: formants and vowel classification, the real /calibrate/audio, then AUDIO_MODE=real.
Keep the signatures in src/diagnosis/index.ts unchanged: lane A's UI calls them.
```
