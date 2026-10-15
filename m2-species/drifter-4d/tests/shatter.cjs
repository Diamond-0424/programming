const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const c=vm.createContext({Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={Ecosystem,foodItems,foodMeshes,FX,segmentContact,smallCreaturePoints,hunterCollisionMeshes,fragmentHalf,PARAMS};',c);
const {Ecosystem,foodItems,foodMeshes,FX,segmentContact,smallCreaturePoints,hunterCollisionMeshes,fragmentHalf,PARAMS}=c.api;
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
assert.equal(segmentContact([-5,0,0],[5,0,0],[0,-5,0],[0,5,0]).distance,0);
assert.equal(segmentContact([-5,0,0],[5,0,0],[0,-5,12],[0,5,12]).distance,12);
assert.equal(segmentContact([0,0,0],[0,0,0],[3,0,0],[3,0,0]).distance,3);
assert.equal(segmentContact([0,0,0],[3,0,0],[0,2,0],[3,2,0]).distance,2);
for(const item of foodItems.slice(0,4)){
  const e=new Ecosystem([item],()=>.6),p=e.prey[0];p.position=[0,0,0];
  e.hunterMeshes=[{points:[[60,-10,0],[60,10,0]],edges:[[0,1]]}];
  assert.equal(e.preyContact(p),null,'near center without wire contact is not collision');
  const points=smallCreaturePoints(p,0),touch=points[0];
  e.hunterMeshes=[{points:[touch,touch.map((v,k)=>v+(k===0?20:0))],edges:[[0,1]]}];
  const hit=e.preyContact(p);assert(hit,'visible node touches hunter wire');
  e.resolveCollisions(false);assert(p.alive,'hidden predator cannot shatter');
  e.resolveCollisions(true);assert(!p.alive);assert.equal(e.captures,1);
  e.resolveCollisions(true);assert.equal(e.captures,1,'only one event per prey');
  const effect=e.effects.find(f=>f.type==='consume');
  assert.equal(effect.fragments.length,foodMeshes[p.kind].points.length+foodMeshes[p.kind].edges.length);
  points.forEach((point,i)=>assert(Math.hypot(...point.map((v,k)=>v+effect.separation[k]-effect.fragments[i].position[k]))<1e-8,'overlap correction translates original mesh without deforming it'));
  for(const f of effect.fragments)assert(dot(f.velocity.map((v,k)=>v-e.hunter.velocity[k]),effect.normal)>0,'initial fragments all scatter outward');
  const first=effect.fragments[0],origin=first.position.slice();
  for(let i=0;i<12;i++){effect.age+=1/120;e.updateFragments(effect,1/120);}
  assert(Math.hypot(...first.position.map((v,k)=>v-origin[k]))>1,'fragments scatter before suction');
  const oldHistory=first.history[0].slice();e.hunter.position=[30,10,-10];
  effect.age+=1/120;e.updateFragments(effect,1/120);
  assert.deepEqual(first.history[0],oldHistory,'moving core does not translate old trails');
  for(let i=0;i<Math.ceil((FX.consumeDuration-.2)*120);i++){
    effect.age+=1/120;e.updateFragments(effect,1/120);
    for(const f of effect.fragments){
      assert(f.position.every(Number.isFinite));assert(f.history.length<=FX.trailSamples);
      if(effect.age<=FX.scatterTime){
        const half=fragmentHalf(f,effect.age),extent=half?Math.abs(dot(half,effect.normal))+PARAMS.lineWidth/2:PARAMS.nodeRadius;
        assert(dot(f.position.map((v,k)=>v-e.hunter.position[k]),effect.normal)>=e.fragmentSurface(effect.normal)+extent-1e-7,'whole fragment stays outside moving body during scatter');
      }
    }
  }
  assert(effect.fragments.every(f=>f.absorbed),'all fragments converge into relocated core');
}
const transformed=hunterCollisionMeshes([{points:[[1,0,0]],edges:[]}],{scale:2},{scale:1,turn:Math.PI/2,tilt:0},0);
assert(Math.abs(transformed[0].points[0][2]+2)<1e-8,'collision transform follows p5 rotateY sign and scale');
console.log('PASS: contact geometry, four shapes, outward launch, full-fragment nonpenetration, delayed suction, world-space trails, bounds, render transform.');
