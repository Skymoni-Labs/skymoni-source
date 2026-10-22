"""Numerical preview-mix inspection only; does not export a movie or final audio."""
from pathlib import Path
import wave, json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SR=48000
def read(name):
    with wave.open(str(ROOT/'public/audio'/name),'rb') as w:
        assert w.getframerate()==SR and w.getnchannels()==2
        return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2)/32768
music=read('skivu-atmosphere-40s.wav')
t=np.arange(len(music))/SR
envelope=np.interp(np.floor(t*30)/30,[0,1.5,37.5,40],[0,.68,.68,0])
mix=music*envelope[:,None]
clips=[('glass-touch.wav',.7,.22),('product-arrival.wav',5.4,.65),
       ('glass-touch.wav',14,.4),('glass-touch.wav',23.5,.35),
       ('glass-touch.wav',27.4,.3),('glass-touch.wav',29.6,.35),
       ('soft-sweep.wav',19.1,.42),('soft-sweep.wav',31.8,.4)]
for name,start,vol in clips:
    # JS Math.round agrees with floor(x+.5), including half-frame cues.
    start=int(np.floor(start*30+.5))/30
    sound=read(name)*vol
    i=round(start*SR);n=min(len(sound),len(mix)-i)
    mix[i:i+n]+=sound[:n]
# Four meteor activation tones, matching authored frame-rounded starts and release envelopes.
for start,vol in [(5.9,.12),(7.05,.11),(8.2,.11),(9.4,.14)]:
    i=round(np.floor(start*30+.5)/30*SR)
    n=round(1.1*SR)
    sound=read('glass-touch.wav')[:n]*vol
    absolute=(np.floor((np.arange(n)/SR+i/SR)*30)/30)
    release=np.interp(absolute,[start,start+.6,start+1.1],[1,1,0])
    mix[i:i+n]+=sound*release[:,None]
peak=float(np.max(np.abs(mix)))
mono=np.mean(mix,axis=1)
old=read('skivu-atmosphere-40s.wav')
corr=float(np.corrcoef(old[:SR*30,0],music[:SR*30,0])[0,1])
stats={
    'seconds':len(mix)/SR,'sample_rate':SR,'peak_dbfs':round(20*np.log10(peak),3),
    'rms_dbfs':round(20*np.log10(np.sqrt(np.mean(mix*mix))),3),
    'mono_rms_dbfs':round(20*np.log10(np.sqrt(np.mean(mono*mono))),3),
    'clipped_samples':int(np.count_nonzero(np.abs(mix)>=1)),
    'first_10ms_peak':float(np.max(np.abs(mix[:480]))),
    'last_10ms_peak':float(np.max(np.abs(mix[-480:]))),
    'first_30s_correlation_with_previous_cue':round(corr,7),
    'verification_limit':'Numerical sum of the authored tracks. Not a subjective headphone or mobile-speaker listening test.'
}
assert len(mix)==40*SR and peak<1
(ROOT/'verification/galaxy-audio-mix.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print(json.dumps(stats,indent=2))
