"""POST /coach: Gemini rewords each fix card as a friendly tip, tuned to the learner's native language.

SPEC.md Module F. Gemini only rephrases: the diagnosis comes from the rules engine and never changes.
Any failure (no key, timeout, empty reply) falls back to the card's template text, so the UI never waits on it.
Lane B owns this file.
"""
import json
import os
from concurrent.futures import ThreadPoolExecutor

from google import genai

from .models import CoachRequest, CoachResponse, FeedbackItem, PromptItem, Tip

MODEL = os.getenv("GEMINI_COACH_MODEL", "gemini-3.5-flash-lite")
TIMEOUT_S = 2.5

SYSTEM = """You are a friendly Mandarin pronunciation coach for beginners.
You receive JSON describing one pronunciation problem that has already been diagnosed,
the learner's native language, and a template instruction. Rewrite the instruction as a
tip of at most two short sentences, in English. Rules:
- Never add, remove or change the diagnosis. Only rephrase it.
- Describe physical actions (lips, tongue, voice pitch), not phonetic terms.
- If you mention a sound, compare it to a common English word.
- If an l1Note is given, weave it in briefly and kindly.
- No praise filler. Return only the tip text."""


def _tip(client: genai.Client, prompt: PromptItem, item: FeedbackItem, l1: str) -> str:
    payload = {
        "word": {"hanzi": prompt.hanzi, "pinyin": prompt.pinyin, "gloss": prompt.gloss},
        "nativeLanguage": l1,
        "issue": item.diagnosis.issueId,
        "articulator": item.diagnosis.articulator,
        "title": item.title,
        "instruction": item.instruction,
        "l1Note": item.l1Note,
    }
    reply = client.interactions.create(
        model=MODEL,
        system_instruction=SYSTEM,
        input=json.dumps(payload, ensure_ascii=False),
        generation_config={"max_output_tokens": 120, "thinking_level": "minimal"},
        timeout=TIMEOUT_S,
    )
    return (reply.output_text or "").strip()


def coach(req: CoachRequest) -> CoachResponse:
    key = os.getenv("GEMINI_API_KEY")
    texts = [item.instruction for item in req.items]
    if key and req.items:
        client = genai.Client(api_key=key)
        with ThreadPoolExecutor(max_workers=len(req.items)) as pool:
            futures = [pool.submit(_tip, client, req.prompt, item, req.l1) for item in req.items]
            for i, f in enumerate(futures):
                try:
                    texts[i] = f.result(timeout=TIMEOUT_S + 0.5) or texts[i]
                except Exception:
                    pass  # keep the template text
    return CoachResponse(tips=[Tip(issueId=item.diagnosis.issueId, text=t) for item, t in zip(req.items, texts)])
