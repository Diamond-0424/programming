// 固定亂數種子驗證自主行為；不取代瀏覽器視覺檢查。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context=vm.createContext({Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.ExplorerClass=Explorer;',context);
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const traces=[];
for(const seed of [1,42,999]){
  const e=new context.ExplorerClass(seeded(seed)),modes=new Set(),trace=[];
  for(let i=0;i<18000;i++){
    const before=e.pose();e.update(1/60);const pose=e.pose();modes.add(e.mode);
    for(const value of Object.values(pose))assert(Number.isFinite(value));
    assert(Math.abs(pose.x)<=1&&Math.abs(pose.y)<=1,'stay inside movement bounds');
    assert(pose.scale>=.8-1e-8&&pose.scale<=1.16+1e-8,'bounded size');
    assert(Math.hypot(pose.x-before.x,pose.y-before.y)<.02,'no teleport on decisions');
    assert(Math.abs(pose.scale-before.scale)<.01,'smooth size changes');
    if(i%600===0)trace.push([pose.x,pose.y]);
  }
  assert.equal(modes.size,3,'explore, observe and rest are reachable');
  const frozen=JSON.stringify(e);e.update(0);assert.equal(JSON.stringify(e),frozen);
  e.energy=.1;e.mode='explore';e.attention=10;e.update(1/60);assert.equal(e.mode,'rest');
  e.update(100);assert(Number.isFinite(e.x),'long frame is bounded');
  traces.push(JSON.stringify(trace));
}
assert.equal(new Set(traces).size,3,'different seeds produce different routes');
console.log('PASS: 3 seeded five-minute simulations, bounds, continuity, varied choices, low-energy rest, zero-time freeze.');
vm.runInContext(';globalThis.animation={pulseAt,flourishAt,Ecosystem};',context);
const {pulseAt,flourishAt,Ecosystem}=context.animation;
for(const join of [0,.26,.52,1])for(const key of ['stretch','speed']){
  const left=pulseAt(join-1e-5)[key],right=pulseAt(join+1e-5)[key];
  const center=pulseAt(join)[key];
  assert(Math.abs(right-left)<.00004,'pulse remains continuous');
  assert(Math.abs((right-center)-(center-left))<1e-8,'pulse velocity is continuous');
}
assert(Math.abs(pulseAt(.00001).stretch-pulseAt(-.00001).stretch)>.00001,'pulse flows through neutral without a stop');
let previous=0;
for(let i=0;i<=240;i++){
  const pose=flourishAt(2.4-i/100);
  assert(pose.roll>=previous-1e-10,'roll completes forward without reversing');
  previous=pose.roll;
}
assert(Math.abs(previous-2*Math.PI)<1e-10);
for(const timer of [2.4,0])assert(flourishAt(timer).bloom<1e-10,'bloom returns to neutral');
const life=new Ecosystem([],seeded(42));
life.hunter.pulsePhase=.4;
for(const mode of ['hunt','rest','wander']){
  life.hunter.mode=mode;
  const before=life.hunter.pulsePhase;
  life.update(1/60,false);
  assert(life.hunter.pulsePhase>before&&life.hunter.pulsePhase-before<.013,'mode change preserves phase');
}
life.hunter.somersaultTimer=1.1;
let previousTime=life.time+life.hunter.hyperOffset;
for(let i=0;i<180;i++){
  life.update(1/60,false);
  const time=life.time+life.hunter.hyperOffset;
  assert(time>previousTime,'4D rotation never reverses at flourish end');
  previousTime=time;
}
// 接連捕捉不應重播正在進行的翻滾。
vm.runInContext(`
  const collisionLife=new Ecosystem(foodItems,()=>.5);
  collisionLife.hunter.somersaultTimer=1.1;
  collisionLife.shatter(collisionLife.prey[0],{first:[100,0,0]});
  if(collisionLife.hunter.somersaultTimer!==1.1)throw new Error('roll restarted');
`,context);
console.log('PASS: eased pulse joins, continuous phase, forward roll, neutral bloom, no collision restart.');
vm.runInContext(';globalThis.settleMotion=settleMotion;',context);
// 同樣經過一秒，30/60/120 FPS 應到達相同姿態與速度。
const results=[30,60,120].map(fps=>{
  const state={scale:1};
  for(let i=0;i<fps;i++)context.settleMotion(state,'scale',1.12,1/fps);
  return state;
});
for(const state of results){
  assert(Math.abs(state.scale-results[0].scale)<1e-12);
  assert(Math.abs(state.scaleVelocity-results[0].scaleVelocity)<1e-12);
}
const interrupted={scale:1,scaleVelocity:.15};
context.settleMotion(interrupted,'scale',.94,1e-6);
assert(interrupted.scale>1,'new target preserves existing outward momentum');
assert(Math.abs(interrupted.scaleVelocity-.15)<1e-5,'no velocity reset at interruption');
const motionLife=new Ecosystem([],seeded(27));
for(let i=0;i<1200;i++){
  if(i%90===0)motionLife.hunter.energy=.1;
  const before={...motionLife.hunter.motion};
  motionLife.update(1/60,false,i*.02);
  const after=motionLife.hunter.motion;
  for(const key of ['scale','tilt','turn','drive']){
    assert(Number.isFinite(after[key]));
    assert(Math.abs(after[key]-before[key])<.02,'pose stays continuous across decisions');
  }
  assert(Math.abs(Math.hypot(...after.axis)-1)<1e-10,'stretch axis stays normalized');
}
console.log('PASS: frame-rate independent pose, interrupted momentum, locomotion pose continuity.');
