"""Formants and i / ü / u classification against the learner's own "ee" and "oo" (SPEC.md Module C).
classify() follows shared/fixtures/make_fixtures.py; tests/test_vowel.py checks against its fixtures."""
import numpy as np
import parselmouth

from . import pitch, segment


def ceiling(median_hz: float) -> int:
    return 5500 if median_hz > 165 else 5000


def measure(snd: parselmouth.Sound, ceiling_hz: int, start: float, end: float):
    """Median F1-F3 in [start, end), plus median F2 in its first and last thirds."""
    formant = snd.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=ceiling_hz, window_length=0.025)
    ts = [t for t in formant.xs() if start <= t < end] or [(start + end) / 2]
    f = np.array([[formant.get_value_at_time(n, t) for n in (1, 2, 3)] for t in ts])
    third = max(len(ts) // 3, 1)
    med = lambda a: float(np.nanmedian(a))
    return (med(f[:, 0]), med(f[:, 1]), med(f[:, 2])), med(f[:third, 1]), med(f[-third:, 1])


def classify(f2n: float, f3ratio: float):
    """(heardAs, confidence): confidence is the distance from the nearest threshold, scaled to 0-1."""
    if f2n < 0.45:
        heard, conf = "u", (0.45 - f2n) / 0.3
    elif f3ratio < 0.90:
        heard, conf = "y", min(f2n - 0.45, 0.90 - f3ratio) / 0.1
    else:
        heard, conf = "i", min((f2n - 0.45) / 0.3, (f3ratio - 0.90) / 0.1)
    return heard, round(min(max(conf, 0), 1), 2)


def vowel_result(snd: parselmouth.Sound, target: str, start: float, end: float, cal: dict) -> dict:
    (f1, f2, f3), f2_first, f2_last = measure(snd, cal["formantCeilingHz"], start, end)
    i, u = cal["anchors"]["i"], cal["anchors"]["u"]
    f2n = (f2 - u["F2"]) / (i["F2"] - u["F2"])
    f3ratio = f3 / i["F3"]
    heard, conf = classify(f2n, f3ratio)
    return {
        "target": target,
        "formants": {"F1": round(f1), "F2": round(f2), "F3": round(f3)},
        "f2n": round(f2n, 2), "f3ratio": round(f3ratio, 2),
        "heardAs": heard,
        "glide": bool(abs(f2_last - f2_first) / f2 > 0.25),
        "confidence": conf,
    }


def _held_vowel(wav: bytes):
    """(Sound, median f0, (start, end) of the central 40% of the voiced part) for one calibration take."""
    snd = pitch.load(wav)
    times, f0, db = pitch.tracks(snd)
    runs = segment.voiced_runs(f0, db)
    if not runs:
        raise ValueError("no voice found in a calibration take")
    s, e = max(runs, key=lambda r: r[1] - r[0])
    return snd, float(np.nanmedian(f0[s:e])), segment.vowel_window(float(times[s]), float(times[e - 1]), True)


def calibrate(glide: bytes, ee: bytes, oo: bytes, ah: bytes) -> dict:
    """AudioCalibration. Range from the siren glide's 5th/95th percentile; median and formants from the held vowels."""
    _, f0, _ = pitch.tracks(pitch.load(glide))
    voiced = f0[~np.isnan(f0)]
    if len(voiced) < 20:
        raise ValueError("couldn't hear the glide")
    takes = {k: _held_vowel(w) for k, w in (("i", ee), ("u", oo), ("a", ah))}
    median = float(np.median([m for _, m, _ in takes.values()]))
    top = ceiling(median)
    anchors = {}
    for k, (snd, _, (start, end)) in takes.items():
        (f1, f2, f3), _, _ = measure(snd, top, start, end)
        anchors[k] = {"F1": round(f1), "F2": round(f2), "F3": round(f3)}
    if anchors["i"]["F2"] - anchors["u"]["F2"] < 300:  # f2n divides by this gap
        raise ValueError('"ee" and "oo" sounded too alike')
    lo, hi = np.percentile(voiced, [5, 95])
    return {"f0": {"medianHz": round(median, 1), "lowHz": round(float(lo), 1), "highHz": round(float(hi), 1)},
            "formantCeilingHz": top, "anchors": anchors}
