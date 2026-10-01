const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let seed=42;
const ctx=vm.createContext({Math,Set,console,assert,TWO_PI:Math.PI*2,cos:Math.cos,sin:Math.sin,
  randomSeed(n){seed=n;},random(a,b){if(b===undefined){b=a;a=0;}seed=(1664525*seed+1013904223)>>>0;return a+(b-a)*seed/4294967296;}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sketch.js'),'utf8'),ctx);
vm.runInContext(`
  resetWorld();
  const initial=JSON.stringify(nodes);
  assert.equal(sectionGeometry(0).length,0);
  assert.equal(sectionGeometry(1).length,0);
  assert.equal(sectionGeometry(0.2).length,1);
  assert.equal(sectionGeometry(0.5).length,2);
  assert.equal(sectionGeometry(0.8).length,1);
  // 所有輪廓點必須落在同一個固定三維環體上，包含頸部臨界前後。
  const transition=DRIFTER.tube/(DRIFTER.major+DRIFTER.tube);
  for(const progress of [0.00001,0.1,transition-1e-6,transition,transition+1e-6,0.5,0.9,0.99999]) {
    const z=sliceDepth(progress);
    for(const section of sectionGeometry(progress)) for(const p of section.points) {
      const dx=p.x-drifter.x,dy=p.y-drifter.y;
      const u=dx*Math.cos(drifter.angle)+dy*Math.sin(drifter.angle);
      const v=-dx*Math.sin(drifter.angle)+dy*Math.cos(drifter.angle);
      assert(Math.abs((Math.hypot(u,z)-DRIFTER.major)**2+v*v-DRIFTER.tube**2)<1e-7,'輪廓偏離環體表面');
    }
  }
  drifter.depth=0;drifter.sections=sectionGeometry(0.5);
  assert(!insideSections({x:500,y:230}),'中央空隙不可捕食');
  for(const sign of [-1,1]) {
    assert(insideSections(sectionToWorld(sign*DRIFTER.major,0)));
    // 中央切片應是半徑 tube、圓心相隔 2*major 的兩個圓。
    const section=drifter.sections[sign===-1?0:1];
    for(const p of section.points)assert(Math.abs(Math.hypot(p.x-500-sign*DRIFTER.major,p.y-230)-DRIFTER.tube)<1e-7);
  }
  resetWorld();
  nodes=[];addNode(500,230);updateDrifter(0.05);
  assert.equal(nodes.length,0);assert.equal(drifter.held.length,1);
  const paused=JSON.stringify(drifter);updateDrifter(0);assert.equal(JSON.stringify(drifter),paused);
  const captured=drifter.held[0];
  assert.equal(captured.x,500);assert.equal(captured.y,230);
  for(let i=0;i<370;i++)updateDrifter(0.05);
  assert.equal(drifter.sections.length,0);assert.equal(drifter.held.length,0);assert.equal(drifter.consumed,1);
  for(let i=0;i<120;i++)updateDrifter(0.05);
  assert.equal(drifter.cycle,1);assert(drifter.sections.length>0);
  resetWorld();assert.equal(JSON.stringify(nodes),initial);assert.equal(drifter.consumed,0);
  for(let f=0;f<9000;f++){
    updateNodes(1/30);updateDrifter(1/30);
    assert.equal(nodes.length+drifter.held.length+drifter.consumed,82,'捕食不得重複計數或遺失節點');
    for(const s of drifter.sections)for(const p of s.points){
      assert(Number.isFinite(p.x)&&Number.isFinite(p.y));
      assert(p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=460);
    }
  }
  assert(drifter.consumed>0);
  nodes=[];resetDrifter();updateDrifter(0.1);assert(Number.isFinite(drifter.x));
  // 驗證畫圖能處理單截面、雙截面、空截面與暫停，且輸入座標有效。
  for(const name of ['push','pop','fill','stroke','strokeWeight','beginShape','endShape','noStroke'])globalThis[name]=()=>{};
  globalThis.CLOSE='close';globalThis.vertex=(x,y)=>assert(Number.isFinite(x)&&Number.isFinite(y));
  globalThis.circle=(x,y,r)=>assert(Number.isFinite(x)&&Number.isFinite(y)&&r>=0);
  for(const p of [0,0.2,transition,0.5,0.8,1]) {drifter.sections=sectionGeometry(p);drawDrifter();}
  console.log('PASS: 固定環體方程、臨界切片、雙圓截面、中央空隙、捕食守恆、離開與返回、暫停、重設、300 秒整合及繪圖呼叫。');
`,ctx);
