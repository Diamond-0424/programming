const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const createCore=require('../rust-core/bridge.js');
const source=fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8');
function close(a,b,where='root'){
  if(typeof a==='number'){assert(Number.isFinite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a)),`${where}: ${a} != ${b}`);return;}
  if(a&&typeof a==='object'){
    assert.deepEqual(Object.keys(a),Object.keys(b),where);
    for(const k of Object.keys(a))close(a[k],b[k],where+'.'+k);
  }else assert.equal(a,b,where);
}
(async()=>{
  const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(__dirname,'../rust-core/drifter_core.wasm')));
  const core=createCore(instance.exports),ctx=vm.createContext({Math});
  vm.runInContext(source+';globalThis.api={PARAMS,generate4DBody,sample4DBody,sliceWith3DSpace,project4DTo3D,segmentContact};',ctx);
  const a=ctx.api,body=a.generate4DBody();let meshes=0;
  for(let step=0;step<180;step++)for(const level of [1,.67]){
    const time=step*.27,s=a.PARAMS.halfSize*1.48*Math.sin(time*a.PARAMS.sliceSpeed),shape=a.sample4DBody(body,time,level);
    for(const mode of ['slice','projection']){
      const expected=mode==='slice'?a.sliceWith3DSpace(shape,s):a.project4DTo3D(shape);
      // 鍵順序不屬於資料語意，保留點／邊／面的索引順序進行比對。
      const actual=core.geometry(a.PARAMS,time,level,s,mode);
      for(const key of Object.keys(expected))close(expected[key],actual[key],mode+'.'+key);
      meshes++;
    }
  }
  for(const s of [0,94,-94,95]){
    const shape=a.sample4DBody(body,0,1);
    close(a.sliceWith3DSpace(shape,s).points,core.geometry(a.PARAMS,0,1,s,'slice').points);
  }
  assert.throws(()=>core.geometry({...a.PARAMS,projectionDistance:1},0,1,0,'projection'));
  let seed=123456;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const cases=[[[0,0,0],[0,0,0],[1,0,0],[1,0,0]],[[0,0,0],[1,0,0],[0,1,0],[1,1,0]],[[0,0,0],[1,1,0],[1,0,0],[0,1,0]]];
  for(let i=0;i<1000;i++)cases.push(Array.from({length:4},()=>Array.from({length:3},()=>rand()*400-200)));
  for(const c of cases)close(a.segmentContact(...c),core.segmentContact(...c),'contact');
  // 舊資料不應被下一次 Wasm 計算覆寫。
  const retained=core.geometry(a.PARAMS,1,1,0,'slice'),copy=JSON.stringify(retained);
  core.segmentContact(...cases[0]);assert.equal(JSON.stringify(retained),copy);
  console.log(`PASS: Rust/Wasm equivalence: ${meshes} meshes, ${cases.length} contacts, projection guard and output ownership.`);
  const originalCreate=vm.createContext;
  vm.createContext=function(sandbox={},...args){sandbox.drifterCore=core;return originalCreate.call(this,sandbox,...args);};
  for(const name of ['geometry','behavior','ecosystem','interaction','physics-effects','shatter','cage'])require('./'+name+'.cjs');
  vm.createContext=originalCreate;
  // 真正的瀏覽器載入流程：成功、HTTP 失敗都驗證，避免測到的只是手動注入。
  const bridge=fs.readFileSync(path.join(__dirname,'../rust-core/bridge.js'),'utf8');
  for(const ok of [true,false]){
    const browser=originalCreate({URL,WebAssembly,Float64Array,console:{warn(){}},document:{currentScript:{src:'http://localhost/rust-core/bridge.js'}},
      fetch:async()=>({ok,status:ok?200:404,arrayBuffer:async()=>fs.readFileSync(path.join(__dirname,'../rust-core/drifter_core.wasm'))})});
    vm.runInContext(bridge,browser);await browser.drifterCoreReady;
    assert.equal(browser.drifterCoreStatus,ok?'rust':'javascript');
  }
  console.log('PASS: browser loader success and explicit JavaScript fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
