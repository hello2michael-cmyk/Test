import json, subprocess, os, sys
segs = json.load(open('narration.json'))
LEAD, GAP = 0.8, 0.45
t = LEAD; timeline = []
for s in segs:
    wav = f"audio/{s['id']}.wav"
    subprocess.run(['flite','-voice','slt','--setf','duration_stretch=0.96','-t',s['text'],'-o',wav], check=True)
    d = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',wav]).decode())
    timeline.append({'id':s['id'],'start':round(t,3),'dur':round(d,3),'end':round(t+d,3),'text':s['text']})
    t += d + GAP
total = t - GAP + 1.0
json.dump({'segments':timeline,'total':round(total,3)}, open('timeline.json','w'), indent=1)
for x in timeline: print(f"{x['id']:8s} {x['start']:6.2f} -> {x['end']:6.2f}  ({x['dur']:.2f}s)")
print('total', round(total,2))
