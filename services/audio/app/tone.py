"""Tone contour, templates, scoring and issue detectors (SPEC.md B2-B5).
B3-B5 follow shared/fixtures/make_fixtures.py exactly; tests/test_tone.py checks against its fixtures."""
import math

import numpy as np
from scipy.ndimage import median_filter

ANCHORS = {
    "T1": [(0, 5), (1, 5)],
    "T2": [(0, 3), (0.2, 2.7), (1, 5)],
    "T3_full": [(0, 2), (0.6, 1), (1, 4)],
    "T3_half": [(0, 2), (1, 1)],
    "T4": [(0, 5), (1, 1)],
}
NEUTRAL_LEVEL = {1: 2, 2: 3, 3: 4, 4: 1}  # B1 rule 5: neutral-tone height after each tone
MAX_GAP = 8  # 80 ms
BLIP = 4     # voiced islands under 40 ms next to a longer one are tracker errors (octave jumps at consonants and creak)


def template(variant: str, neutral_level: float = 3) -> list[float]:
    if variant == "T5":
        return [float(neutral_level)] * 10
    xs, ys = zip(*ANCHORS[variant])
    return list(np.interp(np.linspace(0, 1, 10), xs, ys))


def _fill_short_gaps(x: np.ndarray) -> np.ndarray:
    """Linear interpolation across interior NaN gaps of MAX_GAP frames or fewer."""
    x = x.copy()
    voiced = np.flatnonzero(~np.isnan(x))
    for a, b in zip(voiced, voiced[1:]):
        if 1 < b - a <= MAX_GAP + 1:
            x[a + 1:b] = np.interp(range(a + 1, b), [a, b], [x[a], x[b]])
    return x


def _drop_blips(f0: np.ndarray) -> np.ndarray:
    voiced = np.concatenate(([0], (~np.isnan(f0)).astype(int), [0]))
    edges = np.flatnonzero(np.diff(voiced))
    islands = list(zip(edges[::2], edges[1::2]))
    if not islands or max(e - s for s, e in islands) < BLIP:
        return f0
    f0 = f0.copy()
    for s, e in islands:
        if e - s < BLIP:
            f0[s:e] = np.nan
    return f0


def _fix_octaves(f0: np.ndarray) -> np.ndarray:
    """Halve or double frames that jump by more than 1.6x from the previous voiced frame, walking out
    from the middle of the longest voiced island: pitch trackers jump octaves at consonants and in creak."""
    voiced = np.flatnonzero(~np.isnan(f0))
    if len(voiced) < 2:
        return f0
    f0 = f0.copy()
    islands = np.split(voiced, np.flatnonzero(np.diff(voiced) > 1) + 1)
    core = max(islands, key=len)
    mid = int(np.flatnonzero(voiced == core[len(core) // 2])[0])
    for order in (voiced[mid + 1:], voiced[mid - 1::-1] if mid else []):
        prev = f0[voiced[mid]]
        for i in order:
            while f0[i] > 1.6 * prev:
                f0[i] /= 2
            while f0[i] < prev / 1.6:
                f0[i] *= 2
            prev = f0[i]
    return f0


def contour(f0: np.ndarray, cal_f0: dict, variant: str):
    """Syllable f0 frames (Hz, NaN = unvoiced) to (10 Chao levels or [], voicedRatio)."""
    voiced_ratio = float(np.mean(~np.isnan(f0))) if len(f0) else 0.0
    trim = int(len(f0) * 0.1)
    f0 = _fill_short_gaps(_fix_octaves(_drop_blips(f0))[trim:len(f0) - trim])
    if np.sum(~np.isnan(f0)) < 3:
        return [], voiced_ratio
    voiced = np.flatnonzero(~np.isnan(f0))
    f0 = f0[voiced[0]:voiced[-1] + 1]  # drop unvoiced edges

    med, lo, hi = cal_f0["medianHz"], cal_f0["lowHz"], cal_f0["highHz"]
    st = lambda hz: 12 * np.log2(hz / med)
    gap = np.isnan(f0)
    filled = np.interp(np.arange(len(f0)), np.flatnonzero(~gap), f0[~gap])
    level = 1 + 4 * (st(median_filter(filled, 5, mode="nearest")) - st(lo)) / (st(hi) - st(lo))
    # Creaky voice: a tone-3 gap inside the middle 60% sits at the bottom of the voice, not missing.
    if variant.startswith("T3"):
        mid = np.zeros(len(f0), bool)
        mid[int(0.2 * len(f0)):int(0.8 * len(f0))] = True
        level[gap & mid] = 1
    level = np.clip(level, 0.5, 5.5)
    return list(np.interp(np.linspace(0, 1, 10), np.linspace(0, 1, len(level)), level)), voiced_ratio


def rmse(a, b) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / len(a))


def detect(target: str, p: list[float], voiced_ratio: float) -> list[str]:
    issues = []
    if voiced_ratio < 0.3:
        issues.append("no_pitch")
    if not p:
        return issues
    start, end, lo, hi = p[0], p[-1], min(p), max(p)
    if target == "T1":
        if abs(end - start) > 1.0:
            issues.append("t1_drift")
        if sum(p) / len(p) < 3.8:
            issues.append("t1_low")
    if target == "T2":
        if hi - lo < 1.5:
            issues.append("t2_shallow")
        if p.index(lo) >= 4 and start - lo >= 0.7:
            issues.append("t2_late")
    if target in ("T3_full", "T3_half"):
        if lo > 2.0:
            issues.append("t3_not_low")
        if target == "T3_half" and end - lo > 1.5:
            issues.append("t3_full_in_context")
    if target == "T4":
        if start - end < 2.0:
            issues.append("t4_shallow")
        if start < 4.0:
            issues.append("t4_low_start")
    return issues


def tone_result(target: str, produced: list[float], voiced_ratio: float, neutral_level: float = 3) -> dict:
    """ToneResult. With no usable pitch, producedChao is empty and the score is 0."""
    t = template(target, neutral_level)
    issues = detect(target, produced, voiced_ratio)
    if not produced:
        return {"target": target, "producedChao": [], "targetChao": [round(x, 2) for x in t], "nearest": target,
                "rmse": 2.0, "score": 0, "issues": issues or ["no_pitch"], "voicedRatio": round(voiced_ratio, 2)}
    err = {v: rmse(produced, template(v)) for v in ANCHORS}  # T5 is never "nearest" (NOTES.md)
    nearest = min(err, key=err.get)
    r = rmse(produced, t)
    if target != "T5" and nearest != target and r - err[nearest] > 0.3:
        issues.append("wrong_tone")
    return {
        "target": target,
        "producedChao": [round(x, 2) for x in produced],
        "targetChao": [round(x, 2) for x in t],
        "nearest": nearest,
        "rmse": round(r, 3),
        "score": round(100 * min(max(1 - r / 2, 0), 1)),
        "issues": issues,
        "voicedRatio": round(voiced_ratio, 2),
    }
