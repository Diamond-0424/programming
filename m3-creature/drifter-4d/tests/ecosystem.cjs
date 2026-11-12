// 三維追逃與生命週期；固定種子可重現，視覺效果仍需瀏覽器確認。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const c=vm.createContext({Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={Ecosystem,foodItems,LIFE,smallCreaturePoints};',c);
const {Ecosystem,foodItems,LIFE,smallCreaturePoints}=c.api;
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const seed of [1,42,999]){
  const e=new Ecosystem(foodItems,seeded(seed)),modes=new Set(),preyModes=new Set();
  for(let i=0;i<18000;i++){
    const before=e.hunter.position.slice();e.update(1/60,true,i/600);modes.add(e.hunter.mode);
    assert(Math.hypot(...e.hunter.position.map((v,k)=>v-before[k]))<2,'hunter moves continuously');
    for(const a of [e.hunter,...e.prey]){
      assert(a.energy>=0&&a.energy<=1);
      a.position.forEach((v,k)=>assert(Number.isFinite(v)&&Math.abs(v)<=LIFE.bounds[k]+1e-6));
      assert(a.velocity.every(Number.isFinite));
    }
    e.prey.forEach(p=>preyModes.add(p.mode));
  }
  assert(e.captures>0,'pursuit can succeed');
  assert(modes.has('hunt')&&modes.has('wander'),'hunter hunts and disengages');
  assert(preyModes.has('flee')&&preyModes.has('wander'),'prey reacts to danger');
  const frozen=JSON.stringify(e);e.update(0);assert.equal(JSON.stringify(e),frozen,'pause freezes entire ecosystem');
  console.log(`PASS: seed ${seed}, five minutes, ${e.captures} captures, bounded and continuous movement.`);
}
const e=new Ecosystem([foodItems[0]],seeded(7)),p=e.prey[0];
e.hunterMeshes=[{points:[[-20,0,0],[20,0,0]],edges:[[0,1]]}];
p.position=[80,0,0];p.direction=[1,0,0];p.intent=10;e.hunter.cooldown=10;
e.update(.05);assert.equal(p.mode,'flee');assert(p.velocity[0]>0,'prey accelerates away from threat');
p.position=[0,0,150];e.hunter.cooldown=0;e.update(1/60);
assert.equal(e.captures,0,'same XY but separated in depth is not capture');
p.position=e.hunter.position.slice();p.velocity=[0,0,0];e.update(1/60,false);
assert.equal(e.captures,0,'invisible slice cannot capture');
const contact=smallCreaturePoints(p,e.time)[0].map((v,k)=>v-e.hunter.position[k]);
e.hunterMeshes=[{points:[contact,contact.map((v,k)=>v+(k===0?20:0))],edges:[[0,1]]}];
e.update(1/60,true);assert.equal(e.captures,0,'wire contact alone no longer consumes prey');
p.position=e.hunter.position.map((v,k)=>v+(k===0?65:0));p.velocity=[0,0,0];
Object.assign(e.hunter.cage,{phase:'opening',open:1,axis:[1,0,0]});
e.hunter.mode='hunt';e.hunter.target=0;e.updateCage(1/120,true);
assert.equal(p.mode,'trapped');assert(p.alive,'prey stays whole while cage closes');
for(let i=0;i<180;i++)e.update(1/60,true);
assert.equal(e.captures,1);assert.equal(p.alive,false);
for(let i=0;i<60;i++)e.update(1/60);assert.equal(e.captures,1,'captured prey cannot be captured twice');
for(let i=0;i<750;i++)e.update(1/60,false);
assert.equal(p.alive,true,'new individual enters after delay');
e.hunter.energy=.1;e.update(1/60);assert.equal(e.hunter.mode,'rest');
console.log('PASS: escape direction, 3D distance, hidden slice, capture, delayed replacement, low-energy rest.');
