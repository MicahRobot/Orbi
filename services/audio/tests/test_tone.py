import json
from pathlib import Path

import numpy as np
import pytest

from app import tone

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
CAL_F0 = json.loads((FIXTURES / "calibration.json").read_text())["audio"]["f0"]


def to_hz(levels):
    """Chao levels to Hz for the fixture voice: the inverse of tone.contour's scaling."""
    st = lambda hz: 12 * np.log2(hz / CAL_F0["medianHz"])
    lo, hi = st(CAL_F0["lowHz"]), st(CAL_F0["highHz"])
    return CAL_F0["medianHz"] * 2 ** ((lo + (np.asarray(levels) - 1) / 4 * (hi - lo)) / 12)


def frames(variant, n=40):
    """A syllable's f0 frames, n long: the template over the middle 80% that B2 keeps, held at the trimmed edges."""
    x = np.clip((np.linspace(0, 1, n) - 0.1) / 0.8, 0, 1)
    return to_hz(np.interp(x, np.linspace(0, 1, 10), tone.template(variant)))


SYLLABLES = [(f.name, s) for f in sorted((FIXTURES / "analysis").glob("*.json"))
             for s in json.loads(f.read_text())["syllables"]]


@pytest.mark.parametrize("name,s", SYLLABLES, ids=[f"{n}:{s['index']}" for n, s in SYLLABLES])
def test_scoring_matches_fixture_oracle(name, s):
    t = s["tone"]
    got = tone.tone_result(t["target"], t["producedChao"], t["voicedRatio"])
    assert sorted(got["issues"]) == sorted(t["issues"])
    assert (got["nearest"], got["targetChao"]) == (t["nearest"], t["targetChao"])
    # Fixtures scored the unrounded contour; producedChao is rounded to 0.01.
    assert got["rmse"] == pytest.approx(t["rmse"], abs=0.005)
    assert abs(got["score"] - t["score"]) <= 1


@pytest.mark.parametrize("variant", list(tone.ANCHORS))
def test_contour_recovers_each_template(variant):
    produced, ratio = tone.contour(frames(variant), CAL_F0, variant)
    assert ratio == 1.0
    assert tone.rmse(produced, tone.template(variant)) < 0.1
    assert tone.tone_result(variant, produced, ratio)["issues"] == []


def test_short_gaps_are_filled_and_long_tone3_gaps_count_as_creak():
    f0 = frames("T2")
    f0[15:20] = np.nan
    assert tone.contour(f0, CAL_F0, "T2")[0] == pytest.approx(tone.contour(frames("T2"), CAL_F0, "T2")[0], abs=0.1)
    f0 = frames("T3_full")
    f0[14:26] = np.nan  # 120 ms dropout at the bottom of the dip
    produced, ratio = tone.contour(f0, CAL_F0, "T3_full")
    assert ratio == pytest.approx(0.7)
    assert min(produced) <= 1.1
    assert tone.tone_result("T3_full", produced, ratio)["issues"] == []


def test_no_pitch():
    produced, ratio = tone.contour(np.full(30, np.nan), CAL_F0, "T1")
    assert produced == [] and ratio == 0
    r = tone.tone_result("T1", produced, ratio)
    assert (r["issues"], r["score"]) == (["no_pitch"], 0)
    assert "no_pitch" in tone.tone_result("T1", tone.template("T1"), 0.2)["issues"]


@pytest.mark.parametrize("target,contour,issue", [
    ("T1", np.linspace(5, 3.6, 10), "t1_drift"),
    ("T1", [3.5] * 10, "t1_low"),
    ("T2", np.linspace(3, 4, 10), "t2_shallow"),
    ("T2", [3.2, 2.9, 2.5, 2.1, 1.8, 1.7, 2.0, 2.8, 3.7, 4.4], "t2_late"),
    ("T3_full", np.interp(np.linspace(0, 1, 10), [0, 0.6, 1], [3, 2.4, 4.5]), "t3_not_low"),
    ("T3_half", tone.template("T3_full"), "t3_full_in_context"),
    ("T4", np.linspace(5, 3.5, 10), "t4_shallow"),
    ("T4", np.linspace(3.5, 1, 10), "t4_low_start"),
    ("T1", tone.template("T4"), "wrong_tone"),
])
def test_each_issue_detector(target, contour, issue):
    assert issue in tone.tone_result(target, [float(x) for x in contour], 0.9)["issues"]


def test_neutral_tone_template_and_no_wrong_tone():
    assert tone.template("T5", tone.NEUTRAL_LEVEL[3]) == [4.0] * 10
    assert tone.tone_result("T5", tone.template("T1"), 0.9, 1)["issues"] == []
