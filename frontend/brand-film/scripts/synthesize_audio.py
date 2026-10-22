"""Original deterministic Skivu preview score and foley. No external samples/services."""
from pathlib import Path
import json, wave
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/audio'
OUT.mkdir(parents=True,exist_ok=True)
SR=48000
rng=np.random.default_rng(20261022)
metrics={}

def write(name,x,peak=None):
    x=np.asarray(x,dtype=np.float64)
    if x.ndim==1:x=np.column_stack([x,x])
    if peak is not None:x*=peak/max(np.max(np.abs(x)),1e-9)
    assert np.isfinite(x).all() and np.max(np.abs(x))<1
    with wave.open(str(OUT/name),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR)
        f.writeframes((x*32767).astype('<i2').tobytes())
    metrics[name]={'seconds':round(len(x)/SR,4),'peak_dbfs':round(20*np.log10(max(np.max(np.abs(x)),1e-12)),2),'rms_dbfs':round(20*np.log10(max(np.sqrt(np.mean(x*x)),1e-12)),2),'first_sample':x[0].tolist(),'last_sample':x[-1].tolist()}
    return x

def env(t,d,a=.04,r=.6):return np.minimum(1,t/a)*np.clip((d-t)/r,0,1)
def stereo(x,pan=0):return np.column_stack([x*np.sqrt((1-pan)/2),x*np.sqrt((1+pan)/2)])
def add(dst,signal,start):
    i=round(start*SR);n=min(len(signal),len(dst)-i)
    if n>0:dst[i:i+n]+=signal[:n]
def tail(x,delays=(.19,.37,.61),gains=(.23,.13,.07)):
    out=np.zeros((len(x)+int(SR*.9),2));out[:len(x)]+=x
    for d,g in zip(delays,gains):add(out,x[:,::-1]*g,d)
    return out
def bell(freq,d=2,amp=1):
    t=np.arange(int(d*SR))/SR
    x=sum(g*np.sin(2*np.pi*freq*k*t)*np.exp(-t/tau) for k,g,tau in [(1,1,.8),(2.003,.26,.48),(3.97,.09,.22)])
    return x*env(t,d,.012,.45)*amp

# A sparse 80 BPM original cue: quiet ignition, three expanding harmonic fields,
# gentle pulse, and a resolving three-note Skivu signature with a four-second tail.
dur=44;t=np.arange(SR*dur)/SR
score=np.zeros((len(t),2))
for start,end,notes in [(0,7,[146.832,220,293.665,440]),(5,14,[146.832,174.614,220,261.626,329.628]),(12,25,[174.614,220,261.626,329.628,391.995]),(23,34,[116.541,174.614,233.082,293.665,349.228]),(32,44,[146.832,184.997,220,293.665,329.628])]:
    d=end-start;tt=np.arange(round(d*SR))/SR
    fade=np.sin(np.pi*np.clip(tt/2.2,0,1)/2)**2*np.sin(np.pi*np.clip((d-tt)/3.1,0,1)/2)**2
    section=np.zeros((len(tt),2))
    for i,f in enumerate(notes):
        for ch,detune in enumerate([-.0009,.0009]):
            a=2*np.pi*f*(1+detune)*tt + .12*np.sin(2*np.pi*.08*tt+i)
            section[:,ch]+=(np.sin(a)+.22*np.sin(a*2)+.08*np.sin(a*3))*(.8+.2*np.sin(tt*.33+i))*.09
    add(score,section*fade[:,None],start)
for i,start in enumerate(np.arange(8,32,.75)):
    freq=[293.665,440,523.251,659.255,440,349.228,587.33,440][i%8]
    amount=.025 if start<12 else .047 if start<23 else .062
    add(score,tail(stereo(bell(freq,1.2,amount),np.sin(i*1.7)*.5)),float(start))
for start in np.arange(12,32,1.5):
    tt=np.arange(int(.75*SR))/SR
    x=np.sin(2*np.pi*(72*tt+12*(1-np.exp(-tt*8))))*np.exp(-tt*6)*env(tt,.75,.03,.2)*.07
    # Mid harmonics preserve the pulse on ordinary phone loudspeakers.
    x+=np.sin(2*np.pi*146.832*tt)*np.exp(-tt*8)*env(tt,.75,.025,.2)*.025
    add(score,stereo(x),float(start))
# The original cue's three-note identity is kept as a separately editable stem.
signature=np.zeros((SR*6,2))
for st,f,a in [(0,293.665,.07),(.75,440,.065),(1.5,659.255,.07)]:
    add(signature,tail(stereo(bell(f,3.5,a)),(.28,.55,.83),(.25,.15,.09)),st)
signature*=np.clip((6-np.arange(SR*6)/SR)/1.2,0,1)[:,None]
write('skivu-signature.wav',signature,.14)
score*=np.minimum(1,t/2.5)[:,None]*np.clip((44-t)/2.5,0,1)[:,None]
write('skivu-space-44s.wav',score,.46)

# Water droplet: a soft descending resonator rather than a harsh click.
d=2.4;tt=np.arange(int(d*SR))/SR
phase=2*np.pi*(480*tt + (1450-480)*.07*(1-np.exp(-tt/.07)))
drop=(np.sin(phase)*np.exp(-tt*5)+.16*np.sin(phase*1.97)*np.exp(-tt*9))*env(tt,d,.005,.4)
write('water-drop.wav',tail(stereo(drop)),.22)
write('glass-touch.wav',tail(stereo(bell(1174.66,.7)),(.08,.16),(.16,.07)),.14)
tt=np.arange(int(1.8*SR))/SR
noise=rng.normal(0,1,len(tt));noise=np.convolve(noise,np.ones(29)/29,'same')
swish=noise*np.sin(np.pi*tt/1.8)**3*.5 + np.sin(2*np.pi*(180*tt+100*tt*tt))*np.sin(np.pi*tt/1.8)**4*.015
write('soft-sweep.wav',stereo(swish,.1),.12)
tt=np.arange(int(2.5*SR))/SR
impact=(np.sin(2*np.pi*73.416*tt)+.3*np.sin(2*np.pi*146.832*tt))*np.exp(-tt*3)*env(tt,2.5,.035,.7)
write('product-arrival.wav',tail(stereo(impact)),.18)

# Exact cyclic harmonics and envelopes for the optional loop audio.
d=10;tt=np.arange(SR*d)/SR
loop=np.zeros((len(tt),2))
for i,f in enumerate([147.,220.,294.,440.,587.]):
    amp=(.6+.4*np.cos(2*np.pi*tt/d+i))*.055
    loop[:,0]+=np.sin(2*np.pi*f*tt+i*.15)*amp
    loop[:,1]+=np.sin(2*np.pi*f*tt-i*.15)*amp
write('orbit-loop-10s.wav',loop,.22)
metrics['source']='Based on our previous 40s original Skivu cue: same chord sequence, pulse and timbres; final chord extended to 44s, brand motif separated. NumPy fixed seed20261022; no third-party recordings or paid service.'
metrics['mix_headroom']='Full mix verification is recorded separately in verification/audio-mix.json.'
(ROOT/'audio-analysis.json').write_text(json.dumps(metrics,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({k:v for k,v in metrics.items() if isinstance(v,dict)},indent=2))
