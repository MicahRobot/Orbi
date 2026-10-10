# Lane A: face & screens

You build everything the learner sees and touches: microphone and camera capture, lip tracking with MediaPipe, and the four screens. You cover the spec's agents **A1 Frontend** and **A2 Face**.

**You own** (edit only these): `apps/web/src/capture/`, `apps/web/src/face/`, `apps/web/src/ui/`, `apps/web/src/api/`, `apps/web/src/fixtures.ts`, `apps/web/src/main.tsx`, `apps/web/public/models/`, and the web config files.

**Spec sections:** Demo script, Architecture and tech stack, Module A ("Capture"), Module D, Module F (screens and target visuals), plus Shared data contracts.

## What's already here

- `src/ui/App.tsx`: a placeholder screen that replays fixtures through `diagnose()`. Replace it.
- `src/fixtures.ts`: loads `shared/fixtures/` (`FIXTURES`, `fixtureAnalysis`, `fixtureFace`, `fixtureCalibration`).
- From lane B, which you call but don't edit: `PROMPTS` and `PRACTICE_SETS` in `src/content/prompts.ts`, and `targetsFor()` / `diagnose()` in `src/diagnosis/index.ts`. Those two are mocks until B lands the real ones; the signatures stay the same.
- The audio service answers `/analyze` and `/calibrate/audio` from fixtures, so you can test the real HTTP path before B's analysis exists.

## Build order

Tick these off in order. Each step works in fixture mode before it touches real hardware.

- [ ] **1. Four screens on fixtures** (`src/ui/`). Start (practice sets + Demo mode), Calibration, Practice (big hanzi, pinyin with tone marks, gloss, record button with 3-2-1 countdown), Results (syllable chips, SVG pitch panel on the 1–5 scale with dashed target and solid learner curve, lip panel for vowel prompts, at most two fix cards). Status chips use color + icon + word. In fixture mode the record button replays the attempt picked from `FIXTURES`.
- [ ] **2. Capture** (`src/capture/`). `getUserMedia` with the settings in Module A, one clock (`t0 = performance.now()`), AudioWorklet PCM → 16 kHz mono 16-bit WAV, auto-stop after 600 ms of silence or 3 s (4 s for list prompts), level meter, reject too quiet / clipped before sending.
- [ ] **3. API client** (`src/api/audio.ts`). `POST /analyze` (multipart: `audio` WAV + `meta` JSON with `promptId`, `targets` from `targetsFor()`, `calibration`), `POST /calibrate/audio`, `POST /coach` with a 2.5 s timeout that never blocks rendering. Switch on `import.meta.env.VITE_AUDIO_MODE`.
- [ ] **4. Face** (`src/face/`). Fake first: `summarize()` returning plausible `FaceSummary[]`. Then `npm i @mediapipe/tasks-vision`, serve `face_landmarker.task` and the WASM files from `public/models/` (no CDN at the venue), per-frame `FaceFeatures`, calibration poses, roundness math, mouth snapshot, live lip overlay with roundness bar, quality banners. Draw the landmark indices on the preview first to verify them. Switch on `VITE_FACE_MODE`.
- [ ] **5. Calibration flow and demo mode.** Save `Calibration` to `localStorage`. Demo mode replays the `FIXTURES` entries that have a `beat`, in order, through the real UI.

Integration checkpoints with lane B are in [WORKFLOW.md](WORKFLOW.md#4-integration-checkpoints-do-these-together).

**Done when** (from the spec): screens run on fixtures with the service stopped; real capture feeds `/analyze`; on calibration poses roundness separates "ee" from "oo" by at least 0.5 for both of you, and a 1-second vowel summary computes in under 20 ms.

## Kickoff prompts

Paste the shared preamble, then one block. One agent can do both blocks in sequence; for two agents at once, see [WORKFLOW.md §5](WORKFLOW.md#5-optional-two-agents-each).

```text
SHARED PREAMBLE
You are building one lane of Orbi, a Mandarin pronunciation coach (spec working name: ToneMirror).
Read AGENTS.md, SPEC.md in full, and docs/PERSON_A.md, then re-read the spec sections named below.
Data shapes are in shared/contracts/types.ts. Do not edit shared/ or another lane's folders.
Build a fixture/mock version first so the other lane can integrate, then the real version
behind the same interface. Keep fixture mode working. Write a test for every function with logic.
Keep commits small. If the spec is ambiguous, choose the simplest option and log it in NOTES.md.
```

```text
LANE A, PART 1: SCREENS AND CAPTURE (spec agent A1)
Own apps/web/src/ui, apps/web/src/capture and apps/web/src/api. Sections: Demo script,
Architecture, Module A (capture), Module F. Step 1: replace src/ui/App.tsx with the four screens
on fixture data (src/fixtures.ts). Step 2: real mic and camera capture with a shared clock,
AudioWorklet PCM capture, 16 kHz WAV encoder, auto-stop on silence, level checks. Step 3:
src/api/audio.ts for /analyze, /calibrate/audio and /coach, switched by VITE_AUDIO_MODE.
Step 4: SVG pitch chart (levels 1-5, dashed target, solid learner), lip panel, fix cards,
demo mode that replays FIXTURES entries with a `beat`, in order.
```

```text
LANE A, PART 2: FACE (spec agent A2)
Own apps/web/src/face and apps/web/public/models. Section: Module D. Export:
startFaceLoop(video, clock), startRecording(), stopRecording(): FaceFeatures[],
captureCalibrationPose(name), summarize(frames, windows, calibration): FaceSummary[],
plus a live overlay component. Serve the model and WASM from public/models. First ship a fake
that returns plausible FaceSummary values. Verify landmark indices visually before computing
features. Switch on VITE_FACE_MODE.
```
