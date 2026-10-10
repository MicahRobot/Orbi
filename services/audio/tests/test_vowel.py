import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import vowel
from tests.synth import RATE, buzz, held, slide, wav

EE, OO, AH = (280, 2250, 2950), (300, 800, 2300), (750, 1250, 2600)
YU = (290, 1990, 2480)  # ü: tongue as "ee", lips rounded (lower F2, much lower F3)
FIXTURE_VOWELS = [json.loads(f.read_text())["syllables"][0]["vowel"]
                  for f in sorted((main.FIXTURES / "analysis").glob("*.json"))
                  if "vowel" in json.loads(f.read_text())["syllables"][0]]


@pytest.mark.parametrize("v", FIXTURE_VOWELS)
def test_classify_matches_fixture_oracle(v):
    assert vowel.classify(v["f2n"], v["f3ratio"]) == (v["heardAs"], v["confidence"])


def test_ceiling():
    assert (vowel.ceiling(140), vowel.ceiling(165), vowel.ceiling(200)) == (5000, 5000, 5500)


def calibrate(monkeypatch, ee=EE, oo=OO):
    monkeypatch.setattr(main, "MODE", "real")
    takes = {"glide": wav(buzz(np.geomspace(260, 95, 3 * RATE))), "ee": wav(held(ee)), "oo": wav(held(oo)), "ah": wav(held(AH))}
    return TestClient(main.app).post("/calibrate/audio", files={k: (f"{k}.wav", w, "audio/wav") for k, w in takes.items()})


def test_calibration_measures_range_and_anchors(monkeypatch):
    r = calibrate(monkeypatch)
    assert r.status_code == 200
    cal = r.json()
    assert cal["formantCeilingHz"] == 5000 and cal["f0"]["medianHz"] == pytest.approx(130, abs=2)
    assert 95 < cal["f0"]["lowHz"] < 110 and 235 < cal["f0"]["highHz"] < 260
    for k, f in (("i", EE), ("u", OO), ("a", AH)):
        assert [cal["anchors"][k][n] for n in ("F1", "F2", "F3")] == pytest.approx(f, rel=0.05)


def test_calibration_rejects_ee_and_oo_that_sound_alike(monkeypatch):
    r = calibrate(monkeypatch, oo=EE)
    assert r.status_code == 422 and "too alike" in r.json()["detail"]


def test_calibration_rejects_silence(monkeypatch):
    monkeypatch.setattr(main, "MODE", "real")
    silent = wav(np.zeros(RATE))
    files = {k: (f"{k}.wav", silent, "audio/wav") for k in ("glide", "ee", "oo", "ah")}
    assert TestClient(main.app).post("/calibrate/audio", files=files).status_code == 422


@pytest.mark.parametrize("name,sound,heard,glide", [
    ("correct", held(YU, dur=0.4), "y", False),
    ("nee", held(EE, dur=0.4), "i", False),
    ("noo", held(OO, dur=0.4), "u", False),
    ("you", slide([EE, (285, 1900, 2700), (290, 1500, 2550), (295, 1100, 2400), OO], dur=0.4), None, True),
])
def test_nv_vowel_end_to_end(monkeypatch, name, sound, heard, glide):
    cal = calibrate(monkeypatch).json()
    meta = {"promptId": "nv", "targets": [{"index": 0, "pinyin": "nv3", "surfaceTone": 3, "variant": "T3_full", "vowel": "y"}],
            "calibration": cal}
    r = TestClient(main.app).post("/analyze", files={"audio": ("a.wav", wav(sound), "audio/wav")}, data={"meta": json.dumps(meta)})
    v = r.json()["syllables"][0]["vowel"]
    assert v["glide"] is glide, v
    if heard:
        assert v["heardAs"] == heard, v
