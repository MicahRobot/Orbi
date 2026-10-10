"""Look inside the /analyze pipeline for one recording: segments, raw pitch, contours, fit to every template, vowels.

Run from services/audio with the venv active:
    python scripts/diagnose_wav.py take.wav nv                      # fixture calibration
    python scripts/diagnose_wav.py take.wav nv --cal my_cal.json    # your calibration (AudioCalibration JSON)
    python scripts/diagnose_wav.py --calibrate glide.wav ee.wav oo.wav ah.wav > my_cal.json

Targets come from shared/fixtures/analysis/<promptId>.correct.json, which equal targetsFor() (diagnosis.test.ts).
"""
import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import pitch, tone, vowel  # noqa: E402
from app.analyze import analyze  # noqa: E402
from app.models import AnalyzeMeta  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
warnings.filterwarnings("ignore", message="Chunk")  # macOS `say` writes extra WAV chunks scipy skips


def fmt(xs) -> str:
    return " ".join("  -  " if x is None or np.isnan(x) else f"{x:5.2f}" if x < 20 else f"{x:5.0f}" for x in xs)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("wav", nargs="?")
    ap.add_argument("prompt", nargs="?")
    ap.add_argument("--cal", help="AudioCalibration JSON file")
    ap.add_argument("--calibrate", nargs=4, metavar=("GLIDE", "EE", "OO", "AH"))
    a = ap.parse_args()

    if a.calibrate:
        print(json.dumps(vowel.calibrate(*[Path(p).read_bytes() for p in a.calibrate]), indent=2))
        return
    if not (a.wav and a.prompt):
        ap.error("give a WAV and a promptId, or --calibrate")

    cal = json.loads(Path(a.cal).read_text()) if a.cal else json.loads((FIXTURES / "calibration.json").read_text())["audio"]
    targets = [s["target"] for s in json.loads((FIXTURES / "analysis" / f"{a.prompt}.correct.json").read_text())["syllables"]]
    wav = Path(a.wav).read_bytes()
    out = analyze(wav, AnalyzeMeta.model_validate({"promptId": a.prompt, "targets": targets, "calibration": cal}))

    snd = pitch.load(wav)
    times, f0, _ = pitch.tracks(snd, cal["f0"]["lowHz"], cal["f0"]["highHz"])
    print(f"{a.wav}  prompt={a.prompt}  duration={out['durationSec']}s  warnings={out['warnings'] or 'none'}")
    print(f"calibration f0: low {cal['f0']['lowHz']} Hz, median {cal['f0']['medianHz']} Hz, high {cal['f0']['highHz']} Hz")
    for s in out["syllables"]:
        t = s["tone"]
        print(f"\n[{s['index']}] {s['target']['pinyin']}  {s['start']:.2f}-{s['end']:.2f}s  target {t['target']}"
              f"{'  (' + s['target']['sandhiNote'] + ')' if s['target'].get('sandhiNote') else ''}")
        hz = f0[(times >= s["start"]) & (times <= s["end"])]
        print(f"  raw Hz     {fmt(hz)}")
        print(f"  produced   {fmt(t['producedChao'])}   voiced {t['voicedRatio']:.0%}")
        print(f"  target     {fmt(t['targetChao'])}")
        if t["producedChao"]:
            fits = {v: tone.rmse(t["producedChao"], tone.template(v)) for v in tone.ANCHORS}
            print("  fit (rmse) " + "  ".join(f"{v}={r:.2f}{'*' if v == t['nearest'] else ''}" for v, r in sorted(fits.items(), key=lambda x: x[1])))
        print(f"  => score {t['score']}  nearest {t['nearest']}  issues {', '.join(t['issues']) or 'none'}")
        if v := s.get("vowel"):
            print(f"  vowel window {s['vowelStart']:.2f}-{s['vowelEnd']:.2f}s  F1/F2/F3 {v['formants']['F1']}/{v['formants']['F2']}/{v['formants']['F3']}"
                  f"  f2n {v['f2n']}  f3ratio {v['f3ratio']}  => heard {v['heardAs']} (target {v['target']}, confidence {v['confidence']}, glide {v['glide']})")


if __name__ == "__main__":
    main()
