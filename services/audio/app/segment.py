"""Split a recording into N syllables from voicing and loudness (SPEC.md Module A, Segmentation).
Works on frame indices of the 10 ms tracks from pitch.py."""
import numpy as np

MIN_FRAMES = 6   # 60 ms: shorter runs are dropped, shorter gaps are merged
SPEECH_DB = 25   # speech = within 25 dB of the loudest frame
DIP_DB = 3       # a split point must be this far below the loudness peaks on both sides


def voiced_runs(f0: np.ndarray, db: np.ndarray) -> list[tuple[int, int]]:
    """Runs [start, end) of frames that are voiced and loud enough to be speech."""
    mask = ~np.isnan(f0) & (db >= np.nanmax(db) - SPEECH_DB)
    edges = np.flatnonzero(np.diff(np.concatenate(([0], mask.astype(int), [0]))))
    runs = list(zip(edges[::2], edges[1::2]))
    merged: list[tuple[int, int]] = []
    for s, e in runs:
        if merged and s - merged[-1][1] < MIN_FRAMES:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return [(int(s), int(e)) for s, e in merged if e - s >= MIN_FRAMES]


def _split(run: tuple[int, int], db: np.ndarray):
    """Split at the deepest loudness dip, or None if no dip is 3 dB below both sides."""
    s, e = run
    best, best_depth = None, DIP_DB
    for i in range(s + MIN_FRAMES, e - MIN_FRAMES):
        depth = min(db[s:i].max(), db[i + 1:e].max()) - db[i]
        if depth >= best_depth:
            best, best_depth = i, depth
    return None if best is None else [(s, best), (best, e)]


def match_count(runs: list[tuple[int, int]], db: np.ndarray, n: int):
    """Split or merge runs until there are n. Returns (runs, ok)."""
    runs = sorted(runs)
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = int(np.argmin(gaps))
        runs[i:i + 2] = [(runs[i][0], runs[i + 1][1])]
    while len(runs) < n:
        for run in sorted(runs, key=lambda r: r[0] - r[1]):  # longest first
            halves = _split(run, db)
            if halves:
                runs = sorted([r for r in runs if r != run] + halves)
                break
        else:
            return runs, False
    return runs, True


def segment(f0: np.ndarray, db: np.ndarray, n: int):
    """n syllables as frame runs [start, end), plus warnings.
    shortcut: when the count can't be matched, the voiced span (or the whole take) is cut into n equal parts;
    good enough to still show a pitch curve, revisit if real takes hit this often."""
    runs = voiced_runs(f0, db) if np.isfinite(db).any() else []
    runs, ok = match_count(runs, db, n) if runs else ([], False)
    if ok:
        return runs, []
    s, e = (runs[0][0], runs[-1][1]) if runs else (0, len(f0))
    cuts = np.linspace(s, e, n + 1).round().astype(int)
    return [(int(a), int(b)) for a, b in zip(cuts, cuts[1:])], ["syllable_count_mismatch"]


def vowel_window(start: float, end: float, vowel_focus: bool) -> tuple[float, float]:
    """Drop the onset consonant (first 30%) and the tail (last 15%); vowel syllables use the central 40%."""
    lo, hi = (0.3, 0.7) if vowel_focus else (0.3, 0.85)
    d = end - start
    return start + lo * d, start + hi * d
