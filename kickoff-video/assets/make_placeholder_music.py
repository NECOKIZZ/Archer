"""Synthesize a 60 s, 120 BPM placeholder bed for the Kickoff spot.

The brief's assets/music.mp3 was not supplied, so this writes a deterministic
stand-in whose impacts sit on the storyboard's scene changes. Replace
assets/music.mp3 with the real track, rerun `npx hyperframes beats`, and
update the beat list at the top of compositions/video.html.

    python3 assets/make_placeholder_music.py && \
    ffmpeg -y -i assets/music.wav -codec:a libmp3lame -b:a 192k assets/music.mp3
"""

import wave

import numpy as np

SR = 44100
DUR = 60.0
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
out = np.zeros((N, 2))
rng = np.random.default_rng(7)  # fixed seed: same file every run
NOISE = rng.uniform(-1, 1, SR * 3)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    out[i : i + len(sig), 0] += sig * gain * (1 - max(0, pan))
    out[i : i + len(sig), 1] += sig * gain * (1 + min(0, pan))


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def kick(strength=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.002, 0.16) * strength


def clap():
    n = int(0.25 * SR)
    s = NOISE[:n] - np.concatenate([[0], NOISE[: n - 1]])
    return s * env(n, 0.001, 0.07) * 0.35


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    s = NOISE[1000 : 1000 + n] - NOISE[999 : 999 + n]
    return s * env(n, 0.0005, 0.06 if open_ else 0.015) * 0.18


def impact():
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 9)) / SR) * env(n, 0.002, 0.5)
    crash = (NOISE[: n % len(NOISE)] if n <= len(NOISE) else np.resize(NOISE, n))
    crash = (crash - np.roll(crash, 1)) * env(n, 0.001, 0.55) * 0.25
    return boom * 0.9 + crash


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = np.resize(NOISE, n) - np.roll(np.resize(NOISE, n), 1)
    return s * (t / length) ** 2 * 0.22


def pluck(freq, length, bright=6):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, bright))
    return s * env(n, 0.004, length * 0.45)


def pad(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.004 * t) for f in freqs)
    a = np.minimum(1, t / 0.4) * np.minimum(1, (length - t) / 0.4)
    return s * a * 0.05


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


# Am - F - C - G, one chord per bar (2 s)
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]
ROOTS = [45, 41, 48, 43]

# Scene changes and key hits from the storyboard get a boom + crash.
IMPACTS = [0.5, 1.5, 3.0, 5.0, 11.0, 13.0, 15.0, 17.0, 21.0, 26.0, 31.0, 36.0, 43.0, 47.0, 50.0, 54.0]
RISERS = [(19.0, 2.0), (52.0, 2.0), (9.5, 1.5), (34.5, 1.5), (41.5, 1.5), (24.5, 1.5)]

nbeats = int(DUR / BEAT)
for b in range(nbeats):
    t = b * BEAT
    if t >= 56.0:
        break
    intro = t < 5.0
    add(kick(1.0 if b % 4 == 0 else 0.85), t, 0.9)
    if not intro and b % 2 == 1:
        add(clap(), t, 1.0)
    if not intro:
        add(hat(), t + BEAT / 2, 1.0, pan=0.3)
        if b % 4 == 3:
            add(hat(True), t + BEAT / 2, 0.8, pan=-0.3)

for bar in range(int(DUR / 2)):
    t = bar * 2.0
    if t >= 58:
        break
    c = CHORDS[bar % 4]
    add(pad([midi(m) for m in c], 2.05), t, 1.0)
    if t >= 5.0 and t < 56:
        r = midi(ROOTS[bar % 4] - 12)
        for e in range(8):  # eighth-note bass
            add(pluck(r * (2 if e in (3, 6) else 1), 0.24, 4), t + e * 0.25, 0.22)
    if t >= 11.0 and t < 54:  # arp lead from scene 3 on
        for s in range(16):
            m = c[s % 3] + 12 + (12 if s % 8 == 7 else 0)
            add(pluck(midi(m), 0.12, 3), t + s * 0.125, 0.05, pan=0.4 if s % 2 else -0.4)

for t in IMPACTS:
    add(impact(), t, 0.8)
for t, length in RISERS:
    add(riser(length), t, 1.0)

# master: soft clip, fade out over the last 4 s
out = np.tanh(out * 1.3)
fade = np.ones(N)
fs = int(56 * SR)
fade[fs:] = np.linspace(1, 0, N - fs) ** 1.5
out *= fade[:, None]
out /= np.max(np.abs(out)) * 1.05

pcm = (out * 32767).astype(np.int16)
with wave.open("assets/music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote assets/music.wav")
