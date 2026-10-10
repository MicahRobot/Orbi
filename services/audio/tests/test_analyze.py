"""End to end through /analyze in real mode, on a synthetic voice saying 你好 (ní hǎo)."""
import json

from fastapi.testclient import TestClient

import app.main as main
from tests.synth import RATE, buzz, wav
from tests.test_tone import frames

CAL = json.loads((main.FIXTURES / "calibration.json").read_text())["audio"]
TARGETS = [{"index": 0, "pinyin": "ni3", "surfaceTone": 2, "variant": "T2", "sandhiNote": "3+3 → 2+3"},
           {"index": 1, "pinyin": "hao3", "surfaceTone": 3, "variant": "T3_full"}]


def voice(variants, dur=0.35):
    """A buzzy vowel per syllable following each template's pitch, with silence between."""
    return wav(*[buzz(frames(v, int(dur * RATE))) for v in variants])


def post(wav, monkeypatch):
    monkeypatch.setattr(main, "MODE", "real")
    meta = json.dumps({"promptId": "nihao", "targets": TARGETS, "calibration": CAL})
    return TestClient(main.app).post("/analyze", files={"audio": ("a.wav", wav, "audio/wav")}, data={"meta": meta})


def test_correct_nihao_scores_green(monkeypatch):
    r = post(voice(["T2", "T3_full"]), monkeypatch)
    assert r.status_code == 200
    a = r.json()
    assert a["warnings"] == []
    s0, s1 = a["syllables"]
    assert 0.1 < s0["start"] < 0.2 and 0.45 < s0["end"] < 0.55 and s1["start"] > s0["end"]
    assert s0["target"]["sandhiNote"] == "3+3 → 2+3"
    for s in a["syllables"]:
        assert s["tone"]["issues"] == [], s["tone"]
        assert s["tone"]["rmse"] <= 0.6


def test_full_dips_flag_wrong_tone_on_ni(monkeypatch):
    s0 = post(voice(["T3_full", "T3_full"]), monkeypatch).json()["syllables"][0]
    assert "wrong_tone" in s0["tone"]["issues"]
    assert s0["tone"]["nearest"] == "T3_full"


def test_unreadable_wav_is_422(monkeypatch):
    assert post(b"RIFFnope", monkeypatch).status_code == 422
