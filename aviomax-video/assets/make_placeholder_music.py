# Placeholder Afrobeats-style instrumental, 96 BPM, 30 s. Deterministic (seeded noise).
import numpy as np, wave
SR=44100; BPM=96; BEAT=60/BPM; STEP=BEAT/4; DUR=30.0
N=int(SR*DUR); out=np.zeros((N,2))
rng=np.random.default_rng(7)
def env(n,a,d):
    t=np.arange(n)/SR; e=np.exp(-t/d); k=int(a*SR)
    if k>0: e[:k]*=np.linspace(0,1,k)
    return e
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR); j=min(N,i+len(sig))
    if i>=N: return
    s=sig[:j-i]*g; out[i:j,0]+=s*(1-pan)/1; out[i:j,1]+=s*(1+pan)/1
def kick(g=1.0):
    n=int(.45*SR); t=np.arange(n)/SR; f=45+110*np.exp(-t/.04)
    return np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,.002,.16)*g
def clap():
    n=int(.25*SR); x=rng.standard_normal(n); x=np.diff(x,prepend=0)
    e=env(n,.001,.07); 
    for o in (0.010,0.021): k=int(o*SR); e[k:]+=0.6*env(n-k,.0005,.05)
    return x*e*0.35
def shaker(g):
    n=int(.06*SR); x=rng.standard_normal(n); x=np.diff(np.diff(x,prepend=0),prepend=0)
    return x*env(n,.004,.018)*0.08*g
def rim():
    n=int(.08*SR); t=np.arange(n)/SR
    return (np.sin(2*np.pi*820*t)+0.5*np.sin(2*np.pi*1650*t))*env(n,.0005,.02)*0.25
def logdrum(freq,g=1.0):
    n=int(.5*SR); t=np.arange(n)/SR; f=freq*(1+0.6*np.exp(-t/.015))
    ph=2*np.pi*np.cumsum(f)/SR
    return (np.sin(ph)+0.25*np.sin(2*ph))*env(n,.003,.18)*0.55*g
def pluck(freqs,g=1.0):
    n=int(.35*SR); t=np.arange(n)/SR; s=np.zeros(n)
    for f in freqs:
        s+=np.sin(2*np.pi*f*t)+0.3*np.sin(2*np.pi*2*f*t)+0.12*np.sin(2*np.pi*3*f*t)
    return s/len(freqs)*env(n,.004,.12)*0.22*g
def impact():
    n=int(1.6*SR); t=np.arange(n)/SR; f=38+60*np.exp(-t/.08)
    b=np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,.001,.5)
    x=rng.standard_normal(n)*env(n,.001,.25)*0.25
    return (b+x)*0.7
def riser(dur):
    n=int(dur*SR); t=np.arange(n)/SR; x=rng.standard_normal(n)
    x=np.diff(x,prepend=0)*(t/dur)**2*0.12
    return x
m=lambda midi:440*2**((midi-69)/12)
# progression per bar: Am, F, C, G  (roots for log drum, triad for plucks)
prog=[(57,[69,72,76]),(53,[65,69,72]),(48,[67,72,76]),(55,[67,71,74])]
bars=int(DUR/(BEAT*4))+1
for b in range(bars):
    t0=b*BEAT*4; root,tri=prog[b%4]
    intro = b==0
    for s in range(16):
        t=t0+s*STEP
        if t>=DUR: break
        # kick: four on the floor, skipped on bar 0 except downbeat
        if s%4==0: add(kick(1.0 if s in (0,8) else .8),t)
        if s in (4,12) and not intro: add(clap(),t,pan=0.05)
        add(shaker(1.0 if s%2==1 else .55),t,pan=0.35)
        if s in (3,6,10,14): add(rim(),t,pan=-0.3,g=0.8)
        if not intro and s in (0,3,6,10,12): add(logdrum(m(root-12 if s!=10 else root-5)),t)
        if s in (2,6,10,14): add(pluck([m(x) for x in tri]),t,pan=-0.15 if s%4==2 else 0.15)
# impacts on every scene change downbeat (every 2 bars = 5 s)
for tc in (5,10,15,20,25): add(impact(),tc,g=0.9); add(riser(1.2),tc-1.2,pan=0)
add(impact(),0,g=0.6)
# master: gentle saturation, fade out 27.5-30
out=np.tanh(out*1.2)
ts=np.arange(N)/SR; fade=np.clip((30.0-ts)/0.05,0,1); out*=fade[:,None]
out/=np.max(np.abs(out))*1.12
pcm=(out*32767).astype('<i2')
with wave.open("music.wav","wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok")
