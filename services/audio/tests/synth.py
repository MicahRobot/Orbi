"""Synthetic voices for tests: a buzzy source at a given pitch, shaped by formant resonators."""
import io

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

RATE = 16000
UPPER = (3600, 4500)  # fixed F4, F5 so Burg has all five formants to find


def buzz(hz: np.ndarray, formants=None, fade: bool = True) -> np.ndarray:
    """One syllable: pitch per sample, 20 ms fades, optional (F1, F2, F3) vocal tract."""
    n = len(hz)
    phase = 2 * np.pi * np.cumsum(hz) / RATE
    # Harmonics up to Nyquist: Burg needs energy around every formant, or it invents one.
    x = sum(np.sin(k * phase) / k for k in range(1, int(RATE / 2 / hz.max())))
    for f in (*formants, *UPPER) if formants else ():
        r, theta = np.exp(-np.pi * 90 / RATE), 2 * np.pi * f / RATE
        a = [1, -2 * r * np.cos(theta), r * r]
        x = lfilter([sum(a)], a, x)  # Klatt resonator, unity gain at 0 Hz
    if fade:
        x = x * np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.02 * RATE))
    return 0.3 * x / np.abs(x).max()


def wav(*parts: np.ndarray, gap: float = 0.15) -> bytes:
    """Parts separated and surrounded by silence, as 16-bit WAV bytes."""
    pad = np.zeros(int(gap * RATE))
    signal = np.concatenate([pad] + [y for p in parts for y in (p, pad)])
    buf = io.BytesIO()
    wavfile.write(buf, RATE, (signal * 32767).astype(np.int16))
    return buf.getvalue()


def held(formants, hz: float = 130, dur: float = 0.6) -> np.ndarray:
    return buzz(np.full(int(dur * RATE), hz), formants)


def slide(formant_steps, hz: float = 130, dur: float = 0.6) -> np.ndarray:
    """A vowel that moves through formant_steps in equal chunks, like English "you"."""
    n = int(dur * RATE / len(formant_steps))
    x = np.concatenate([buzz(np.full(n, hz), f, fade=False) for f in formant_steps])
    return x * np.minimum(1, np.minimum(np.arange(len(x)), len(x) - np.arange(len(x))) / (0.02 * RATE))
