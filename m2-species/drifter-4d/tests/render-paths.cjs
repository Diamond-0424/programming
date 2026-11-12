// Real Three geometry/material modules; GPU and browser controls are stubs.
// Run: node --experimental-vm-modules tests/render-paths.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
if(!vm.SourceTextModule){
  const result=require('node:child_process').spawnSync(process.execPath,['--experimental-vm-modules',__filename],{stdio:'inherit'});
  process.exit(result.status??1);
}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'sketch.js'),'utf8');
const seededRandom=(seed=42)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function context(core){
  const dom=Object.fromEntries(['canvas-host','view-mode','view-label','view-caption','slice-status','pause','reset','capture','loading'].map(id=>[id,
    {clientWidth:900,clientHeight:600,textContent:'',style:{},append(){},remove(){},setAttribute(){}}]));
  const c=vm.createContext({console,performance,Math,AbortController,seededRandom,drifterCore:core,drifterCoreReady:Promise.resolve(core),
    drifterExperiment:{benchmark:false,low:true},document:{hidden:false,getElementById:id=>dom[id]},
    window:{devicePixelRatio:1},requestAnimationFrame:fn=>{c.frame=fn;return 1;},cancelAnimationFrame(){},
    addEventListener(){},removeEventListener(){},width:900,height:600,deltaTime:0,
    WEBGL:1,LINES:2,TRIANGLES:6,ADD:3,BLEND:4,CLOSE:5});
  for(const name of ['pixelDensity','describe','background','orbitControl','push','pop','scale','translate','blendMode','noFill','noStroke','fill','stroke','strokeWeight','beginShape','endShape','vertex'])c[name]=()=>{};
  c.createCanvas=()=>({parent(){},elt:{addEventListener(){}}});
  c.createCamera=()=>({camera(x,y,z,cx,cy,cz,ux,uy,uz){Object.assign(this,{eyeX:x,eyeY:y,eyeZ:z,centerX:cx,centerY:cy,centerZ:cz,upX:ux,upY:uy,upZ:uz});},perspective(){}});
  vm.runInContext(source+';resetSimulation();globalThis.snapshot=()=>JSON.stringify({clockTime,explorer,ecosystem,section});',c);
  return c;
}
async function loadThree(c){
  const cache=new Map();let wrapper,controls;
  async function load(file){
    file=path.resolve(file);if(cache.has(file))return cache.get(file);
    const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:c,identifier:file});cache.set(file,mod);
    await mod.link(async(specifier,parent)=>{
      if(wrapper&&(specifier==='three'||specifier.endsWith('/build/three.module.js')))return wrapper;
      if(controls&&specifier.endsWith('/controls/OrbitControls.js'))return controls;
      return load(specifier==='three'?path.join(root,'vendor/three/build/three.module.js'):path.resolve(path.dirname(parent.identifier),specifier));
    });return mod;
  }
  const real=await load(path.join(root,'vendor/three/build/three.module.js'));await real.evaluate();
  const values={...real.namespace,WebGLRenderer:class {
    constructor(){this.domElement={remove(){}};this.calls=0;}
    setPixelRatio(){} setClearColor(){} setSize(){} dispose(){this.disposed=true;}
    render(scene){this.calls++;for(const child of scene.children){
      if(child.isInstancedMesh)assert(child.count<=child.instanceMatrix.count);
      if(child.isLineSegments2)assert(child.geometry.instanceCount<=child.geometry.attributes.instanceStart.count);
    }}
  }};
  wrapper=new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context:c});
  controls=new vm.SyntheticModule(['OrbitControls'],function(){this.setExport('OrbitControls',class {
    constructor(camera){this.camera=camera;this.target=new values.Vector3();}
    update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}dispose(){}
  });},{context:c});
  const entry=await load(path.join(root,'three-main.js'));await entry.evaluate();return values;
}
(async()=>{
  const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(root,'rust-core/drifter_core.wasm')));
  const core=require('../rust-core/bridge.js')(instance.exports);
  for(const backend of [null,core]){
    const p5=context(backend),three=context(backend);vm.runInContext('setup();',p5);
    const THREE=await loadThree(three);
    let now=0;
    for(let i=0;i<420;i++){
      // Identical dt sequence, pause, projection/slice and forced consumption.
      const previous=now;now+=1000/60;
      p5.deltaTime=i===0?0:now-previous;
      if(i===30||i===180)for(const c of [p5,three])vm.runInContext(`ecosystem.shatter(ecosystem.prey.find(p=>p.alive),{first:[0,0,0]},true);`,c);
      if(i===100)for(const c of [p5,three])vm.runInContext("viewMode='slice';",c);
      if(i===160)for(const c of [p5,three])vm.runInContext("viewMode='projection';",c);
      if(i===200||i===220)for(const c of [p5,three])vm.runInContext('paused=!paused;',c);
      vm.runInContext('draw();',p5);three.frame(now);
      assert.equal(three.snapshot(),p5.snapshot(),`state ${backend?'Wasm':'JS'} frame ${i}`);
      const before=three.snapshot();vm.runInContext('renderSimulation({s:section[0].s||0,breathing:breathingAt(clockTime)});',three);
      assert.equal(three.snapshot(),before,'rendering does not mutate ecology');
    }
    const r=three.drifterRenderer;
    console.log(`Renderer batches after 420 frames (${backend?'Wasm':'JS'}): ${r.batches.size}`);
    assert(r.batches.size<=16,'animated effect widths must not accumulate unbounded GPU batches');
    for(let i=0;i<10000;i++){
      r.begin();r.line([0,0,0],[1,1,1],.35+(i%1000)/1000,1);
    }
    assert(r.batches.size<=16,'continuous widths remain bounded over long sessions');
    r.begin();r.push();r.translate(2,3,4);r.scale(2);r.line([1,2,3],[4,5,6],1,.5);r.pop();
    const b=r.batches.get('1.0000');assert.deepEqual(Array.from(b.positions.array.slice(0,6)),[4,-7,10,10,-13,16]);
    const initial=r.nodeCapacity;for(let i=0;i<initial+1;i++)r.node([i,0,0],4,1,1.65);
    assert(r.nodeCapacity>initial);assert.equal(r.nodes.instanceMatrix.array[12],0);
    for(let i=0;i<2200;i++)r.line([i,0,0],[i,1,0],1,.5);
    assert(b.capacity<r.batches.get('1.0000').capacity);r.end();
    assert.equal(r.batches.get('1.0000').geometry.instanceCount,2201);
    r.begin();r.end();assert.equal(r.nodes.count,0);assert.equal(r.batches.get('1.0000').mesh.visible,false);
    // Y-down world point must land below screen center, not upside down.
    r.resetView();r.camera.updateMatrixWorld();
    assert(new THREE.Vector3(...r.point([0,50,0])).project(r.camera).y<0);
    r.dispose();assert(r.renderer.disposed);
  }
  console.log('PASS: real Three modules, both entry paths, 420 frames each for JS/Wasm, pause/slice/effects, read-only rendering, Y direction, buffer growth/reset/disposal. GPU appearance remains unverified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
