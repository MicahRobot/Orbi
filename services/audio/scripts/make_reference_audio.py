"""Generate native reference audio for every prompt with Gemini TTS. Lane B owns this script.

Run from services/audio with the venv active (GEMINI_API_KEY is read from services/audio/.env):
    python scripts/make_reference_audio.py            # all prompts
    python scripts/make_reference_audio.py nv ma4     # just these

Writes apps/web/public/ref/<promptId>.wav (24 kHz mono WAV). Listen to every file before the demo:
if a tone sounds off, re-run that prompt or replace it with a recording from a native speaker.
"""
import base64
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai

ROOT = Path(__file__).resolve().parents[3]
PROMPTS_TS = ROOT / "apps" / "web" / "src" / "content" / "prompts.ts"
OUT = ROOT / "apps" / "web" / "public" / "ref"
MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
VOICE = os.getenv("GEMINI_TTS_VOICE", "Kore")
STYLE = "a patient Mandarin teacher speaking standard Putonghua slowly and clearly, every tone distinct"


def main(only: list[str]) -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    prompts = re.findall(r'id: "(\w+)", hanzi: "([^"]+)"', PROMPTS_TS.read_text())
    assert prompts, f"no prompts found in {PROMPTS_TS}"
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    OUT.mkdir(parents=True, exist_ok=True)
    for pid, hanzi in prompts:
        if only and pid not in only:
            continue
        text = hanzi.replace(" ", "。<short pause> ")  # list prompts: each syllable on its own
        reply = client.interactions.create(
            model=MODEL,
            input=[{"type": "user_input", "content": [{
                "type": "text", "text": text,
                "annotations": [{"type": "speech_metadata", "style": STYLE}],
            }]}],
            response_format={"type": "audio"},
            generation_config={"speech_config": [{"voice": VOICE}]},
        )
        (OUT / f"{pid}.wav").write_bytes(base64.b64decode(reply.output_audio.data))
        print(f"wrote ref/{pid}.wav  ({hanzi})")


if __name__ == "__main__":
    main(sys.argv[1:])
