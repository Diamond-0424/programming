const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let seed=42;
const context=vm.createContext({Math,Set,console,assert,TWO_PI:Math.PI*2,cos:Math.cos,sin:Math.sin,
  randomSeed(n){seed=n;},random(a,b){if(b===undefined){b=a;a=0;}seed=(1664525*seed+1013904223)>>>0;return a+(b-a)*seed/4294967296;}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sketch.js'),'utf8'),context);
vm.runInContext(`
  function stats(){
    const center=nodes.reduce((c,n)=>({x:c.x+n.x/nodes.length,y:c.y+n.y/nodes.length}),{x:0,y:0});
    const cells=new Set(nodes.map(n=>Math.floor(n.x/250)+','+Math.floor(n.y/230)));
    return {x:+center.x.toFixed(1),y:+center.y.toFixed(1),cells:cells.size,
      rightBottom:nodes.filter(n=>n.x>750&&n.y>345).length,
      spanX:Math.max(...nodes.map(n=>n.x))-Math.min(...nodes.map(n=>n.x)),
      spanY:Math.max(...nodes.map(n=>n.y))-Math.min(...nodes.map(n=>n.y))};
  }
  for(const [testSeed,strength] of [[42,0],[137,0.7],[2026,1.5]]){
    nodes=[];elapsed=0;randomSeed(testSeed);flowStrength=strength;
    for(let i=0;i<82;i++)addNode();
    assert(stats().cells===8,'隨機生成涵蓋整個框內八區');
    let maxOffset=0,minCells=8;
    for(let f=0;f<9000;f++){
      updateNodes(1/30);
      assert(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&n.x>=6&&n.x<=994&&n.y>=6&&n.y<=454));
      if(f>900&&f%30===0){
        const s=stats();
        maxOffset=Math.max(maxOffset,Math.hypot(s.x-500,s.y-230));
        minCells=Math.min(minCells,s.cells);
        assert(s.spanX>600&&s.spanY>270,'應保留跨區域分布');
        assert(s.rightBottom<25,'不可持續集中右下角');
      }
    }
    assert(maxOffset<65,'整群平均位置應維持中央附近');
    assert(minCells>=6,'鬆散群集應分布在多個區域');
    console.log(JSON.stringify({testSeed,strength,maxOffset,minCells,final:stats()}));
  }
  // 明確驗證初始向右下移動也不會造成整群持續漂移。
  resetWorld();nodes.forEach(n=>{n.heading=Math.PI/4;n.vx=n.speed/Math.sqrt(2);n.vy=n.vx;});
  for(let i=0;i<1800;i++)updateNodes(1/30);
  assert(Math.hypot(stats().x-500,stats().y-230)<40);
  // 新增事件仍由框內點擊觸發，但生成位置不再限於點擊附近。
  const canvas={};globalThis.document={querySelector:()=>canvas};
  nodes=[];view={scale:1,x:0,y:0};globalThis.mouseX=950;globalThis.mouseY=420;
  for(let i=0;i<20;i++)mousePressed({target:canvas});
  assert(stats().cells===8&&stats().spanX>800&&stats().spanY>350);
  const occupied=nodes.length;mouseX=-20;mousePressed({target:canvas});assert.equal(nodes.length,occupied);
  console.log('PASS: long-run centering, coverage, bounds, biased initial velocity, full-area click spawning.');
`,context);
