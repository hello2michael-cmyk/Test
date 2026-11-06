import numpy as np, json, wave, struct
SR=44100; TL=json.load(open('timeline.json')); TOTAL=TL['total']; N=int(SR*TOTAL)
t=np.arange(N)/SR
BPM=96; beat=60/BPM; bar=beat*4
def note(n): return 440*2**((n-69)/12)
# chords (midi): Am7, Fmaj7, Cmaj7, G6  -> each 2 bars
A,C,E,G,F,B,D=57,60,64,67,53,59,62
chords=[[A-12,A,C+12,E+12,G+12],[F-12,F,A+12,C+12,E+12],[C-12,C,E+12,G+12,B+12],[G-12,G,B+12,D+12,E+12]]
chord_len=2*bar
def env_asr(n,a,r,total):
    e=np.ones(n); na=int(a*SR); nr=int(r*SR)
    e[:na]=np.linspace(0,1,na); e[-nr:]*=np.linspace(1,0,nr); return e
def pad_tone(f,n,phase):
    tt=np.arange(n)/SR; s=np.zeros(n)
    for k,amp in [(1,1),(2,0.45),(3,0.22),(4,0.1),(5,0.05)]:
        for det in (-0.4,0,0.4):
            s+=amp*np.sin(2*np.pi*f*k*(1+det/100)*tt+phase*k)
    return s
mix=np.zeros((N,2))
# ---- pad ----
i=0; tc=0.0
while tc<TOTAL:
    ch=chords[i%4]; n=min(int((chord_len+1.0)*SR), N-int(tc*SR))
    seg=np.zeros(n)
    for j,m in enumerate(ch[1:]):
        seg+=pad_tone(note(m),n,j*1.3)
    seg*=env_asr(n,1.4,1.4,n)
    s0=int(tc*SR); mix[s0:s0+n,0]+=seg*0.055; mix[s0:s0+n,1]+=seg*0.055
    # bass
    nb=n; tt=np.arange(nb)/SR; bass=(np.sin(2*np.pi*note(ch[0])*tt)+0.3*np.sin(2*np.pi*note(ch[0])*2*tt))*env_asr(nb,0.8,1.2,nb)
    mix[s0:s0+n,0]+=bass*0.16; mix[s0:s0+n,1]+=bass*0.16
    tc+=chord_len; i+=1
# slow LFO movement on pad
lfo=0.85+0.15*np.sin(2*np.pi*0.11*t); mix*=lfo[:,None]
# ---- arp (8th notes) ----
step=beat/2; k=0; tt_a=0.0
arp_buf=np.zeros((N,2))
while tt_a<TOTAL-0.5:
    ci=int(tt_a//chord_len)%4; ch=chords[ci][1:]
    m=ch[k%len(ch)]+12*((k//len(ch))%2)
    n=int(0.5*SR); tt=np.arange(n)/SR; f=note(m)
    s=(np.sin(2*np.pi*f*tt)+0.25*np.sin(2*np.pi*f*3*tt))*np.exp(-tt*7)*0.5
    s0=int(tt_a*SR); n=min(n,N-s0); pan=0.5+0.35*np.sin(k*1.1)
    fade=min(1.0,max(0.0,(tt_a-2.0)/4.0))  # arp fades in after 2s
    arp_buf[s0:s0+n,0]+=s[:n]*(1-pan)*fade; arp_buf[s0:s0+n,1]+=s[:n]*pan*fade
    tt_a+=step; k+=1
# dotted-8th delay
d=int(step*3*SR); echo=np.zeros_like(arp_buf); echo[d:]=arp_buf[:-d]*0.38; echo2=np.zeros_like(arp_buf); echo2[2*d:]=arp_buf[:-2*d]*0.16
mix+=(arp_buf+echo[:, ::-1]+echo2)*0.11
# ---- soft kick (beats 1,3) from bar 3 ----
tk=bar*2
while tk<TOTAL-1.5:
    n=int(0.35*SR); tt=np.arange(n)/SR; f=45+80*np.exp(-tt*30); ph=2*np.pi*np.cumsum(f)/SR
    s=np.sin(ph)*np.exp(-tt*9); s0=int(tk*SR); mix[s0:s0+n,:]+=s[:,None]*0.22; tk+=beat*2
# ---- hat (offbeats, very quiet) ----
rng=np.random.default_rng(7); th=bar*2+beat/2
while th<TOTAL-1.5:
    n=int(0.06*SR); s=rng.standard_normal(n)*np.exp(-np.arange(n)/SR*90)
    s=np.diff(np.concatenate([[0],s]))  # crude highpass
    s0=int(th*SR); mix[s0:s0+n,0]+=s*0.035; mix[s0:s0+n,1]+=s*0.03; th+=beat
# ---- whooshes at scene starts ----
starts=[0.0]+[s['start']-0.45 for s in TL['segments'][1:]]
for st in starts:
    if st<=0.1: continue
    n=int(0.9*SR); tt=np.arange(n)/SR; noise=rng.standard_normal(n)
    # band-limit via FFT with sweeping center
    env=np.sin(np.pi*tt/0.9)**2
    sp=np.fft.rfft(noise); fr=np.fft.rfftfreq(n,1/SR); sp*=np.exp(-((np.log(fr+1)-np.log(1800))**2)/0.5); s=np.fft.irfft(sp,n); s/=np.abs(s).max()
    s0=int((st-0.5)*SR); s0=max(0,s0); m=min(n,N-s0); mix[s0:s0+m,:]+=(s*env)[:m,None]*0.12
# ---- master ----
# soft clip and fade in/out
mix=np.tanh(mix*1.6)/1.6
mix[:int(0.5*SR)]*=np.linspace(0,1,int(0.5*SR))[:,None]
mix[-int(1.5*SR):]*=np.linspace(1,0,int(1.5*SR))[:,None]
mix/= (np.abs(mix).max()/0.7)
with wave.open('music.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes())
print('music.wav', TOTAL, 's')
