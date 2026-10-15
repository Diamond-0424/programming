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
