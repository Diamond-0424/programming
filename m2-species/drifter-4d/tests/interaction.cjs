// 控制邏輯測試：模擬 p5 與 DOM；不取代 WebGL 目視驗證。
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ids=['canvas-host','loading','pause','reset','capture','view-mode','view-label','view-caption','slice-status'];
const dom=Object.fromEntries(ids.map(id=>[id,{clientWidth:960,clientHeight:640,value:'projection',textContent:'',setAttribute(){},remove(){}}]));
const c={Math,document:{getElementById:id=>dom[id]||null},window:{devicePixelRatio:1},windowWidth:960,windowHeight:640,deltaTime:16,
  WEBGL:1,LINES:2,POINTS:3,TRIANGLES:4,ADD:5,BLEND:6,CLOSE:7};
for(const key of ['pixelDensity','describe','background','orbitControl','push','pop','scale','translate','rotateY','rotateZ','blendMode','noFill','stroke','strokeWeight','beginShape','endShape','vertex','fill','saveCanvas'])c[key]=()=>{};
c.createCanvas=(w,h)=>{c.width=w;c.height=h;return {parent(){},elt:{addEventListener(){}}};};
c.createCamera=()=>({camera(x,y,z,cx,cy,cz,ux,uy,uz){Object.assign(this,{eyeX:x,eyeY:y,eyeZ:z,centerX:cx,centerY:cy,centerZ:cz,upX:ux,upY:uy,upZ:uz});},perspective(){}});
vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8')+';globalThis.state=()=>({clockTime,paused,viewMode,section});',c);
vm.runInContext('setup();draw();',c);assert.equal(c.state().viewMode,'projection');assert.equal(c.state().section[0].edges.length,96);assert(dom['view-label'].textContent.includes('投影'));
dom.pause.onclick();const t=c.state().clockTime;const frozenBehavior=vm.runInContext('JSON.stringify(explorer)',c);const frozenLife=vm.runInContext('JSON.stringify(ecosystem)',c);vm.runInContext('draw();',c);assert.equal(c.state().clockTime,t);assert.equal(vm.runInContext('JSON.stringify(explorer)',c),frozenBehavior,'pause freezes decisions and movement');assert.equal(vm.runInContext('JSON.stringify(ecosystem)',c),frozenLife,'pause freezes prey, hunter and respawn');const projected=JSON.stringify(c.state().section);
dom['view-mode'].value='slice';dom['view-mode'].onchange();vm.runInContext('draw();',c);assert.equal(c.state().viewMode,'slice');assert.equal(c.state().clockTime,t);assert(dom['view-label'].textContent.includes('截面'));assert(dom['slice-status'].textContent.startsWith('w = '));assert(c.state().section[0].faces.length>0);
dom['view-mode'].value='projection';dom['view-mode'].onchange();vm.runInContext('draw();',c);assert.equal(JSON.stringify(c.state().section),projected,'same frozen geometry after mode round trip');
dom.pause.onclick();vm.runInContext('draw();',c);assert(c.state().clockTime>t);
console.log('PASS: default projection, pause, slice toggle, honest labels, frozen round trip, resume.');
// 強制走過吞食、新生及碰撞繪圖分支，檢查座標有效且狀態堆疊平衡。
let stack=0,vertices=0;c.push=()=>stack++;c.pop=()=>{assert(stack>0);stack--;};
c.vertex=(...values)=>{assert(values.every(Number.isFinite));vertices++;};
vm.runInContext(`
  ecosystem.shatter(ecosystem.prey[0],{first:[0,0,0],second:[1,0,0],distance:1});
  ecosystem.emit('birth',ecosystem.prey[0].position,{preyId:0});
  ecosystem.emit('impact',[20,0,0]);
  ecosystem.effects.forEach(effect=>effect.age=.2);
  ecosystem.prey[0].birth=.2;
  draw();
`,c);
assert.equal(stack,0);assert(vertices>0);
dom.pause.onclick();const frozenEffects=vm.runInContext('JSON.stringify(ecosystem)',c);
vm.runInContext('draw();',c);assert.equal(vm.runInContext('JSON.stringify(ecosystem)',c),frozenEffects);
console.log('PASS: all effect rendering branches, finite vertices, balanced drawing groups, paused effects.');
