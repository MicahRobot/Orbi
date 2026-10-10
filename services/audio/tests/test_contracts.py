"""Every shared fixture must parse with the pydantic mirror. Catches drift between types.ts, models.py and fixtures."""
import json
from pathlib import Path

import pytest

from app.models import AudioAnalysis, Calibration, FaceSummary, FixtureEntry

FIX = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
INDEX = [FixtureEntry.model_validate(e) for e in json.loads((FIX / "index.json").read_text())]


def test_calibration_matches_contract():
    Calibration.model_validate_json((FIX / "calibration.json").read_text())


@pytest.mark.parametrize("entry", INDEX, ids=lambda e: f"{e.promptId}.{e.variant}")
def test_fixture_matches_contract(entry):
    name = f"{entry.promptId}.{entry.variant}.json"
    audio = AudioAnalysis.model_validate_json((FIX / "analysis" / name).read_text())
    faces = [FaceSummary.model_validate(f) for f in json.loads((FIX / "face" / name).read_text())]
    assert audio.promptId == entry.promptId
    assert [f.syllableIndex for f in faces] == [s.index for s in audio.syllables]
    assert all(c.syllableIndex < len(audio.syllables) for c in entry.expectCards)
