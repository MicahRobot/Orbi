# Lane C: face & teacher

You join after the first two and build the two visual pieces that make Orbi feel like a teacher: **MediaPipe lip tracking** (the learner's mouth) and the **3D teacher head** (the target mouth and tongue, seen through a cutaway). Both are self-contained behind small interfaces, so you can start the moment you've cloned.

**You own** (edit only these): `apps/web/src/face/`, `apps/web/src/teacher/`, `apps/web/public/models/`.

**Spec sections:** Demo script, Module D (face), Module G (3D teacher), Shared data contracts (`FaceFeatures`, `FaceCalibration`, `FaceSummary`).

## What's already here

- `src/teacher/index.tsx`: the **seam**. `<TeacherHead pose highlight />` already renders in lane A's screens as a flat SVG placeholder. Replace its body; keep the props.
- Libraries installed: `three`, `@react-three/fiber`, `@react-three/drei`, `@mediapipe/tasks-vision`. No package.json changes needed.
- Face fixtures in `shared/fixtures/face/`, so lane A and B work without a camera (`VITE_FACE_MODE=fixture`).

## Build order

Face first: it's on the demo path (the 女 "nee" vs "noo" moment). The teacher can land any time before the 2:15 freeze because its seam is already wired.

- [ ] **0. Setup** (5 min): [WORKFLOW.md §1](WORKFLOW.md#1-setup-first-15-minutes) "each person". Download `face_landmarker.task` from the MediaPipe Face Landmarker docs into `apps/web/public/models/`, and copy `apps/web/node_modules/@mediapipe/tasks-vision/wasm/` to `apps/web/public/models/wasm/`. Commit both (no CDN at the venue).
- [ ] **1. Face loop** (`src/face/`, Module D). Export `startFaceLoop(video, clock)`, `startRecording()`, `stopRecording(): FaceFeatures[]`, `captureCalibrationPose(name)`, `summarize(frames, windows, calibration): FaceSummary[]`. Draw landmarks 33, 263, 78, 308, 13, 14 on the preview first to check them.
- [ ] **2. Live overlay and quality banners**: a `<LipOverlay>` component lane A drops onto the camera preview (lip contour, roundness bar, friendly "Move a little closer" style hints).
- [ ] **3. 3D teacher** (`src/teacher/`, Module G). Procedural head with a clipped, see-through shell, palate, teeth, tongue and lips; the five poses from the table; eased transitions; glow on the highlighted part; orbit controls; lazy-loaded with the SVG as fallback.
- [ ] **4. Perf check** with the camera running: if both together drop frames, pause the teacher's render loop while recording.

Tell lane A when the face loop is ready (they switch `VITE_FACE_MODE=live`) and when the teacher lands (nothing to switch; it just appears).

**Done when**: roundness separates "ee" from "oo" by at least 0.5 for each of you; a 1-second summary computes in under 20 ms; i, ü and u look clearly different on the teacher, with ü showing "tongue like i, lips like u"; it stays smooth at 60 fps next to the camera.

## Kickoff prompt

Paste both blocks into your agent.

```text
SHARED PREAMBLE
You are building one lane of Orbi, a Mandarin pronunciation coach, in a 3-hour build.
Read AGENTS.md, SPEC.md in full, and docs/PERSON_C.md, then re-read the spec sections named below.
Data shapes are in shared/contracts/types.ts. Do not edit shared/ or another lane's folders.
Build against fixtures and mocks first, then the real thing behind the same interface.
Keep fixture mode working. Write a test for every function with logic. Keep commits small.
If the spec is ambiguous, choose the simplest option and log it in NOTES.md.
```

```text
LANE C: FACE & TEACHER
Own apps/web/src/face, apps/web/src/teacher and apps/web/public/models. Sections: Module D,
Module G. Step 1: MediaPipe FaceLandmarker loop (model and WASM served from public/models),
per-frame FaceFeatures, calibration poses, roundness, summarize(frames, windows, calibration),
switched by VITE_FACE_MODE; verify landmark indices visually first; unit-test the roundness
and summary math. Step 2: a LipOverlay component with lip contour, roundness bar and quality
hints. Step 3: replace the body of TeacherHead in src/teacher/index.tsx with a procedural
three.js head (@react-three/fiber + drei OrbitControls): see-through clipped shell, palate,
teeth, tongue, lips, jaw; the five poses from Module G, eased; highlight glow; lazy-loaded with
the current SVG as fallback. Keep the TeacherHead props unchanged: lane A's screens use them.
```
