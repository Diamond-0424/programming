const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ctx=vm.createContext({Math});vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.api={PARAMS,generate4DBody,sample4DBody,sliceWith3DSpace,project4DTo3D,rotate4D,dot,sub,cross};',ctx);
const a=ctx.api,body=a.generate4DBody();
assert.equal(body.vertices.length,24);assert.equal(body.edges.length,96);assert.equal(body.cells.length,24);
for(let i=0;i<24;i++)assert.equal(body.edges.filter(e=>e.includes(i)).length,8,'eight edges per vertex');
for(const cell of body.cells){assert.equal(cell.ids.length,6);assert.equal(cell.edges.length,12);}
for(const [i,j] of body.edges)assert.equal(body.cells.filter(c=>c.ids.includes(i)&&c.ids.includes(j)).length,3,'three octahedral cells per edge');
const sizes=new Set();let count=0;
for(let i=0;i<180;i++){
  const t=i*.27,s=a.PARAMS.halfSize*1.48*Math.sin(t*a.PARAMS.sliceSpeed);
  const outer=a.sample4DBody(body,t),projection=a.project4DTo3D(outer);
  assert.equal(projection.points.length,24);assert.equal(projection.edges.length,96);
  projection.points.forEach((p,j)=>{assert(p.every(Number.isFinite));for(let k=0;k<3;k++)assert(Math.abs(p[k]-outer.vertices[j][k]*a.PARAMS.projectionDistance/(a.PARAMS.projectionDistance-outer.vertices[j][3]))<1e-8);});
  for(const level of a.PARAMS.shellLevels){
    const shape=a.sample4DBody(body,t,level),r=a.PARAMS.halfSize*level,mesh=a.sliceWith3DSpace(shape,s);
    for(const [u,v] of body.edges)assert(Math.abs(Math.hypot(...a.sub(shape.vertices[u],shape.vertices[v]))-Math.SQRT2*r)<1e-8);
    for(const p of mesh.points){
      assert(p.every(Number.isFinite));assert(Math.abs(p[3]-s)<1e-8);
      const local=a.rotate4D(p,t,true);
      for(const n of body.normals)assert(a.dot(n,local)<=r+1e-6,'inside every defining halfspace');
      assert(body.normals.filter(n=>Math.abs(a.dot(n,local)-r)<1e-6).length>=3,'point on a polytope edge');count++;
    }
    if(!mesh.faces.length)continue;
    const counts=new Map();
    for(const face of mesh.faces){
      sizes.add(face.length);const p=mesh.points[face[0]],q=mesh.points[face[1]],r=mesh.points[face[2]],n=a.cross(a.sub(q,p),a.sub(r,p));
      for(const id of face)assert(Math.abs(a.dot(a.sub(mesh.points[id].slice(0,3),p),n))<1e-5,'planar face');
      for(let j=0;j<face.length;j++){const key=[face[j],face[(j+1)%face.length]].sort((a,b)=>a-b).join(',');counts.set(key,(counts.get(key)||0)+1);}
    }
    assert([...counts.values()].every(n=>n===2),'closed surface');assert.equal(mesh.points.length-mesh.edges.length+mesh.faces.length,2);
  }
}
const plain={...body,vertices:body.vertices.map(p=>p.map(x=>x*a.PARAMS.halfSize)),level:1};
const middle=a.sliceWith3DSpace(plain,0);assert.equal(middle.points.length,12);assert.equal(middle.edges.length,24);assert.equal(middle.faces.length,14,'central cuboctahedron');
const end=a.sliceWith3DSpace(plain,a.PARAMS.halfSize);assert.equal(end.points.length,6);assert.equal(end.edges.length,12);assert.equal(end.faces.length,8,'coplanar octahedron');
assert.equal(a.sliceWith3DSpace(plain,a.PARAMS.halfSize+1).faces.length,0);
assert.deepEqual(a.sliceWith3DSpace(a.sample4DBody(body,3),7),a.sliceWith3DSpace(a.sample4DBody(body,3),7));
const oldD=a.PARAMS.projectionDistance;a.PARAMS.projectionDistance=1;assert.throws(()=>a.project4DTo3D(a.sample4DBody(body,0)));a.PARAMS.projectionDistance=oldD;
console.log('PASS: 24-cell incidence, 96 real edges, projection, '+count+' slice vertices, halfspaces, planar faces, closed surfaces, exact sections and singularity guard. Face sizes: '+[...sizes].sort());
