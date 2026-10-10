"""POST /coach: reword fix cards (SPEC.md Module F, "Coaching endpoint"). Lane B owns this file.

Template fallback only for now: each tip is the card's own instruction. The real version calls
a fast Claude model with a 2.5 s timeout and falls back to exactly this on any error.
"""
from .models import CoachRequest, CoachResponse, Tip


def coach(req: CoachRequest) -> CoachResponse:
    return CoachResponse(tips=[Tip(issueId=i.diagnosis.issueId, text=i.instruction) for i in req.items])
