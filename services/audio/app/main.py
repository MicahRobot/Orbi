"""Orbi audio service. Run from services/audio: uvicorn app.main:app --reload --port 8000 --env-file .env

Lane B owns this service. Until the real pipeline lands (SPEC.md Modules A, B2-B5, C),
/analyze and /calibrate/audio answer from shared/fixtures so lane A can integrate now.
"""
import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .coach import coach as coach_tips
from .models import AnalyzeMeta, AudioAnalysis, AudioCalibration, CoachRequest, CoachResponse

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
MODE = os.getenv("AUDIO_MODE", "fixture")  # flip to "real" once segment/tone/vowel exist

app = FastAPI(title="Orbi audio service")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


def not_built():
    raise HTTPException(501, "Real analysis isn't built yet: see docs/PERSON_B.md, or set AUDIO_MODE=fixture")


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
        not_built()
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
        not_built()
    return json.loads((FIXTURES / "calibration.json").read_text())["audio"]


@app.post("/coach", response_model=CoachResponse)
def coach(req: CoachRequest):
    return coach_tips(req)
