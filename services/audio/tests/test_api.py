import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
CAL = json.loads((Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "calibration.json").read_text())["audio"]
WAV = {"audio": ("attempt.wav", b"RIFF", "audio/wav")}


def meta(prompt_id):
    targets = [{"index": 0, "pinyin": "nv3", "surfaceTone": 3, "variant": "T3_full", "vowel": "y"}]
    return {"meta": json.dumps({"promptId": prompt_id, "targets": targets, "calibration": CAL})}


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_analyze_returns_fixture():
    r = client.post("/analyze", files=WAV, data=meta("nv"))
    assert r.status_code == 200
    assert r.json()["promptId"] == "nv"


def test_analyze_rejects_bad_input():
    assert client.post("/analyze", files=WAV, data=meta("../index")).status_code == 422
    assert client.post("/analyze", files=WAV, data={"meta": "{}"}).status_code == 422
    assert client.post("/analyze", files=WAV, data=meta("nope")).status_code == 404


def test_calibrate_audio_returns_fixture():
    files = {k: (f"{k}.wav", b"RIFF", "audio/wav") for k in ("glide", "ee", "oo", "ah")}
    assert client.post("/calibrate/audio", files=files).json() == CAL


ITEM = {
    "diagnosis": {"syllableIndex": 0, "issueId": "y_tongue_back", "articulator": "tongue",
                  "severity": 3, "evidence": {}, "messageKey": "y_tongue_back"},
    "title": "Tongue forward",
    "instruction": "Your lips are right. Keep your tongue tip behind your lower teeth.",
}
PROMPT = {"id": "nv", "hanzi": "女", "pinyin": ["nv3"], "gloss": "woman", "reading": "word", "focus": ["vowel"]}
COACH = {"prompt": PROMPT, "items": [ITEM], "l1": "en"}


def test_coach_without_key_returns_template_text(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.post("/coach", json=COACH).json() == {"tips": [{"issueId": "y_tongue_back", "text": ITEM["instruction"]}]}


def test_coach_uses_gemini_and_falls_back_on_error(monkeypatch):
    import app.coach as coach
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(coach, "_tip", lambda *a: "Push your tongue forward, like in 'see'.")
    assert client.post("/coach", json=COACH).json()["tips"][0]["text"].startswith("Push your tongue")

    def boom(*a):
        raise TimeoutError
    monkeypatch.setattr(coach, "_tip", boom)
    assert client.post("/coach", json=COACH).json()["tips"][0]["text"] == ITEM["instruction"]
