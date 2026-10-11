#!/usr/bin/env python3
"""
Composes the student game's sounds (public/sounds/*.mp3) from the sound of
Ghanaian instruments, as plain synthesis, so they're original to this project
and carry no licence:

  talking drum   a sine with a gliding pitch and a short attack: the "dun"
  gyil           the Ghanaian xylophone: a bright bar tone with its gourd
                 buzz, playing the C major pentatonic scale
  gankogui       the iron double bell that keeps time in highlife and adowa
  shekere        a beaded gourd, a burst of filtered noise

They are Ghanaian-instrument-inspired, not recordings of Ghanaian musicians:
swap in real recordings (same file names) whenever you have them.

Needs python3, numpy and ffmpeg.   python3 scripts/make-game-sounds.py
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
rng = np.random.default_rng(7)
OUT = Path(__file__).resolve().parent.parent / "public" / "sounds"

# C major pentatonic (the scale the gyil is played in here), in Hz.
NOTE = {"C5": 523.25, "D5": 587.33, "E5": 659.25, "G5": 783.99, "A5": 880.0, "C6": 1046.5, "D6": 1174.66, "E6": 1318.51, "G6": 1567.98}


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def decay(t, tau, attack=0.003):
    return np.minimum(t / attack, 1.0) * np.exp(-t / tau)


def highpass(x, strength=0.97):
    y = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):  # one-pole high-pass: the "shh" of a shaker
        prev_y = strength * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def gyil(freq, dur=0.9, vel=1.0):
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * freq * t) * decay(t, 0.30)
    tone += 0.45 * np.sin(2 * np.pi * freq * 3.0 * t) * decay(t, 0.09)  # the bar's bright overtone
    tone += 0.18 * np.sin(2 * np.pi * freq * 5.9 * t) * decay(t, 0.04)
    buzz = highpass(rng.standard_normal(t.size), 0.92) * decay(t, 0.16) * 0.09  # the gourds' mirliton buzz
    buzz *= 0.6 + 0.4 * np.sin(2 * np.pi * 95 * t)
    return vel * (tone + buzz) * 0.5


def drum(f_start, f_end, dur=0.4, vel=1.0, tau=0.13):
    t = t_axis(dur)
    glide = f_end + (f_start - f_end) * np.exp(-t / 0.05)  # the squeezed head: pitch bends as it rings
    phase = 2 * np.pi * np.cumsum(glide) / SR
    body = np.sin(phase) + 0.35 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)
    slap = highpass(rng.standard_normal(t.size), 0.9) * decay(t, 0.012) * 0.35
    return vel * (body * decay(t, tau, 0.002) + slap) * 0.7


def bell(freq, dur=0.35, vel=1.0):
    t = t_axis(dur)
    out = np.zeros(t.size)
    for ratio, amp, tau in ((1.0, 1.0, 0.11), (2.76, 0.55, 0.06), (5.4, 0.3, 0.035), (8.93, 0.16, 0.02)):
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * decay(t, tau, 0.001)
    return vel * out * 0.4


def shaker(dur=0.12, vel=1.0):
    t = t_axis(dur)
    return vel * highpass(rng.standard_normal(t.size), 0.88) * decay(t, 0.035, 0.004) * 0.22


def mix(events, total):
    out = np.zeros(int(total * SR))
    for at, sound in events:
        i = int(at * SR)
        n = min(sound.size, out.size - i)
        if n > 0:
            out[i:i + n] += sound[:n]
    return out


def finish(x, name):
    x = x / max(1e-9, np.abs(x).max()) * 0.72  # about -3 dBFS
    fade = int(0.012 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)
    pcm = (x * 32767).astype("<i2").tobytes()
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", "64k", str(OUT / f"{name}.mp3")],
        input=pcm, check=True,
    )
    print(f"{name}.mp3  {x.size / SR:.2f}s")


P = 0.105  # one pulse of the 12-pulse bell cycle
BELL_PATTERN = (0, 2, 4, 5, 7, 9, 11)  # the standard 12/8 bell pattern: x . x . x x . x . x . x

# tap: one talking-drum "dun".
finish(mix([(0, drum(340, 250, 0.3, 0.9, 0.11))], 0.3), "tap")

# star: a quick rising gyil figure up the pentatonic scale, ending on a long bright note.
finish(mix([(0.00, gyil(NOTE["E5"], 0.5, 0.8)), (0.07, gyil(NOTE["G5"], 0.5, 0.85)), (0.14, gyil(NOTE["A5"], 0.5, 0.9)),
            (0.21, gyil(NOTE["C6"], 0.6, 1.0)), (0.30, gyil(NOTE["E6"], 0.9, 1.0)), (0.0, shaker(0.1, 0.5))], 1.2), "star")

# mission: one highlife phrase. Bell cycle underneath, gyil melody on top, drum on the one and the seventh pulse.
melody = {0: "G5", 2: "A5", 3: "C6", 5: "A5", 6: "G5", 8: "E5", 9: "G5", 11: "C6"}
ev = [(i * P, bell(1180 if k % 3 else 1420, 0.3, 0.8)) for k, i in enumerate(BELL_PATTERN)]
ev += [(i * P, gyil(NOTE[n], 0.7, 0.9)) for i, n in melody.items()]
ev += [(0, drum(220, 160, 0.4, 1.0)), (6 * P, drum(260, 190, 0.35, 0.8))]
ev += [(i * P, shaker(0.1, 0.7)) for i in range(0, 12, 2)]
finish(mix(ev, 12 * P + 0.7), "mission")

# quest: two phrases, the second climbing to a ringing chord with a drum roll.
m1 = {0: "G5", 2: "A5", 3: "C6", 5: "A5", 6: "G5", 8: "E5", 9: "G5", 11: "A5"}
m2 = {12: "C6", 14: "A5", 15: "G5", 17: "A5", 18: "C6", 20: "D6", 22: "E6"}
ev = [(c * 12 * P + i * P, bell(1180 if k % 3 else 1420, 0.3, 0.8)) for c in (0, 1) for k, i in enumerate(BELL_PATTERN)]
ev += [(i * P, gyil(NOTE[n], 0.7, 0.9)) for i, n in {**m1, **m2}.items()]
ev += [(0, drum(220, 160, 0.4, 1.0)), (6 * P, drum(260, 190, 0.35, 0.8)), (12 * P, drum(220, 160, 0.4, 1.0)), (18 * P, drum(260, 190, 0.35, 0.8))]
ev += [((20 + k) * P, drum(200 + 40 * k, 150 + 30 * k, 0.25, 0.7 + 0.1 * k)) for k in range(4)]
ev += [(i * P, shaker(0.1, 0.7)) for i in range(0, 24, 2)]
ev += [(24 * P, gyil(NOTE[n], 1.4, 1.0)) for n in ("C6", "E6", "G6")] + [(24 * P, bell(1420, 0.5, 1.0)), (24 * P, drum(180, 130, 0.6, 1.1, 0.2))]
finish(mix(ev, 24 * P + 1.4), "quest")
