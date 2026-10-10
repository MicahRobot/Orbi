"""Pydantic mirror of shared/contracts/types.ts. Change both together, in one PR."""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

Tone = Literal[1, 2, 3, 4, 5]
ToneVariant = Literal["T1", "T2", "T3_full", "T3_half", "T4", "T5"]
VowelClass = Literal["i", "y", "u", "other"]
TargetVisual = Literal["spread", "rounded", "open", "neutral"]
ToneIssueId = Literal[
    "t1_drift", "t1_low", "t2_shallow", "t2_late", "t3_not_low",
    "t3_full_in_context", "t4_shallow", "t4_low_start", "wrong_tone", "no_pitch",
]


class Model(BaseModel):
    # Unknown fields are errors, so a field renamed on one side of the contract fails loudly.
    model_config = ConfigDict(extra="forbid")


class PromptItem(Model):
    id: str
    hanzi: str
    pinyin: list[str]
    gloss: str
    reading: Literal["word", "list"]
    focus: list[Literal["tone", "vowel"]]
    vowelTargets: Optional[list[Optional[VowelClass]]] = None
    refAudioUrl: Optional[str] = None
    targetVisual: Optional[TargetVisual] = None


class SyllableTarget(Model):
    index: int
    pinyin: str
    surfaceTone: Tone
    variant: ToneVariant
    sandhiNote: Optional[str] = None
    vowel: Optional[VowelClass] = None


class Formants(Model):
    F1: float
    F2: float
    F3: float


class F0Range(Model):
    medianHz: float
    lowHz: float
    highHz: float


class VowelAnchors(Model):
    i: Formants
    u: Formants
    a: Formants


class AudioCalibration(Model):
    f0: F0Range
    formantCeilingHz: Literal[5000, 5500]
    anchors: VowelAnchors


class FaceFeatures(Model):
    t: float
    detected: bool
    lipWidth: float
    lipHeight: float
    pucker: float
    funnel: float
    jawOpen: float
    smile: float


class FaceCalibration(Model):
    neutral: FaceFeatures
    ee: FaceFeatures
    oo: FaceFeatures
    ah: FaceFeatures


class Calibration(Model):
    audio: AudioCalibration
    face: FaceCalibration
    createdAt: str


class ToneResult(Model):
    target: ToneVariant
    producedChao: list[float]
    targetChao: list[float]
    nearest: ToneVariant
    rmse: float
    score: int
    issues: list[ToneIssueId]
    voicedRatio: float


class VowelResult(Model):
    target: VowelClass
    formants: Formants
    f2n: float
    f3ratio: float
    heardAs: VowelClass
    glide: bool
    confidence: float


class SyllableAnalysis(Model):
    index: int
    target: SyllableTarget
    start: float
    end: float
    vowelStart: float
    vowelEnd: float
    tone: ToneResult
    vowel: Optional[VowelResult] = None


class AudioAnalysis(Model):
    promptId: str
    durationSec: float
    syllables: list[SyllableAnalysis]
    warnings: list[Literal["too_quiet", "clipped", "syllable_count_mismatch", "noisy"]]


class FaceSummary(Model):
    syllableIndex: int
    roundness: float
    jawOpen: float
    coverage: float
    snapshot: Optional[str] = None


class Diagnosis(Model):
    syllableIndex: int
    issueId: str
    articulator: Literal["pitch", "lips", "tongue", "jaw"]
    severity: Literal[1, 2, 3]
    evidence: dict[str, float | str | bool]
    messageKey: str


class FeedbackItem(Model):
    diagnosis: Diagnosis
    title: str
    instruction: str
    coaching: Optional[str] = None
    targetVisual: Optional[TargetVisual] = None


# ---- HTTP bodies ----

class AnalyzeMeta(Model):
    promptId: str
    targets: list[SyllableTarget]
    calibration: AudioCalibration


class CoachRequest(Model):
    prompt: PromptItem
    items: list[FeedbackItem]


class Tip(Model):
    issueId: str
    text: str


class CoachResponse(Model):
    tips: list[Tip]


# ---- Fixtures ----

class ExpectedCard(Model):
    syllableIndex: int
    issueId: str


class FixtureEntry(Model):
    promptId: str
    variant: str
    label: str
    beat: Optional[str] = None
    expectCards: list[ExpectedCard]
