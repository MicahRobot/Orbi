import numpy as np

from app import segment


def tracks(spans, n=200, loud=70.0):
    """f0 and dB tracks with voiced, loud frames in each [start, end) span; quiet and unvoiced elsewhere."""
    f0, db = np.full(n, np.nan), np.full(n, loud - 40)
    for s, e in spans:
        f0[s:e], db[s:e] = 150.0, loud
    return f0, db


def test_voiced_runs_merges_short_gaps_and_drops_short_runs():
    f0, db = tracks([(10, 40), (44, 70), (100, 104), (130, 160)])
    assert segment.voiced_runs(f0, db) == [(10, 70), (130, 160)]


def test_quiet_voiced_frames_are_not_speech():
    f0, db = tracks([(10, 40), (100, 140)])
    db[100:140] = 40  # 30 dB below the loudest frame
    assert segment.voiced_runs(f0, db) == [(10, 40)]


def test_exact_count():
    f0, db = tracks([(10, 40), (60, 90)])
    assert segment.segment(f0, db, 2) == ([(10, 40), (60, 90)], [])


def test_too_few_runs_split_at_the_deepest_dip():
    f0, db = tracks([(10, 90)])
    db[48:52] = 64  # 6 dB dip, but no unvoiced gap: syllables run together
    db[50] = 60
    assert segment.segment(f0, db, 2) == ([(10, 50), (50, 90)], [])


def test_too_many_runs_merge_the_closest_pair():
    f0, db = tracks([(10, 30), (50, 70), (78, 100)])
    assert segment.segment(f0, db, 2) == ([(10, 30), (50, 100)], [])


def test_impossible_count_falls_back_to_equal_parts():
    f0, db = tracks([(10, 70)])  # flat loudness: nowhere to split
    assert segment.segment(f0, db, 2) == ([(10, 40), (40, 70)], ["syllable_count_mismatch"])
    f0, db = tracks([])
    runs, warnings = segment.segment(f0, db, 2)
    assert runs == [(0, 100), (100, 200)] and warnings == ["syllable_count_mismatch"]


def test_vowel_window():
    assert segment.vowel_window(1.0, 2.0, False) == (1.3, 1.85)
    assert segment.vowel_window(1.0, 2.0, True) == (1.3, 1.7)
