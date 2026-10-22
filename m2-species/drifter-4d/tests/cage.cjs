// 開瓣捕食的幾何與生命週期；不取代目視確認。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context=vm.createContext({Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={Ecosystem,foodItems,cagePoint};',context);
const {Ecosystem,foodItems,cagePoint}=context.api;
const make=()=>{
  const e=new Ecosystem([foodItems[0]],()=>.5);
  e.hunter.mode='hunt';e.hunter.target=0;
  e.hunter.cage.axis=[1,0,0];
  e.prey[0].position=[65,0,0];
  return e;
};
const closed=cagePoint([100,40,0],{open:0,axis:[1,0,0]});
assert.deepEqual(Array.from(closed),[100,40,0]);
const opened=cagePoint([100,40,0],{open:1,axis:[1,0,0]});
assert(opened[1]>65&&opened[0]<100,'front opens outward and folds back');
assert.deepEqual(Array.from(cagePoint([-100,40,0],{open:1,axis:[1,0,0]})),[-100,40,0],'rear remains intact');
const e=make(),p=e.prey[0],c=e.hunter.cage;
e.updateCage(1/120,true);assert(p.alive&&c.phase==='opening','cannot consume with closed cage');
for(let i=0;i<120&&c.phase!=='closing';i++)e.updateCage(1/120,true);
assert.equal(c.phase,'closing');assert.equal(p.mode,'trapped');assert(p.alive);
const before=p.position.slice();e.updateCage(1/120,true);
assert(Math.hypot(...p.position.map((v,k)=>v-before[k]))<1,'capture does not teleport prey');
const frozen=JSON.stringify(e);e.update(0);assert.equal(JSON.stringify(e),frozen);
for(let i=0;i<180;i++)e.updateCage(1/120,true);
assert.equal(e.captures,1);assert(!p.alive);
const effect=e.effects.find(effect=>effect.type==='consume');
assert(effect.internal&&effect.separation.every(v=>v===0),'digestion keeps fragments inside');
assert(effect.fragments.every(f=>Math.hypot(...f.position)<130),'no outward teleport');
for(let i=0;i<540;i++){effect.age+=1/120;e.updateFragments(effect,1/120);}
assert(effect.fragments.every(f=>f.absorbed),'internal fragments converge');
for(let i=0;i<300;i++)e.updateCage(1/120,true);
assert.equal(e.captures,1);assert.equal(c.phase,'idle');assert(c.open<.001);
for(const position of [[-65,0,0],[65,150,0],[65,0,150]]){
  const miss=make();miss.prey[0].position=position;miss.hunter.cage.open=1;
  miss.updateCage(1/120,true);
  assert.notEqual(miss.prey[0].mode,'trapped','rear, side and depth misses do not capture');
}
const release=make();release.hunter.cage.open=1;release.updateCage(1/120,true);
release.updateCage(1/120,false);
assert(release.prey[0].alive&&release.prey[0].mode==='flee');
assert.equal(release.hunter.cage.preyId,null,'hidden slice releases prey');
assert.equal(release.captures,0);
console.log('PASS: opening deformation, intact rear, delayed capture, no teleport, pause, internal digestion, recovery, misses and hidden release.');
