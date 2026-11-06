import json, sys, subprocess, numpy as np, soundfile as sf, os
from kokoro_onnx import Kokoro
voice=sys.argv[1]; speed=float(sys.argv[2]) if len(sys.argv)>2 else 1.0; outdir=sys.argv[3] if len(sys.argv)>3 else f'audio_{voice}'
os.makedirs(outdir,exist_ok=True)
K=Kokoro('../kokoro/model.onnx','../kokoro/voices.npz')
segs=json.load(open('narration_kokoro.json'))
LEAD,GAP=0.8,0.45; t=LEAD; tl=[]
for s in segs:
    a,sr=K.create(s['text'],voice=voice,speed=speed,lang='en-us')
    sf.write(f"{outdir}/{s['id']}.wav",a,sr)
    d=len(a)/sr; tl.append({'id':s['id'],'start':round(t,3),'dur':round(d,3),'end':round(t+d,3),'text':s['text']}); t+=d+GAP
total=t-GAP+1.0
json.dump({'segments':tl,'total':round(total,3)},open(f'{outdir}/timeline.json','w'),indent=1)
for x in tl: print(f"{x['id']:8s} {x['start']:6.2f} -> {x['end']:6.2f} ({x['dur']:.2f}s)")
print('total',round(total,2))
