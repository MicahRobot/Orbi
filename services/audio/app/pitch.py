"""WAV bytes to a Praat Sound and its 10 ms pitch and loudness tracks (SPEC.md Module A steps 1-2)."""
import io

import numpy as np
import parselmouth
from scipy.io import wavfile

STEP = 0.01  # seconds per frame


def load(wav: bytes) -> parselmouth.Sound:
    """Raises ValueError on anything that isn't a readable, non-empty WAV."""
    rate, data = wavfile.read(io.BytesIO(wav))
    if data.ndim > 1:
        data = data.mean(axis=1)
    if data.dtype.kind in "iu":
        data = data / float(np.iinfo(data.dtype).max)
    if len(data) == 0:
        raise ValueError("empty WAV")
    return parselmouth.Sound(data.astype(np.float64), sampling_frequency=rate)


def tracks(snd: parselmouth.Sound, low_hz: float = 75 / 0.7, high_hz: float = 500 / 1.5):
    """(times, f0 in Hz with NaN where unvoiced, intensity in dB) on one 10 ms grid.
    Defaults give Praat's 75-500 Hz range for an uncalibrated voice."""
    pitch = snd.to_pitch_ac(time_step=STEP, pitch_floor=0.7 * low_hz, pitch_ceiling=1.5 * high_hz)
    times = pitch.xs()
    f0 = pitch.selected_array["frequency"].astype(float)
    f0[f0 == 0] = np.nan
    intensity = snd.to_intensity(time_step=STEP)
    db = np.interp(times, intensity.xs(), intensity.values[0])
    return times, f0, db


def warnings(snd: parselmouth.Sound) -> list[str]:
    """Same limits as the browser's pre-send check (SPEC.md Module A, Capture)."""
    x = np.abs(snd.values[0])
    out = []
    if x.max() < 10 ** (-30 / 20):
        out.append("too_quiet")
    if (x >= 0.999).mean() > 0.01:
        out.append("clipped")
    return out
