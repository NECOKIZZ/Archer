"""Procedural score + sound design for the Kickoff film (deterministic, no samples).

120 BPM (one bar = 2 s), A minor. Writes build/music.wav (music only) and build/sfx.wav (effects only);
mix.sh combines and loudness-normalises them.
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, math

SR = 48000
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(1234)
t_all = np.arange(N) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def env_adsr(n, a, d, s, r, hold):
    e = np.zeros(n)
    A, D, H, Rl = int(a * SR), int(d * SR), int(hold * SR), int(r * SR)
    i = 0
    seg = min(A, n); e[:seg] = np.linspace(0, 1, seg, endpoint=False); i = seg
    seg = min(D, n - i); e[i:i + seg] = np.linspace(1, s, seg, endpoint=False); i += seg
    seg = min(max(H - A - D, 0), n - i); e[i:i + seg] = s; i += seg
    seg = min(Rl, n - i); e[i:i + seg] = np.linspace(s, 0, seg); i += seg
    return e


def add(buf, start, sig, gain=1.0, pan=0.0):
    s = int(start * SR)
    if s >= N: return
    sig = sig[: N - s]
    l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    buf[0, s:s + len(sig)] += sig * gain * l * 1.414
    buf[1, s:s + len(sig)] += sig * gain * r * 1.414


def saw(f, n, phase=0.0):
    tt = np.arange(n) / SR
    return 2 * ((tt * f + phase) % 1.0) - 1


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def reverb(x, secs=3.2, mix=0.3, seed=7):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    decay = np.exp(-np.linspace(0, 7, n))
    out = np.zeros_like(x)
    for ch in range(2):
        ir = r.standard_normal(n) * decay
        ir = lp(ir, 6000)
        ir /= np.sqrt((ir ** 2).sum())
        out[ch] = fftconvolve(x[ch], ir)[: x.shape[1]]
    return x * (1 - mix) + out * mix


# Section intensity curves (0..1) as functions of time
def curve(points):
    xs, ys = zip(*points)
    return np.interp(t_all, xs, ys)


drums_on = curve([(0, 0), (12.95, 0), (13.0, 1), (41.9, 1), (42.0, 0), (45.9, 0), (46.0, 1), (56.7, 1), (56.8, 0), (60, 0)])
hats_on = curve([(0, 0), (13, 0), (13.01, 0.7), (25, 0.9), (41.9, 1), (42, 0), (46, 0), (46.01, 1), (56.7, 1), (56.8, 0), (60, 0)])
bass_on = curve([(0, 0.0), (4, 0.25), (9.5, 0.3), (9.6, 0.6), (13, 1), (41.9, 1), (42, 0.35), (46, 1), (56.7, 1), (56.8, 0.7), (60, 0)])
pad_lvl = curve([(0, 0.8), (4, 0.6), (9.6, 0.9), (13, 0.65), (42, 0.95), (46, 0.65), (56.8, 1.0), (59, 0.8), (60, 0)])
arp_on = curve([(0, 0), (9.6, 0), (9.7, 0.6), (13, 0.85), (42, 0.7), (46, 1), (56.7, 1), (56.8, 0.6), (59.5, 0.3), (60, 0)])

music = np.zeros((2, N))

# Chords: Am(add9) | Fmaj7 | Cmaj7/G | Em7, two bars each (4 s)
chords = [[57, 60, 64, 71], [53, 57, 60, 64], [55, 59, 64, 67], [52, 55, 59, 62]]
roots = [45, 41, 43, 40]

# Pad: detuned saws, slow filter, long crossfades
pad = np.zeros((2, N))
for ci in range(15):
    t0 = ci * 4.0
    n = int(4.6 * SR)
    ch = chords[ci % 4]
    sig_l = np.zeros(n); sig_r = np.zeros(n)
    for k, m in enumerate(ch):
        f = midi(m)
        sig_l += saw(f * 0.998, n, 0.1 * k) + 0.5 * saw(f * 1.004, n, 0.37 * k)
        sig_r += saw(f * 1.002, n, 0.23 * k) + 0.5 * saw(f * 0.996, n, 0.61 * k)
    e = env_adsr(n, 0.6, 0.5, 0.85, 0.6, 4.0)
    s0 = int(t0 * SR); s1 = min(N, s0 + n)
    pad[0, s0:s1] += (sig_l * e)[: s1 - s0]
    pad[1, s0:s1] += (sig_r * e)[: s1 - s0]
cut = 700 + 900 * (0.5 + 0.5 * np.sin(2 * np.pi * t_all / 8))
pad = np.stack([lp(lp(pad[c], 1400), 900) for c in range(2)])
music += pad * pad_lvl * 0.05

# Sub drone + bass: eighth-note pulse on the chord root, sidechained to the kick
bass = np.zeros(N)
for step in range(int(DUR * 4)):  # eighths at 120 BPM = 0.25 s
    t0 = step * 0.25
    root = roots[int(t0 // 4) % 4]
    n = int(0.24 * SR)
    f = midi(root - 12 if step % 2 == 0 else root)
    sig = saw(f, n) * 0.6 + np.sin(2 * np.pi * midi(root - 12) * np.arange(n) / SR) * 0.8
    sig *= env_adsr(n, 0.004, 0.08, 0.6, 0.05, 0.2)
    s0 = int(t0 * SR)
    bass[s0:s0 + n] += sig[: N - s0]
bass = lp(bass, 420, 4)
beat_phase = (t_all % 0.5) / 0.5
duck = 1 - 0.75 * np.exp(-beat_phase * 9) * drums_on
music += np.stack([bass, bass]) * bass_on * duck * 0.22

# Kick (four on the floor)
def kick():
    n = int(0.45 * SR); tt = np.arange(n) / SR
    f = 45 + 95 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt * 7.5) + 0.15 * hp(rng.standard_normal(n), 3000) * np.exp(-tt * 180)

K = kick()
for b in range(int(DUR * 2)):
    tb = b * 0.5
    g = drums_on[min(N - 1, int(tb * SR) + 10)]
    if g > 0: add(music, tb, K, 0.5 * g)

# Hats: off-beat closed hats + 16th ghosts, a clap on 2 and 4
for s in range(int(DUR * 8)):
    ts = s * 0.125
    g = hats_on[min(N - 1, int(ts * SR) + 10)]
    if g <= 0: continue
    n = int(0.06 * SR); tt = np.arange(n) / SR
    hat = hp(rng.standard_normal(n), 7500) * np.exp(-tt * (60 if s % 4 == 2 else 140))
    add(music, ts, hat, (0.09 if s % 4 == 2 else 0.035) * g, pan=0.25 if s % 2 else -0.2)
    if s % 8 == 4:
        n = int(0.25 * SR); tt = np.arange(n) / SR
        clap = bp(rng.standard_normal(n), 900, 5000) * np.exp(-tt * 22)
        add(music, ts, clap, 0.06 * g)

# Arp: A-minor pluck pattern on 16ths, slightly swung, ping-pong panned
scale = [69, 72, 76, 79, 81, 76, 72, 74]
for s in range(int(DUR * 8)):
    ts = s * 0.125 + (0.012 if s % 2 else 0)
    g = arp_on[min(N - 1, int(ts * SR) + 10)]
    if g <= 0: continue
    ci = int(ts // 4) % 4
    shift = [0, -4, -2, -5][ci]
    m = scale[(s * 3) % 8] + shift
    n = int(0.3 * SR); tt = np.arange(n) / SR
    pl = (saw(midi(m), n) * 0.5 + np.sin(2 * np.pi * midi(m) * tt)) * np.exp(-tt * 16)
    pl = lp(pl, 2600)
    add(music, ts, pl, 0.05 * g * (1.0 if s % 4 == 0 else 0.7), pan=0.45 if s % 2 else -0.45)

# Risers and impacts (musical)
def riser(dur, f0=300, f1=6000):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); blk = 2048
    for i in range(0, n, blk):
        u = i / n; f = f0 * (f1 / f0) ** u
        seg = x[max(0, i - 256):i + blk]
        y = bp(seg, f * 0.7, min(f * 1.4, 20000))[-len(x[i:i + blk]):]
        out[i:i + blk] = y
    return out * np.linspace(0, 1, n) ** 2

def impact():
    n = int(2.5 * SR); tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-tt * 6)) * tt) * np.exp(-tt * 2.2)
    air = lp(rng.standard_normal(n), 2500) * np.exp(-tt * 3.5) * 0.4
    return boom + air

add(music, 8.0, riser(1.6), 0.18)
add(music, 9.6, impact(), 0.42)
add(music, 11.6, riser(1.4, 200, 4000), 0.12)
add(music, 12.98, impact(), 0.3)
add(music, 54.8, riser(2.0), 0.16)
add(music, 56.8, impact(), 0.5)

music = reverb(music, 3.0, 0.22)
# final fade
fade = np.clip((60.0 - t_all) / 1.2, 0, 1) ** 1.5
music *= fade

# ─────────────── SFX (sparse, soft) ───────────────
sfx = np.zeros((2, N))

def whoosh(dur=0.5, lo=400, hi=3500):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    e = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 2
    return bp(x, lo, hi) * e

def tick(f=2200, dur=0.05):
    n = int(dur * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 90) + 0.3 * np.sin(2 * np.pi * f * 1.5 * tt) * np.exp(-tt * 140)

def blip(f=880, dur=0.25):
    n = int(dur * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 14)

def chime(fs=(1318.5, 1975.5, 2637.0), dur=1.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * (3 + i)) / (i + 1) for i, f in enumerate(fs))

for tw, g, pan in [(2.95, 0.10, 0), (6.2, 0.09, 0), (12.3, 0.12, 0), (18.3, 0.11, 0.2), (24.5, 0.1, -0.3), (30.75, 0.08, 0),
                   (34.5, 0.07, 0), (37.45, 0.08, 0), (38.85, 0.12, 0.3), (41.6, 0.08, -0.2), (45.6, 0.08, 0), (50.2, 0.08, 0),
                   (54.2, 0.09, 0)]:
    add(sfx, tw, whoosh(0.55), g, pan)

def goal_time(m):
    p = m / 90.0
    return 25.35 + 4.65 * math.acos(1 - 2 * p) / math.pi

ui = [(14.0, tick(2000), 0.10), (20.85, tick(2400), 0.07), (23.0, blip(1046.5), 0.08), (24.2, tick(1500, 0.08), 0.1),
      (30.05, blip(784), 0.06), (33.0, chime((2093, 2637), 0.8), 0.03), (43.7, chime(), 0.07), (57.55, blip(1318.5, 0.4), 0.06)]
for m in (23, 51, 74):
    ui.append((goal_time(m), blip(659.3 if m != 51 else 523.3, 0.35), 0.06))
for i in range(10):
    ui.append((46.75 + i * 0.3 + 0.6, tick(2600 + 80 * i, 0.04), 0.035))
for i in range(3):
    ui.append((52.75 + i * 0.38, tick(1800, 0.05), 0.05))
for tt0, sig, g in ui:
    add(sfx, tt0, sig, g)
# soft typing
for k in range(60):
    tk = 51.0 + k * (1.7 / 60)
    add(sfx, tk, hp(rng.standard_normal(int(0.02 * SR)), 2500) * np.exp(-np.arange(int(0.02 * SR)) / SR * 200), 0.012, pan=0.1)

sfx = reverb(sfx, 1.2, 0.18, seed=3)

def write(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x.T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

peak = max(np.abs(music).max(), np.abs(music + sfx).max())
write('build/music.wav', music / peak * 0.5)
write('build/sfx.wav', sfx / peak * 0.5)
print('ok', peak)
