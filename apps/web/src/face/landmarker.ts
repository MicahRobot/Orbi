// MediaPipe FaceLandmarker loop (SPEC.md Module D, Setup). Model and WASM are served from public/models/, no CDN.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { type Blendshape, type Point } from "./features";

export const LIP_EDGES = FaceLandmarker.FACE_LANDMARKS_LIPS;

let shared: Promise<FaceLandmarker> | null = null;

/** One landmarker per page: screens remount per word, and reloading the model each time is slow and leaks GPU contexts. */
function landmarker(): Promise<FaceLandmarker> {
  shared ??= create().catch((e) => { shared = null; throw e; });
  return shared;
}

async function create(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks("/models/wasm");
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
    runningMode: "VIDEO" as const, numFaces: 1, outputFaceBlendshapes: true,
  });
  try { return await FaceLandmarker.createFromOptions(fileset, options("GPU")); }
  catch { return await FaceLandmarker.createFromOptions(fileset, options("CPU")); }
}

export interface Frame { now: number; points?: Point[]; shapes?: Blendshape[] }

/** Calls onFrame once per video frame with pixel landmarks and blendshapes. Returns a stop function. */
export async function startFaceLoop(video: HTMLVideoElement, onFrame: (f: Frame) => void): Promise<() => void> {
  const model = await landmarker();
  let raf = 0, lastTime = -1;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const now = performance.now();
    const r = model.detectForVideo(video, now);
    const lm = r.faceLandmarks[0];
    onFrame({
      now,
      points: lm?.map((p) => ({ x: p.x * video.videoWidth, y: p.y * video.videoHeight })),
      shapes: r.faceBlendshapes[0]?.categories,
    });
  };
  tick();
  return () => cancelAnimationFrame(raf);
}
