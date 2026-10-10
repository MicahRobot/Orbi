// Source of truth for every data shape that crosses a lane boundary.
// Mirrored in services/audio/app/models.py. Change both together, in one PR (see docs/WORKFLOW.md).
// Times are seconds from recording start; pitch levels use the Chao 1–5 tone scale.

export type Tone = 1 | 2 | 3 | 4 | 5;            // 5 = neutral tone
export type ToneVariant = "T1" | "T2" | "T3_full" | "T3_half" | "T4" | "T5";
export type VowelClass = "i" | "y" | "u" | "other";   // y = ü
export type TargetVisual = "spread" | "rounded" | "open" | "neutral";

export interface PromptItem {
  id: string;                 // "nv"
  hanzi: string;              // "女"
  pinyin: string[];           // ["nv3"]  numbered tones, v = ü
  gloss: string;              // "woman"
  reading: "word" | "list";   // list = each syllable said in isolation
  focus: ("tone" | "vowel")[];
  vowelTargets?: (VowelClass | null)[];  // per syllable, only for vowel prompts
  refAudioUrl?: string;
  targetVisual?: TargetVisual;
}

export interface SyllableTarget {
  index: number;
  pinyin: string;             // as written: "ni3"
  surfaceTone: Tone;          // after sandhi: 2 for 你 in 你好
  variant: ToneVariant;
  sandhiNote?: string;        // "3+3 → 2+3"
  vowel?: VowelClass;
}

export interface Formants { F1: number; F2: number; F3: number }

export interface AudioCalibration {
  f0: { medianHz: number; lowHz: number; highHz: number };  // 5th / 95th pct
  formantCeilingHz: 5000 | 5500;
  anchors: { i: Formants; u: Formants; a: Formants };
}

export interface FaceFeatures {
  t: number;                  // seconds since recording start
  detected: boolean;
  lipWidth: number;           // inner lip width / interocular distance
  lipHeight: number;          // inner lip gap / interocular distance
  pucker: number;             // blendshape 0–1
  funnel: number;
  jawOpen: number;
  smile: number;              // mean of mouthSmileLeft and mouthSmileRight
}

export interface FaceCalibration {
  neutral: FaceFeatures; ee: FaceFeatures; oo: FaceFeatures; ah: FaceFeatures;
}

export interface Calibration { audio: AudioCalibration; face: FaceCalibration; createdAt: string }

export type ToneIssueId = "t1_drift" | "t1_low" | "t2_shallow" | "t2_late" |
  "t3_not_low" | "t3_full_in_context" | "t4_shallow" | "t4_low_start" |
  "wrong_tone" | "no_pitch";

export interface ToneResult {
  target: ToneVariant;
  producedChao: number[];     // 10 points on the 1–5 scale
  targetChao: number[];       // 10 points
  nearest: ToneVariant;       // template the production is closest to
  rmse: number;               // Chao units vs. target
  score: number;              // 0–100
  issues: ToneIssueId[];
  voicedRatio: number;        // share of the syllable with a pitch reading
}

export interface VowelResult {
  target: VowelClass;
  formants: Formants;
  f2n: number;                // 0 = like your "oo", 1 = like your "ee"
  f3ratio: number;            // F3 / F3 of your "ee"
  heardAs: VowelClass;
  glide: boolean;             // vowel slid, like English "you"
  confidence: number;         // 0–1
}

export interface SyllableAnalysis {
  index: number;
  target: SyllableTarget;
  start: number; end: number;
  vowelStart: number; vowelEnd: number;   // window used for formants and face
  tone: ToneResult;
  vowel?: VowelResult;
}

export interface AudioAnalysis {
  promptId: string;
  durationSec: number;
  syllables: SyllableAnalysis[];
  warnings: ("too_quiet" | "clipped" | "syllable_count_mismatch" | "noisy")[];
}

export interface FaceSummary {
  syllableIndex: number;
  roundness: number;          // 0 = your "ee", 1 = your "oo"
  jawOpen: number;
  coverage: number;           // share of frames in the window with a face
  snapshot?: string;          // data URL, mouth crop at vowel midpoint
}

export interface Diagnosis {
  syllableIndex: number;
  issueId: string;            // "y_lips_not_rounded", "t2_late", ...
  articulator: "pitch" | "lips" | "tongue" | "jaw";
  severity: 1 | 2 | 3;        // 3 = fix this first
  evidence: Record<string, number | string | boolean>;
  messageKey: string;
}

export interface FeedbackItem {
  diagnosis: Diagnosis;
  title: string;              // "Round your lips"
  instruction: string;        // template text, always present
  coaching?: string;          // LLM-polished text, may arrive later
  targetVisual?: TargetVisual;
}

// ---- HTTP bodies (audio service) ----

/** `meta` field of POST /analyze (multipart, next to the `audio` WAV). */
export interface AnalyzeMeta { promptId: string; targets: SyllableTarget[]; calibration: AudioCalibration }

export interface CoachRequest { prompt: PromptItem; items: FeedbackItem[] }
export interface CoachResponse { tips: { issueId: string; text: string }[] }

// ---- Fixtures (shared/fixtures/index.json) ----

export interface FixtureEntry {
  promptId: string;
  variant: string;            // "correct", "nee", "t2_dip", ...
  label: string;              // what the speaker did, for humans
  beat?: string;              // demo-script beat this replays
  expectCards: { syllableIndex: number; issueId: string }[];  // what diagnose() should return
}
