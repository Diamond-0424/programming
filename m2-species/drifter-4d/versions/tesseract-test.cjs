const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ctx=vm.createContext({Math});vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={PARAMS,generate4DBody,sample4DBody,sliceWith3DSpace,rotate4D,dot,sub,cross};',ctx);
const a=ctx.api,body=a.generate4DBody();assert.equal(body.vertices.length,16);assert.equal(body.edges.length,32);assert.equal(body.cells.length,8);
const polygons=new Set();let checked=0;
for(let i=0;i<240;i++){
  const time=i*.21,s=2.08*a.PARAMS.halfSize*Math.sin(time*a.PARAMS.sliceSpeed);
  for(const level of a.PARAMS.shellLevels){
    const shape=a.sample4DBody(body,time,level),mesh=a.sliceWith3DSpace(shape,s),r=a.PARAMS.halfSize*level;
    for(const [v,w] of body.edges)assert(Math.abs(Math.hypot(...a.sub(shape.vertices[v],shape.vertices[w]))-2*r)<1e-8,'4D edge length');
    for(const p of mesh.points){
      assert(p.every(Number.isFinite));assert(Math.abs(p[3]-s)<1e-8);
      const local=a.rotate4D(p,time,true);assert(local.every(x=>Math.abs(x)<=r+1e-6),'inside hypercube');
      assert(local.filter(x=>Math.abs(Math.abs(x)-r)<1e-6).length>=3,'point lies on 4D edge');checked++;
    }
    if(!mesh.faces.length)continue;
    const edges=new Map();
    for(const f of mesh.faces){polygons.add(f.length);const p=mesh.points[f[0]],q=mesh.points[f[1]],r=mesh.points[f[2]];
      const n=a.cross(a.sub(q,p),a.sub(r,p));
      for(const id of f)assert(Math.abs(a.dot(a.sub(mesh.points[id].slice(0,3),p),n))<1e-5,'planar face');
      for(let j=0;j<f.length;j++){const key=[f[j],f[(j+1)%f.length]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert([...edges.values()].every(n=>n===2),'closed boundary');assert.equal(mesh.points.length-mesh.edges.length+mesh.faces.length,2,'Euler characteristic');
  }
}
// 無旋轉的已知答案：中央截面是六面立方體。
const plain={...body,vertices:body.vertices.map(p=>p.map(x=>x*a.PARAMS.halfSize)),level:1};
for(const s of [0,a.PARAMS.halfSize]){const m=a.sliceWith3DSpace(plain,s);assert.equal(m.points.length,8);assert.equal(m.edges.length,12);assert.equal(m.faces.length,6);}
assert.equal(a.sliceWith3DSpace(plain,a.PARAMS.halfSize+1).faces.length,0);
assert(polygons.has(3)&&polygons.has(4),'triangular and quadrilateral faces occur');
assert.deepEqual(a.sliceWith3DSpace(a.sample4DBody(body,2),5),a.sliceWith3DSpace(a.sample4DBody(body,2),5));
console.log('PASS: '+checked+' vertices; 4D rotations, w=s, hypercube membership, planar faces, closed mesh, Euler, exact cube and determinism. Face sizes: '+[...polygons].sort());
