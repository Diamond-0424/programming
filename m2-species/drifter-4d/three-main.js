import {ThreeRenderer} from './three-renderer.js';

// 包成非同步函式，才能打包成不需伺服器的單一腳本（three-bundle.js）。
(async()=>{
const host=document.getElementById('canvas-host');
await globalThis.drifterCoreReady;
const renderer=new ThreeRenderer(host);
globalThis.drifterRenderer=renderer;
PARAMS.glowStrength=0;body=generate4DBody();
Object.assign(globalThis,{
  ADD:'add',BLEND:'blend',LINES:'lines',CLOSE:'close',
  push:()=>renderer.push(),pop:()=>renderer.pop(),scale:v=>renderer.scale(v),translate:(...p)=>renderer.translate(...p),
  blendMode:()=>{},noFill:()=>{},fill:()=>{},
  stroke:(r,g,b,a=255)=>{renderer.alpha=a/255;},strokeWeight:w=>{renderer.lineWidth=w;},
  beginShape:mode=>renderer.beginShape(mode),vertex:(...p)=>renderer.vertex(...p),endShape:close=>renderer.endShape(close)
});
function resize(){renderer.resize();globalThis.width=renderer.width;globalThis.height=renderer.height;}
resize();
// resetView is shared by the benchmark and the reset button.
observationCamera={camera:()=>renderer.resetView(),perspective:()=>{}};
const mode=document.getElementById('view-mode');mode.value=viewMode;
mode.onchange=()=>{viewMode=mode.value;updateModeLabels();};updateModeLabels();
const pause=document.getElementById('pause');
pause.onclick=()=>{paused=!paused;pause.textContent=paused?'繼續':'暫停';pause.setAttribute('aria-pressed',String(paused));last=null;};
document.getElementById('reset').onclick=()=>renderer.resetView();
document.getElementById('capture').onclick=()=>renderer.capture();
document.getElementById('loading')?.remove();
renderer.controls.enabled=!drifterExperiment.benchmark;
let last=null,animation,disposed=false;
function frame(now){
  if(disposed)return;
  animation=requestAnimationFrame(frame);
  if(document.hidden){last=null;return;}
  const dt=last===null?0:Math.min((now-last)/1000,.05);last=now;
  const meter=globalThis.drifterBenchmark;
  if(meter&&!meter.begin())return;
  const start=performance.now(),state=updateSimulation(meter?meter.deltaTime:dt),updated=performance.now();
  renderer.begin();
  const c=renderer.camera;
  Object.assign(observationCamera,{eyeX:c.position.x,eyeY:-c.position.y,eyeZ:c.position.z,
    centerX:renderer.controls.target.x,centerY:-renderer.controls.target.y,centerZ:renderer.controls.target.z,upX:0,upY:1,upZ:0});
  renderSimulation(state);renderer.end();
  meter?.end(updated-start,performance.now()-updated);
}
animation=requestAnimationFrame(frame);
addEventListener('resize',resize);
addEventListener('visibilitychange',()=>{last=null;});
addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(animation);removeEventListener('resize',resize);renderer.dispose();},{once:true});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
})();
