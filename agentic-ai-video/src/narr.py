import json, wave, numpy as np
TL=json.load(open('timeline.json')); SR=None; out=None
for s in TL['segments']:
    w=wave.open(f"audio/{s['id']}.wav"); sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
    if out is None: SR=sr; out=np.zeros(int(SR*TL['total']))
    i=int(s['start']*SR); n=min(len(a),len(out)-i); out[i:i+n]+=a[:n]
with wave.open('narration.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.astype('<i2').tobytes())
print('narration.wav', SR)
