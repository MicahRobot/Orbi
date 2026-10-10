"""Regenerate the fixture JSON in this folder: python3 shared/fixtures/make_fixtures.py

Fixtures let each lane run without the other: the web app replays these instead of
calling the audio service (VITE_AUDIO_MODE=fixture) or using the camera (VITE_FACE_MODE=fixture).
Contours are synthetic; the scoring below follows SPEC.md B3-B5 so the numbers are consistent.
This is fixture tooling, not product code: the real scoring lives in services/audio/app/.
Stdlib only.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent

# ---- Tone templates and scoring (SPEC.md B3-B5) ----

ANCHORS = {
    "T1": [(0, 5), (1, 5)],
    "T2": [(0, 3), (0.2, 2.7), (1, 5)],
    "T3_full": [(0, 2), (0.6, 1), (1, 4)],
    "T3_half": [(0, 2), (1, 1)],
    "T4": [(0, 5), (1, 1)],
}


def template(variant):
    pts = ANCHORS[variant]
    out = []
    for i in range(10):
        x = i / 9
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= x <= x1:
                out.append(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
                break
    return out


def rmse(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / len(a))


def detect(target, p, voiced_ratio):
    start, end, lo, hi = p[0], p[-1], min(p), max(p)
    issues = []
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
    if voiced_ratio < 0.3:
        issues.append("no_pitch")
    return issues


def tone_result(target, produced, voiced_ratio=0.92):
    t = template(target)
    err = {v: rmse(produced, template(v)) for v in ANCHORS}
    nearest = min(err, key=err.get)
    issues = detect(target, produced, voiced_ratio)
    if nearest != target and err[target] - err[nearest] > 0.3:
        issues.append("wrong_tone")
    r = err[target]
    return {
        "target": target,
        "producedChao": [round(x, 2) for x in produced],
        "targetChao": [round(x, 2) for x in t],
        "nearest": nearest,
        "rmse": round(r, 3),
        "score": round(100 * min(max(1 - r / 2, 0), 1)),
        "issues": issues,
        "voicedRatio": voiced_ratio,
    }


def natural(variant, seed):
    """A correct production: the template plus a little wobble."""
    return [y + 0.15 * math.sin(1.7 * i + seed) for i, y in enumerate(template(variant))]


# ---- Calibration ----

CAL = {
    "audio": {
        "f0": {"medianHz": 140, "lowHz": 95, "highHz": 260},
        "formantCeilingHz": 5000,  # median F0 <= 165 Hz
        "anchors": {
            "i": {"F1": 280, "F2": 2250, "F3": 2950},
            "u": {"F1": 300, "F2": 800, "F3": 2300},
            "a": {"F1": 750, "F2": 1250, "F3": 2600},
        },
    },
    "face": {
        pose: {"t": 0, "detected": True, **dict(zip(
            ["lipWidth", "lipHeight", "pucker", "funnel", "jawOpen", "smile"], vals))}
        for pose, vals in {
            "neutral": [0.40, 0.02, 0.05, 0.03, 0.05, 0.10],
            "ee": [0.48, 0.05, 0.02, 0.02, 0.12, 0.45],
            "oo": [0.28, 0.06, 0.65, 0.40, 0.15, 0.02],
            "ah": [0.42, 0.25, 0.03, 0.10, 0.60, 0.05],
        }.items()
    },
    "createdAt": "2026-10-10T12:00:00Z",
}


def vowel_result(target, f2n, f3ratio, glide=False):
    a = CAL["audio"]["anchors"]
    if f2n < 0.45:
        heard, conf = "u", (0.45 - f2n) / 0.3
    elif f3ratio < 0.90:
        heard, conf = "y", min(f2n - 0.45, 0.90 - f3ratio) / 0.1
    else:
        heard, conf = "i", min((f2n - 0.45) / 0.3, (f3ratio - 0.90) / 0.1)
    return {
        "target": target,
        "formants": {"F1": 300, "F2": round(a["u"]["F2"] + f2n * (a["i"]["F2"] - a["u"]["F2"])),
                     "F3": round(f3ratio * a["i"]["F3"])},
        "f2n": f2n,
        "f3ratio": f3ratio,
        "heardAs": heard,
        "glide": glide,
        "confidence": round(min(max(conf, 0), 1), 2),
    }


# ---- Prompts: surface targets after sandhi (must match apps/web/src/content/prompts.ts) ----
# (pinyin, surfaceTone, variant, sandhiNote, vowel)

PROMPTS = {
    "ma4": ("list", [("ma1", 1, "T1", None, None), ("ma2", 2, "T2", None, None),
                     ("ma3", 3, "T3_full", None, None), ("ma4", 4, "T4", None, None)]),
    "nihao": ("word", [("ni3", 2, "T2", "3+3 → 2+3", None), ("hao3", 3, "T3_full", None, None)]),
    "nv": ("word", [("nv3", 3, "T3_full", None, "y")]),
    "ni": ("word", [("ni3", 3, "T3_full", None, "i")]),
    "nu": ("word", [("nu3", 3, "T3_full", None, "u")]),
    "qu": ("word", [("qu4", 4, "T4", None, "y")]),
    "yu": ("word", [("yu2", 2, "T2", None, "y")]),
    "bushi": ("word", [("bu4", 2, "T2", "不 before tone 4 → bú", None), ("shi4", 4, "T4", None, None)]),
    "yige": ("word", [("yi1", 2, "T2", "一 before tone 4 → yí", None), ("ge4", 4, "T4", None, None)]),
    "laoshi": ("word", [("lao3", 3, "T3_half", "half third tone: stays low", None), ("shi1", 1, "T1", None, None)]),
    "zhongguo": ("word", [("zhong1", 1, "T1", None, None), ("guo2", 2, "T2", None, None)]),
}

# Correct-sounding vowel and lip values per vowel class: (f2n, f3ratio, roundness)
GOOD_VOWEL = {"i": (0.95, 0.98, 0.10), "y": (0.82, 0.84, 0.74), "u": (0.20, 0.82, 0.85)}

# ---- Variants: what the speaker did wrong ----
# Each override: syllable index -> produced contour and/or (f2n, f3ratio, roundness, glide)

VARIANTS = [
    # promptId, variant, label, demo beat, tone overrides, vowel overrides, expected fix cards
    ("ma4", "t2_dip", "麻 dips before it rises", "0:40 Tones",
     {1: [3.2, 2.9, 2.5, 2.1, 1.8, 1.7, 2.0, 2.8, 3.7, 4.4]}, {}, [(1, "t2_late")]),
    ("ma4", "correct", "All four tones right", "0:40 Tones (retry turns green)", {}, {}, []),
    ("nihao", "full_dips", "Both syllables said as full tone 3", "1:10 Sandhi",
     {0: [2.2, 1.8, 1.4, 1.1, 1.0, 1.0, 1.4, 2.3, 3.2, 3.9]}, {}, [(0, "wrong_tone")]),
    ("nihao", "correct", "ní hǎo, sandhi applied", None, {}, {}, []),
    ("nv", "nee", "女 said as 'nee': lips spread", "1:35 Face explains the error",
     {}, {0: (0.97, 0.99, 0.12, False)}, [(0, "y_lips_not_rounded")]),
    ("nv", "noo", "女 said as 'noo': lips rounded, tongue back", "2:05 Same word, different fix",
     {}, {0: (0.18, 0.83, 0.81, False)}, [(0, "y_tongue_back")]),
    ("nv", "correct", "女 said correctly", "2:20 Recognizes success", {}, {}, []),
    ("nv", "glide", "女 slides like English 'you'", None,
     {}, {0: (0.60, 0.88, 0.50, True)}, [(0, "y_glide")]),
    ("ma4", "t4_shallow", "骂 falls only halfway", None,
     {3: [4.6, 4.5, 4.3, 4.1, 3.9, 3.7, 3.5, 3.3, 3.1, 3.0]}, {}, [(3, "t4_shallow")]),
] + [(pid, "correct", "Said correctly", None, {}, {}, [])
     for pid in PROMPTS if pid not in ("ma4", "nihao", "nv")]


def build(pid, tone_over, vowel_over):
    reading, sylls = PROMPTS[pid]
    dur, gap = (0.38, 0.35) if reading == "list" else (0.32, 0.04)
    t, out, face = 0.25, [], []
    for i, (pinyin, surface, variant, note, vowel) in enumerate(sylls):
        start, end = t, t + dur
        lo, hi = (0.3, 0.7) if vowel else (0.3, 0.85)
        target = {"index": i, "pinyin": pinyin, "surfaceTone": surface, "variant": variant}
        if note:
            target["sandhiNote"] = note
        if vowel:
            target["vowel"] = vowel
        s = {
            "index": i, "target": target, "start": round(start, 3), "end": round(end, 3),
            "vowelStart": round(start + lo * dur, 3), "vowelEnd": round(start + hi * dur, 3),
            "tone": tone_result(variant, tone_over.get(i) or natural(variant, seed=i + len(pid))),
        }
        roundness = 0.30
        if vowel:
            f2n, f3, roundness, glide = vowel_over.get(i) or (*GOOD_VOWEL[vowel], False)
            s["vowel"] = vowel_result(vowel, f2n, f3, glide)
        out.append(s)
        face.append({"syllableIndex": i, "roundness": roundness, "jawOpen": 0.12 if vowel else 0.3,
                     "coverage": 0.96})
        t = end + gap
    analysis = {"promptId": pid, "durationSec": round(t - gap + 0.6, 3), "syllables": out, "warnings": []}
    return analysis, face


def main():
    (HERE / "analysis").mkdir(exist_ok=True)
    (HERE / "face").mkdir(exist_ok=True)
    index = []
    for pid, variant, label, beat, tone_over, vowel_over, cards in VARIANTS:
        analysis, face = build(pid, tone_over, vowel_over)
        # self-check: every expected tone card is backed by an issue the service reports
        for i, issue in cards:
            if not issue.startswith(("y_", "u_", "i_")):
                assert issue in analysis["syllables"][i]["tone"]["issues"], (pid, variant, issue)
        if not cards:
            for s in analysis["syllables"]:
                assert not s["tone"]["issues"], (pid, variant, s["tone"]["issues"])
        name = f"{pid}.{variant}.json"
        (HERE / "analysis" / name).write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + "\n")
        (HERE / "face" / name).write_text(json.dumps(face, indent=2) + "\n")
        entry = {"promptId": pid, "variant": variant, "label": label}
        if beat:
            entry["beat"] = beat
        entry["expectCards"] = [{"syllableIndex": i, "issueId": issue} for i, issue in cards]
        index.append(entry)
    (HERE / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    (HERE / "calibration.json").write_text(json.dumps(CAL, indent=2) + "\n")
    print(f"wrote {len(index)} fixtures")


if __name__ == "__main__":
    main()
