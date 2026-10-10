"""End to end through /analyze in real mode, on a synthetic voice saying 你好 (ní hǎo)."""
import io
import json

import numpy as np
from fastapi.testclient import TestClient
from scipy.io import wavfile

import app.main as main
from tests.test_tone import frames

RATE = 16000
CAL = json.loads((main.FIXTURES / "calibration.json").read_text())["audio"]
TARGETS = [{"index": 0, "pinyin": "ni3", "surfaceTone": 2, "variant": "T2", "sandhiNote": "3+3 → 2+3"},
           {"index": 1, "pinyin": "hao3", "surfaceTone": 3, "variant": "T3_full"}]


def voice(variants, dur=0.35, gap=0.15):
    """A buzzy vowel per syllable following each template's pitch, with silence between."""
    parts = [np.zeros(int(0.2 * RATE))]
    for v in variants:
        n = int(dur * RATE)
        hz = frames(v, n)
        phase = 2 * np.pi * np.cumsum(hz) / RATE
        env = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.02 * RATE))
        parts += [0.3 * env * sum(np.sin(k * phase) / k for k in range(1, 8)), np.zeros(int(gap * RATE))]
    buf = io.BytesIO()
    wavfile.write(buf, RATE, (np.concatenate(parts) * 32767).astype(np.int16))
    return buf.getvalue()


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
    assert 0.15 < s0["start"] < 0.25 and 0.5 < s0["end"] < 0.6 and s1["start"] > s0["end"]
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
