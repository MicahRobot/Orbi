# Lane B: ears & brain

You build everything that judges the sound: the Python audio service that splits a recording into syllables and scores tones and vowels, the tone sandhi rules, the diagnosis rules that turn evidence into fixes, the prompt list and the coaching text. You cover the spec's agents **A3 Audio** and **A4 Brain**.

**You own** (edit only these): `services/audio/` (all of it), `apps/web/src/diagnosis/`, `apps/web/src/content/`, `apps/web/public/ref/`.

**Spec sections:** Module A ("Segmentation"), Module B (B1–B5), Module C, Module E, Module F ("Coaching endpoint"), Content, plus Shared data contracts.

## What's already here

- `services/audio/app/main.py`: FastAPI with `/health`, `/analyze`, `/calibrate/audio`, `/coach`. With `AUDIO_MODE=fixture` (the default) the first two answer from `shared/fixtures/`. Your real pipeline goes behind the same endpoints.
- `services/audio/app/models.py`: pydantic mirror of the contracts. It rejects unknown fields, so drift fails loudly.
- `services/audio/app/coach.py`: template fallback (returns each card's own instruction).
- `apps/web/src/content/prompts.ts`: the 11 prompts, done.
- `apps/web/src/diagnosis/index.ts`: **mocks** of `targetsFor()` and `diagnose()`. Lane A's UI calls these, so keep the signatures.
- `apps/web/src/diagnosis/diagnosis.test.ts`: acceptance tests written from the fixtures, currently skipped. Remove each `.skip` as the real code lands; they pass when your output matches the demo script.
- `shared/fixtures/make_fixtures.py`: generates the fixtures with the spec's tone templates and detectors (B3–B5). Use it as an oracle: your `tone.py`, run on a fixture's `producedChao`, should report the same `issues`, `nearest` and `score`.

## Build order

- [ ] **1. Sandhi** (`src/diagnosis/sandhi.ts`, SPEC B1). Written pinyin → `SyllableTarget[]` with 不, 一, 3+3 and half-third rules and a `sandhiNote` per changed syllable. Wire it into `targetsFor()`, unskip the `targetsFor` tests.
- [ ] **2. Rules engine** (`rules.ts` as data, `messages.ts` templates, SPEC Module E). Vowel rules for target ü and the other targets, audio-only messages when face coverage < 0.5, tone issue → diagnosis, at most two cards, one per syllable. Rule order agreed so far is in [NOTES.md](../NOTES.md). Wire it into `diagnose()`, unskip the `diagnose` tests.
- [ ] **3. Segmentation and tones** (`services/audio/app/pitch.py`, `segment.py`, `tone.py`, SPEC Module A and B2–B5). Parselmouth pitch and intensity, voiced runs matched to the expected syllable count, vowel windows, contour → semitones → 1–5 scale using calibration, 10-point resample, templates, rmse/score/nearest, issue detectors, creaky tone-3 gap fill. Unit-test on synthetic contours.
- [ ] **4. Vowels and calibration** (`vowel.py`, SPEC Module C; `/calibrate/audio`). Formants in the vowel window, normalise against the learner's "ee"/"oo", classify i / ü / u, glide detection, confidence. Calibration endpoint computes `AudioCalibration` from the four WAVs. Then set `AUDIO_MODE=real` in your `.env`.
- [ ] **5. Coaching** (`coach.py`). Claude API call with the system prompt from SPEC Module F: a fast model (for example `claude-haiku-5-5`), temperature 0.3, at most 120 output tokens per tip, 2.5 s timeout, template fallback on any error. API key only in `services/audio/.env`, never committed.
- [ ] **6. Recordings** (with whoever speaks Mandarin best). Reference audio in `apps/web/public/ref/`, golden test set in `shared/fixtures/audio/` (naming in [WORKFLOW.md §6](WORKFLOW.md#6-recordings)), then a regression script that runs the golden set through `/analyze` and `diagnose()` and prints intended vs. actual.

**Done when** (from the spec): 18 of 20 recordings segment correctly; tone unit tests pass for every template and issue and native recordings score green on at least 90% of syllables; `heardAs` is right 9 of 10 times for nǚ, "nee" and "noo"; every diagnosis row has a table-driven test and the four demo utterances give exactly the scripted fixes.

## Kickoff prompts

Paste the shared preamble, then one block. One agent can do both blocks in sequence; for two agents at once, see [WORKFLOW.md §5](WORKFLOW.md#5-optional-two-agents-each).

```text
SHARED PREAMBLE
You are building one lane of Orbi, a Mandarin pronunciation coach (spec working name: ToneMirror).
Read AGENTS.md, SPEC.md in full, and docs/PERSON_B.md, then re-read the spec sections named below.
Data shapes are in shared/contracts/types.ts. Do not edit shared/ or another lane's folders.
Build a fixture/mock version first so the other lane can integrate, then the real version
behind the same interface. Keep fixture mode working. Write a test for every function with logic.
Keep commits small. If the spec is ambiguous, choose the simplest option and log it in NOTES.md.
```

```text
LANE B, PART 1: BRAIN (spec agent A4)
Own apps/web/src/diagnosis, apps/web/src/content and services/audio/app/coach.py.
Sections: Module B1, Module E, Module F (coaching), Content. Build: sandhi.ts (pinyin to
SyllableTarget[]) behind targetsFor(), rules.ts and messages.ts behind diagnose(), with
table-driven tests for every rule row; unskip the tests in src/diagnosis/diagnosis.test.ts as
they pass. Then POST /coach with a 2.5 s timeout and template fallback. Keep the signatures in
src/diagnosis/index.ts unchanged: lane A's UI calls them.
```

```text
LANE B, PART 2: AUDIO (spec agent A3)
Own services/audio except app/coach.py. Sections: Module A (segmentation), Module B2-B5,
Module C. FastAPI + praat-parselmouth. The endpoints already exist and answer from fixtures
when AUDIO_MODE=fixture; build the real path behind them: segmentation, tone contours and
scoring, formants and vowel classification, and the calibration endpoint. Unit-test tone
scoring with synthetic contours; shared/fixtures/make_fixtures.py implements B3-B5 and its
fixtures are your oracle. Regression-test on shared/fixtures/audio once recordings exist.
```
