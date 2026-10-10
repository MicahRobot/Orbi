# Fixtures

Recorded-style results for every prompt, so each lane runs without the other.

- `analysis/<promptId>.<variant>.json`: an `AudioAnalysis`, what `/analyze` would return.
- `face/<promptId>.<variant>.json`: `FaceSummary[]`, what the face module would return.
- `index.json`: every fixture, what the speaker did, which demo beat it replays, and the fix cards `diagnose()` should produce (`expectCards`).
- `calibration.json`: one learner's `Calibration`.
- `audio/`: golden test set WAVs, once recorded (`<promptId>.<variant>.<take>.wav`).

Everything except `audio/` is generated. Don't hand-edit: change `make_fixtures.py`, then run

```bash
python3 shared/fixtures/make_fixtures.py
```

Fixture changes are contract changes: see docs/WORKFLOW.md §3.
