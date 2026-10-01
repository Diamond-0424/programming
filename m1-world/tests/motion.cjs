// 執行：node tests/motion.cjs。只驗證運動，不取代瀏覽器畫面驗證。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let seed = 42;
const context = vm.createContext({
  Math, Set, assert, console, TWO_PI: Math.PI*2, cos: Math.cos, sin: Math.sin,
  randomSeed(value) { seed = value; },
  random(a,b) {
    if (b === undefined) { b = a; a = 0; }
    seed = (seed*1664525+1013904223) >>> 0;
    return a+(b-a)*seed/4294967296;
  }
});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sketch.js'),'utf8'), context);
vm.runInContext(`
  function nearestDistance() {
    return nodes.reduce((sum,n,i)=>sum+Math.min(...nodes.filter((_,j)=>j!==i).map(o=>Math.hypot(n.x-o.x,n.y-o.y))),0)/nodes.length;
  }
  resetWorld();
  const initial = nearestDistance();
  for (let frame=0;frame<3600;frame++) {
    const headings=nodes.map(n=>n.heading);
    updateNodes(1/60);
    nodes.forEach((n,i)=>{
      assert(Number.isFinite(n.x)&&Number.isFinite(n.y));
      assert(n.x>=6&&n.x<=994&&n.y>=6&&n.y<=454);
      const turn=Math.abs(Math.atan2(Math.sin(n.heading-headings[i]),Math.cos(n.heading-headings[i])));
      assert(turn<=MOTION.turnRate/60+1e-10,'轉角超出上限');
    });
  }
  const grouped = nearestDistance();
  assert(grouped<initial,'群集後平均最近鄰距離應下降');
  const paused=JSON.stringify(nodes);
  updateNodes(0);
  assert.equal(JSON.stringify(nodes),paused,'暫停不可修改節點狀態');
  nodes=[]; addNode(400,100);
  const firstHeading=nodes[0].heading;
  for(let i=0;i<300;i++)updateNodes(1/60);
  assert(Math.abs(nodes[0].heading-firstHeading)>0.05,'孤立點仍應漫步轉向');
  nodes=[]; addNode(500,230); addNode(500,230);
  for(let i=0;i<120;i++)updateNodes(1/60);
  assert(Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y)>5,'重疊點應散開');
  resetWorld(); const original=JSON.stringify(nodes);
  for(let i=0;i<120;i++)updateNodes(1/60);
  resetWorld();assert.equal(JSON.stringify(nodes),original,'重設應重現初始状态');
  for(let i=0;i<200;i++)addNode(500,230);
  assert.equal(nodes.length,140);
  flowStrength=0;
  assert.equal(sampleField(320,170,0).height,sampleField(320,170,20).height,'零強度地形應靜止');
  flowStrength=1.5;
  assert.notEqual(sampleField(320,170,0).height,sampleField(320,170,20).height,'波應隨時間傳播');
  for(let x=0;x<=1000;x+=50)for(let y=0;y<=460;y+=20){
    const field=sampleField(x,y,10);
    assert(Number.isFinite(field.height));
    assert(Number.isFinite(field.x)&&Number.isFinite(field.y));
    assert(Math.hypot(field.x,field.y)<=1+1e-10,'流場有上限，弱場不可被強制放大');
    const p=terrainPoint(x,y);
    assert(p.y>=0&&p.y<=460,'地形不可超出畫布');
  }
  resetWorld(); flowStrength=0; updateNodes(1/60);const calm=JSON.stringify(nodes);
  resetWorld(); flowStrength=1.5;updateNodes(1/60);
  assert.notEqual(JSON.stringify(nodes),calm,'流場應實際影響移動');
  const frozenTime=elapsed, frozenNodes=JSON.stringify(nodes);
  updateNodes(0);
  assert.equal(elapsed,frozenTime);assert.equal(JSON.stringify(nodes),frozenNodes);
  for(let i=0;i<600;i++)updateNodes(1/60);
  assert(nodes.every(n=>n.x>=6&&n.x<=994&&n.y>=6&&n.y<=454));
  nodes=[]; flowStrength=0;
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6;
    addNode(480+Math.cos(angle)*12,100+Math.sin(angle)*12);
  }

  function spread(){
    const x=nodes.reduce((s,n)=>s+n.x,0)/nodes.length;
    const y=nodes.reduce((s,n)=>s+n.y,0)/nodes.length;
    return nodes.reduce((s,n)=>s+Math.hypot(n.x-x,n.y-y),0)/nodes.length;
  }
  const beforeSpread=spread();let maxSpread=beforeSpread;
  for(let i=0;i<900;i++){
    updateNodes(1/60);
    maxSpread=Math.max(maxSpread,spread());
  }
  assert(maxSpread>beforeSpread*2,'密集點群必須有明顯空間擴張');
  nodes=[];addNode(400,100);addNode(600,100);
  const speeds=nodes.map(n=>n.speed);let change=0;
  for(let i=0;i<600;i++){
    const before=nodes.map(n=>n.speed);updateNodes(1/60);
    nodes.forEach((n,j)=>{
      assert(n.speed>=10&&n.speed<=46);
      assert(Math.abs(n.speed-before[j])<=8/60+1e-10);
      change=Math.max(change,Math.abs(n.speed-speeds[j]));
    });
  }
  assert(change>2);
  assert(Math.abs(nodes[0].speed-nodes[1].speed)>0.1);
  console.log('PASS: separation spreads dense group; individual speed variation and acceleration bounds.');
  console.log('PASS: field animation, zero flow, terrain bounds, movement coupling, pause, strong-flow bounds.');
  console.log('PASS: 3600 frames, bounds, turn limit, grouping, pause, wander, overlap separation, reset, cap.');
  console.log('Mean nearest-neighbor distance: '+initial.toFixed(2)+' → '+grouped.toFixed(2));
`, context);
