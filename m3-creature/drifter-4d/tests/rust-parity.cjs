const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8');
function close(a,b,label='value'){
  if(typeof a==='number'){assert(Number.isFinite(b)&&Math.abs(a-b)<1e-6*Math.max(1,Math.abs(a)),`${label}: ${a} / ${b}`);return;}
  if(a&&typeof a==='object'){
    assert.equal(Array.isArray(a),Array.isArray(b),label);
    assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),label);
    for(const k of Object.keys(a))close(a[k],b[k],label+'.'+k);
  }else assert.equal(a,b,label);
}
function context(core){
  let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const vertices=[];const c=vm.createContext({Math,random,drifterCore:core,vertices,width:900,height:600,
    ADD:1,BLEND:2,LINES:3,CLOSE:4,TRIANGLES:5,vertex:(...p)=>vertices.push(p)});
  for(const name of ['push','pop','scale','translate','blendMode','noFill','noStroke','fill','stroke','strokeWeight','beginShape','endShape'])c[name]=()=>{};
  vm.runInContext(source+`;body=generate4DBody();observationCamera={eyeX:0,eyeY:-115,eyeZ:440,centerX:0,centerY:0,centerZ:0,upX:0,upY:1,upZ:0};
    globalThis.api={Ecosystem,foodItems,foodMeshes,PARAMS,FX,LIFE,generate4DBody,sample4DBody,project4DTo3D,hunterCollisionMeshes,breathingAt,hunterPose,smallCreaturePoints,ecosystem};
    globalThis.world=new Ecosystem(foodItems,random);
    globalThis.snapshot=()=>JSON.parse(JSON.stringify(world));
  `,c);return c;
}
(async()=>{
  const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(__dirname,'../rust-core/drifter_core.wasm')));
  const core=require('../rust-core/bridge.js')(instance.exports),js=context(null),rs=context(core);
  // 包含新生個體在陣列中段復活的順序，以及已被關籠的獵物。
  for(const c of [js,rs])vm.runInContext(`world.prey[8].alive=false;world.prey[8].respawn=.001;world.prey[12].mode='trapped';`,c);
  for(let frame=0;frame<1200;frame++){
    for(const c of [js,rs]){
      c.frame=frame;
      vm.runInContext(`
        if(frame===30)world.prey[12].mode='wander';
        if(frame===80||frame===300){const p=world.prey.find(p=>p.alive);world.shatter(p,{first:p.position.slice()},frame===80);}
        world.update(1/60,frame<700||frame>750,frame/600);
      `,c);
    }
    if(frame%20===0)close(js.snapshot(),rs.snapshot(),'frame '+frame);
  }
  close(js.snapshot(),rs.snapshot(),'final');
  // 開瓣、不同大小、不同相位的骨架形變逐點對照。
  for(let i=0;i<100;i++){
    const a=js.api,b=rs.api,time=i*.27,h=js.world.hunter;
    h.cage.open=i/100;h.cage.axis=[.6,.8,0];h.motion.axis=[0,1,0];
    const meshes=[a.project4DTo3D(a.sample4DBody(a.generate4DBody(),time))];
    close(a.hunterCollisionMeshes(meshes,a.breathingAt(time),a.hunterPose(h),time,h),b.hunterCollisionMeshes(meshes,a.breathingAt(time),a.hunterPose(h),time,h),'transform');
    for(const p of a.foodItems)close(a.smallCreaturePoints(p,time,.6),b.smallCreaturePoints(p,time,.6),'small mesh');
  }
  // 捕捉實際交給 p5.vertex 的座標：節點、碎片、壓扁、出生與撞擊光圈。
  for(const c of [js,rs])vm.runInContext(`
    ecosystem.random=random;
    ecosystem.shatter(ecosystem.prey[4],{first:[50,10,0]},true);
    ecosystem.emit('birth',[0,0,0],{preyId:2});ecosystem.emit('impact',[20,30,40]);
    for(const effect of ecosystem.effects)effect.age=.1;
    renderCreature([project4DTo3D(sample4DBody(body,1))]);renderLifeEffects(1);
  `,c);
  close(js.vertices,rs.vertices,'render vertices');
  // 迫使線性記憶體擴容，再重跑批次輸入與輸出，檢查失效 view。
  core.rings(Array.from({length:1000},()=>[1,2,3]),Array(1000).fill(2),{right:[1,0,0],up:[0,1,0]},64);
  const agent={position:[0,0,0],velocity:[0,0,0]};core.move(agent,[1,0,0],24,1/60,4,[290,200,210]);assert(agent.position[0]>0);
  console.log(`PASS: 1,200-step world parity, respawn order, capture/release, external/internal fragments, 100 posed meshes, ${js.vertices.length} rendered vertices and memory growth.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
