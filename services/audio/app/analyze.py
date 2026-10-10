"""The real /analyze pipeline: WAV + targets to AudioAnalysis (SPEC.md Modules A and B).
Vowels (Module C) are not scored yet: `vowel` is left out."""
from . import pitch, segment, tone
from .models import AnalyzeMeta


def analyze(wav: bytes, meta: AnalyzeMeta) -> dict:
    snd = pitch.load(wav)
    cal_f0 = meta.calibration.f0.model_dump()
    times, f0, db = pitch.tracks(snd, cal_f0["lowHz"], cal_f0["highHz"])
    runs, warnings = segment.segment(f0, db, len(meta.targets))
    half = pitch.STEP / 2
    syllables = []
    for target, (s, e) in zip(meta.targets, runs):
        start, end = float(times[s] - half), float(times[e - 1] + half)
        v_start, v_end = segment.vowel_window(start, end, target.vowel is not None)
        prev = meta.targets[target.index - 1].surfaceTone if target.index > 0 else None
        produced, ratio = tone.contour(f0[s:e], cal_f0, target.variant)
        syllables.append({
            "index": target.index,
            "target": target.model_dump(exclude_none=True),
            "start": round(start, 3), "end": round(end, 3),
            "vowelStart": round(v_start, 3), "vowelEnd": round(v_end, 3),
            "tone": tone.tone_result(target.variant, produced, ratio, tone.NEUTRAL_LEVEL.get(prev, 3)),
        })
    return {"promptId": meta.promptId, "durationSec": round(snd.duration, 3), "syllables": syllables,
            "warnings": pitch.warnings(snd) + warnings}
