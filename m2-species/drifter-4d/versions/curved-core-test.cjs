const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8');
const context = vm.createContext({Math});
vm.runInContext(source+';globalThis.api={PARAMS,corePoint,coreTangent,generate4DCoreCurve,sample4DBody,sliceWith3DSpace,dot4};',context);
const a=context.api, pool=a.sample4DBody(a.generate4DCoreCurve());
assert(Math.hypot(...a.corePoint(0).map((x,i)=>x-a.corePoint(Math.PI*2)[i]))<1e-8,'core must close');
// 新核心的解析切向必須符合數值導數，避免法向截面偏離母體。
for(let i=0;i<100;i++){
  const t=i/100*2*Math.PI,eps=1e-5;
  const plus=a.corePoint(t+eps),minus=a.corePoint(t-eps);
  const d=plus.map((v,k)=>(v-minus[k])/(2*eps)),len=Math.hypot(...d);
  assert(Math.hypot(...a.coreTangent(t).map((v,k)=>v-d[k]/len))<1e-7,'analytic core tangent');
}
const components=new Set(); let count=0;
for(let k=0;k<=120;k++){
  const s=-(pool.extent+10)+2*(pool.extent+10)*k/120;
  const layers=a.sliceWith3DSpace(pool,s), active=layers[0].map(Boolean);
  components.add(active.every(Boolean)?1:active.reduce((n,v,i)=>n+(v&&!active[(i+active.length-1)%active.length]?1:0),0));
  layers.forEach((rings,l)=>rings.forEach((ring,i)=>{
    if(!ring)return;
    ring.points.forEach(p=>{
      assert(p.every(Number.isFinite));
      assert(Math.abs(p[3]-s)<1e-8,'point must lie on w=s');
      const offset=p.map((v,j)=>v-pool.frames[i].center[j]);
      const f=pool.frames[i],r=a.PARAMS.tubeRadius*a.PARAMS.shellLevels[l];
      const n=a.dot4(offset,f.N),u=a.dot4(offset,f.U),v=a.dot4(offset,f.V);
      const {power,scaleU,scaleV,shear}=f.shape;
      const implicit=Math.abs(n/r)**power+Math.abs((u-shear*v)/(r*scaleU))**power+Math.abs(v/(r*scaleV))**power;
      assert(Math.abs(implicit-1)<1e-8,'rounded angular body boundary');
      assert(Math.abs(a.dot4(offset,pool.frames[i].T))<1e-8,'normal fiber');
      count++;
    });
  }));
}
assert(components.has(0)&&[...components].some(x=>x>1),'disappearance and split');
assert(a.sliceWith3DSpace(pool,pool.extent+1).flat().every(x=>x===null));
assert.deepEqual(a.sliceWith3DSpace(pool,0),a.sliceWith3DSpace(pool,0),'deterministic');
// 取樣接近但未跨過切觸事件，位置應連續。
const first=a.sliceWith3DSpace(pool,0), second=a.sliceWith3DSpace(pool,1e-5);
for(let i=0;i<first[0].length;i++)if(first[0][i]&&second[0][i]){
  const p=first[0][i].points[0],q=second[0][i].points[0];
  assert(Math.hypot(...p.map((x,j)=>x-q[j]))<.02,'continuous slice');
}
// 圓滑設定必須能回到上一版的球形法向截面。
a.PARAMS.cornerPower=2;a.PARAMS.shapeIrregularity=0;
const roundPool=a.sample4DBody(a.generate4DCoreCurve());
a.sliceWith3DSpace(roundPool,0).forEach((rings,l)=>rings.forEach((ring,i)=>{
  if(ring)for(const p of ring.points){
    const d=p.map((x,j)=>x-roundPool.frames[i].center[j]);
    assert(Math.abs(Math.hypot(...d)-a.PARAMS.tubeRadius*a.PARAMS.shellLevels[l])<1e-8,'round fallback');
  }
}));
console.log('PASS: '+count+' points; w=s, normal tube, closure, splits, disappearance, determinism, continuity.');
