const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({Math});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={Ecosystem,foodItems,foodMeshes};',ctx);
const {Ecosystem,foodItems,foodMeshes}=ctx.api;
assert.equal(foodItems.length,27);assert.equal(new Set(foodItems.map(p=>p.kind)).size,6);
for(const mesh of foodMeshes)for(const edge of mesh.edges)for(const id of edge)assert(mesh.points[id]?.every(Number.isFinite));
// 新形體必須也能完整碎解，不只是背景裝飾。
for(const kind of [4,5]){
  const e=new Ecosystem([foodItems.find(p=>p.kind===kind)],()=>.5),p=e.prey[0];
  e.shatter(p,{first:p.position.slice()},true);
  assert.equal(e.effects.find(x=>x.type==='consume').fragments.length,foodMeshes[kind].points.length+foodMeshes[kind].edges.length);
}
console.log('PASS: 27 prey / 6 meshes and new-species digestion.');
