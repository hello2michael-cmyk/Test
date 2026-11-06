const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const [,,outDir,wi,wn,fpsS,totalS,oneT]=process.argv;const FPS=+fpsS,TOTAL=+totalS;const N=process.env.MAXF?+process.env.MAXF:Math.round(FPS*TOTAL);
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
p.on('pageerror',e=>console.log('pageerror:',e.message));p.on('console',m=>{if(m.type()==='error')console.log('console:',m.text());});
await p.goto('http://localhost:8765/scene.html');await p.waitForFunction('window.ready===true',{timeout:30000});
fs.mkdirSync(outDir,{recursive:true});
if(oneT!==undefined){ if(oneT==='thumb'){await p.evaluate(()=>window.renderThumb());}else{await p.evaluate(t=>window.renderFrame(t),+oneT);} const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));fs.writeFileSync(path.join(outDir,`one_${oneT}.png`),Buffer.from(d.split(',')[1],'base64'));await b.close();return;}
const t0=Date.now();let n=0;
for(let f=+wi;f<N;f+=+wn){const fp=path.join(outDir,`f_${String(f).padStart(5,'0')}.png`);if(fs.existsSync(fp))continue;
  await p.evaluate(t=>window.renderFrame(t),f/FPS);const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));fs.writeFileSync(fp,Buffer.from(d.split(',')[1],'base64'));n++;
  if(n%50===0)console.log(`worker ${wi}: ${n} frames, ${((Date.now()-t0)/n).toFixed(0)} ms/frame`);}
console.log(`worker ${wi} done: ${n} frames in ${((Date.now()-t0)/1000).toFixed(0)}s`);await b.close();})();
