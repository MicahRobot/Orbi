"""Orbi audio service. Run from services/audio: uvicorn app.main:app --reload --port 8000 --env-file .env

Lane B owns this service. With AUDIO_MODE=fixture (the default) /analyze and /calibrate/audio answer
from shared/fixtures. With AUDIO_MODE=real, /analyze runs analyze.py and /calibrate/audio runs vowel.calibrate.
"""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .analyze import analyze as analyze_audio
from .coach import coach as coach_tips
from .models import AnalyzeMeta, AudioAnalysis, AudioCalibration, CoachRequest, CoachResponse
from .vowel import calibrate

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
MODE = os.getenv("AUDIO_MODE", "fixture")

app = FastAPI(title="Orbi audio service")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/analyze", response_model=AudioAnalysis)
async def analyze(audio: UploadFile = File(...), meta: str = Form(...)):
    try:
        m = AnalyzeMeta.model_validate_json(meta)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False))
    if not re.fullmatch(r"[a-z0-9_]+", m.promptId):  # promptId becomes a file name below
        raise HTTPException(422, "promptId must be lowercase letters, digits or _")
    if MODE != "fixture":
        try:
            return analyze_audio(await audio.read(), m)
        except ValueError as e:  # unreadable or empty WAV
            raise HTTPException(422, f"Couldn't read the recording: {e}")
    path = FIXTURES / "analysis" / f"{m.promptId}.correct.json"
    if not path.exists():
        raise HTTPException(404, f"No fixture for prompt {m.promptId!r}")
    return json.loads(path.read_text())


@app.post("/calibrate/audio", response_model=AudioCalibration)
async def calibrate_audio(
    glide: UploadFile = File(...), ee: UploadFile = File(...),
    oo: UploadFile = File(...), ah: UploadFile = File(...),
):
    if MODE != "fixture":
        try:
            return calibrate(*[await f.read() for f in (glide, ee, oo, ah)])
        except ValueError as e:
            raise HTTPException(422, f"Calibration didn't work: {e}")
    return json.loads((FIXTURES / "calibration.json").read_text())["audio"]


@app.post("/coach", response_model=CoachResponse)
def coach(req: CoachRequest):
    return coach_tips(req)
