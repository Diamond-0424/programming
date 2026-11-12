// Node CPU 計算基準，包含 JS/Wasm 資料交換；不代表瀏覽器繪圖 FPS。
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const source=fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8');
async function run(core){
  const c=vm.createContext({Math,performance,drifterCore:core});
  vm.runInContext(source+`;globalThis.bench=()=>{
    let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const e=new Ecosystem(foodItems,random),template=generate4DBody(),timings={};
    for(const name of ['resolveCollisions','updateFragments','move']){
      const fn=e[name];e[name]=function(...args){const start=performance.now();const result=fn.apply(this,args);timings[name]=(timings[name]||0)+performance.now()-start;return result;};
    }
    const start=performance.now();
    for(let i=0;i<900;i++){
      const time=i/60,shape=sample4DBody(template,time);
      const meshes=[globalThis.drifterCore?globalThis.drifterCore.geometry(PARAMS,time,1,0,'projection'):project4DTo3D(shape)];
      const posed=hunterCollisionMeshes(meshes,breathingAt(time),hunterPose(e.hunter),time,e.hunter);
      e.update(1/60,true,time,posed);
      if(i%180===0){const prey=e.prey.find(p=>p.alive);if(prey)e.shatter(prey,{first:prey.position.slice()},true);}
      for(const p of e.prey)if(p.alive)smallCreaturePoints(p,time);
    }
    return {milliseconds:performance.now()-start,sections:timings,captures:e.captures};
  };`,c);
  c.bench();return c.bench();
}
(async()=>{
  const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(__dirname,'../rust-core/drifter_core.wasm')));
  const core=require('../rust-core/bridge.js')(instance.exports);
  const js=await run(null),rust=await run(core);
  console.log(JSON.stringify({frames:900,environment:process.version,javascript:js,rust,ratio:js.milliseconds/rust.milliseconds},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
