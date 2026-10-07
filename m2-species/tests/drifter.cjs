// =============================================================================
// M2 物種自動化測試：截游體（Section Drifter）幾何、生命週期與捕食守恆
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

let seed = 42;
function mockRandom(a, b) {
  if (a === undefined) return (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  if (b === undefined) { b = a; a = 0; }
  seed = (1664525 * seed + 1013904223) >>> 0;
  return a + (b - a) * (seed / 4294967296);
}

// 建立模擬 p5.js 與 DOM 環境
const ctx = vm.createContext({
  Math,
  Set,
  console,
  assert,
  TWO_PI: Math.PI * 2,
  random: mockRandom,
  randomSeed(n) { seed = n; },
  document: {
    getElementById(id) {
      return {
        textContent: '',
        value: '',
        addEventListener() {},
        remove() {}
      };
    },
    querySelector() { return {}; }
  },
  createCanvas() { return { parent() {} }; },
  pixelDensity() {},
  describe() {},
  saveCanvas() {},
  resizeCanvas() {},
  background() {},
  push() {},
  pop() {},
  translate() {},
  scale() {},
  fill() {},
  noFill() {},
  stroke() {},
  noStroke() {},
  strokeWeight() {},
  circle() {},
  rect() {},
  line() {},
  triangle() {},
  beginShape() {},
  vertex() {},
  endShape() {},
  CLOSE: 'close',
  width: 1000,
  height: 460,
  mouseX: 500,
  mouseY: 230,
  deltaTime: 16.666
});

const sketchCode = fs.readFileSync(path.join(__dirname, '../sketch.js'), 'utf8');
vm.runInContext(sketchCode, ctx);

vm.runInContext(`
  // 新造型：固定身體、連續變形、空缺與真正閉合的捕食判定。
  resetWorld();
  assert.equal(drifter.shape.type, 'hybrid');
  const hybrid = drifter;
  hybrid.x = 500;
  hybrid.y = 230;
  hybrid.progress = 0.5;
  hybrid.duration = 1000;
  hybrid.baseAngle = hybrid.angle = 0;
  hybrid.z = 0;
  nodes = [];
  hybrid.sections = hybrid.computeSections(0.5);
  assert.equal(hybrid.bodyFragments.length, DRIFTER.fragments);
  assert.equal(hybrid.contours.length, DRIFTER.rings.length * DRIFTER.layers * 2);
  const direction = curve => {
    const a = curve.linePoints[0], b = curve.linePoints[curve.linePoints.length - 1];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  for (let index = 0; index < DRIFTER.rings.length; index++) {
    const base = hybrid.contours.find(c => c.index === index && c.layer === 0);
    const outer = hybrid.contours.find(c => c.index === index && c.layer === 2);
    assert(Math.abs(Math.sin(direction(base) - direction(outer))) > 0.1,
      '疊相必須有朝向差，不能只平移重描主輪廓');
  }
  for (const fragment of hybrid.bodyFragments) {
    assert(fragment.owner >= 0 && fragment.owner < DRIFTER.rings.length);
    assert(fragment.points.length >= 3, '碎片應是延伸弧段，不是裝飾點');
    assert(fragment.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  assert(!hybrid.insideSections({x:500,y:230}), '待機中央空缺不可誤判為實體');
  const stillBody = JSON.stringify(hybrid.contours);
  hybrid.computeSections(0.5);
  assert.equal(JSON.stringify(hybrid.contours), stillBody, '相同時間不可重新抽亂數造成閃爍');
  // 隨機曲率連續演變，不是兩個固定形狀往返，也不在時間軌接點跳躍。
  const morphFrames = [];
  for (const time of [2, 6.3, 10.7, 15.1]) {
    hybrid.bodyTime = time;
    hybrid.computeSections(0.5);
    morphFrames.push(JSON.stringify(hybrid.morphology));
  }
  assert.equal(new Set(morphFrames).size, 4, '不同時刻應產生不同的截面組合');
  const track = 3;
  const boundary = (3 - track * 0.371) * DRIFTER.morphPeriod * (0.72 + track * 0.137);
  assert(Math.abs(hybrid.morphNoise(track, boundary - 0.0001) -
    hybrid.morphNoise(track, boundary + 0.0001)) < 0.001, '隨機目標交接時不可突然跳變');
  hybrid.bodyTime = 0;
  hybrid.computeSections(0.5);
  hybrid.update(0.1);
  assert.equal(hybrid.state, 'Idle');
  assert.equal(hybrid.x, 500, '待機時不漂移');
  assert.notEqual(JSON.stringify(hybrid.contours), stillBody, '待機仍持續呼吸');
  const frozenHybrid = JSON.stringify(hybrid);
  hybrid.update(0);
  assert.equal(JSON.stringify(hybrid), frozenHybrid, '暫停需凍結所有造型與狀態');
  hybrid.update(DRIFTER.idleTime + 0.1);
  assert.equal(hybrid.state, 'Moving');
  const beforeMove = hybrid.x;
  hybrid.update(0.1);
  assert.notEqual(hybrid.x, beforeMove);

  hybrid.x = 500;
  hybrid.y = 230;
  hybrid.progress = 0.5;
  hybrid.dartCooldown = 0;
  const prey = { x: 550, y: 230, vx: 0, vy: 0 };
  nodes = [prey];
  hybrid.update(0.1);
  assert.equal(hybrid.state, 'Sensing');
  assert(hybrid.sense.x > 0, '感知方向應朝向獵物');
  nodes.push({x:hybrid.x + 1,y:230,vx:0,vy:0});
  hybrid.update(0.1);
  assert.equal(hybrid.target, prey, '新近鄰不應造成鎖定目標閃動');
  nodes = [prey];
  hybrid.update(DRIFTER.senseTime);
  assert.equal(hybrid.state, 'Feeding');
  assert.equal(nodes.length, 1, '未閉合之前不得吞入');
  hybrid.update(DRIFTER.windup + DRIFTER.burstTime + DRIFTER.closeTime);
  assert.equal(nodes.length, 0, '閉合後才能捕食空缺內的獵物');
  assert.equal(hybrid.held.length, 1);
  assert(hybrid.phaseShock > 0, '捕食後應出現相位錯位');
  hybrid.update(DRIFTER.recoveryTime + 0.3);
  assert.equal(hybrid.feed, null);
  assert.equal(hybrid.state, 'Idle');
  assert.equal(hybrid.consumed, 1);
  assert.equal(hybrid.held.length, 0);
  assert(hybrid.phaseShock < 0.08, '相位錯位應逐漸消退');

  // 逃出包圍的獵物不會因為曾被鎖定而被遠端移除。
  hybrid.target = {x:550,y:230,vx:0,vy:0};
  nodes = [hybrid.target];
  hybrid.beginFeeding();
  nodes[0].x = 900;
  hybrid.update(DRIFTER.windup + DRIFTER.burstTime + DRIFTER.closeTime + 0.05);
  assert.equal(nodes.length, 1, '逃出包圍的獵物必須存活');
  assert.equal(hybrid.consumed, 1, '空捕不可增加吞噬計數');
  hybrid.display(1);

  // 深度改變會使局部輪廓改變；完整離開觀察平面後不可殘留實體。
  hybrid.closure = 0;
  hybrid.z = 0;
  hybrid.computeSections(0.5);
  const middleBody = JSON.stringify(hybrid.contours);
  hybrid.z = hybrid.extent * 0.7;
  hybrid.computeSections(0.5);
  assert.notEqual(JSON.stringify(hybrid.contours), middleBody);
  assert.equal(hybrid.computeSections(1).length, 0);
  assert.equal(hybrid.contours.length + hybrid.bodyFragments.length, 0);
  console.log('PASS: 斷環疊相、四狀態、目標鎖定、閉合捕食、逃脫與恢復');
`, ctx);

vm.runInContext(`
  resetWorld();
  drifter.shape = { type: 'sphere', name: '球體', radius: 20, scale: 1 };
  drifter.extent = 20;
  drifter.path = { start: { x: 500, y: 230 }, middle: { x: 500, y: 230 }, end: { x: 500, y: 230 } };
  drifter.x = 500;
  drifter.y = 230;
  drifter.progress = 0.5;
  drifter.duration = 100;
  drifter.sections = drifter.computeSections(0.5);
  drifter.dartCooldown = 0;
  nodes = [{ x: 590, y: 230, vx: 0, vy: 0 }];
  drifter.update(0.18);
  assert(drifter.dart, '附近有獵物時應蓄力');
  assert(drifter.x < 505, '蓄力時不應提前衝到獵物');
  const frozen = JSON.stringify(drifter);
  drifter.update(0);
  assert.equal(JSON.stringify(drifter), frozen, '暫停時動作與特效應凍結');
  drifter.update(0.16);
  assert(drifter.x > 570, '應在短時間內完成明顯位移');
  assert.equal(nodes.length, 0, '突進應實際捕獲路徑上的獵物');
  assert(drifter.ripples.length > 0 && drifter.echoes.length > 0, '突進應留下漣漪與殘影');
  drifter.update(1);
  assert.equal(drifter.echoes.length + drifter.ripples.length, 0, '特效應自行消退');
`, ctx);

vm.runInContext(`
  // 1. 驗證 SectionDrifter 類別與初始狀態
  assert(typeof SectionDrifter === 'function', 'SectionDrifter 必須是 ES6 類別');
  const d = new SectionDrifter();
  assert(d.shape && d.shape.name, '必須具有三維形態');
  assert(d.extent > 0, '三維跨度必須大於 0');
  assert(d.path && d.path.start && d.path.end, '必須具有穿越路徑');

  // 2. 驗證環體 (Torus) 的數學切面解析
  d.shape = { type: 'torus', name: '環體 (Torus)', major: 40, tube: 20, scale: 1 };
  d.extent = 60;
  d.angle = 0;
  d.spin = 0;
  d.x = 500;
  d.y = 230;

  // 在邊界外 (progress <= 0 或 >= 1) 切面應為空
  assert.equal(d.computeSections(0).length, 0, '尚未進入平面時截面應為 0');
  assert.equal(d.computeSections(1).length, 0, '完全離開平面後截面應為 0');

  // progress = 0.5 時，depth = 0，恰切過環體中心，應分裂為兩個分離的對稱截面
  const centerSections = d.computeSections(0.5);
  assert.equal(centerSections.length, 2, '環體中心截面必須剛好分成兩個獨立截面');

  // 驗證中央截面頂點均落在環體半徑 20、圓心位於 (500 ± 40, 230) 的圓周上
  for (let sIdx = 0; sIdx < 2; sIdx++) {
    const sec = centerSections[sIdx];
    const expectedCenter = sIdx === 0 ? 500 - 40 : 500 + 40;
    for (const p of sec.points) {
      const dist = Math.hypot(p.x - expectedCenter, p.y - 230);
      assert(Math.abs(dist - 20) < 1e-4, '中心切片頂點應落在半徑為 tube 的圓周上');
    }
  }

  // 驗證三維環體中央空洞不屬於實心生物體（中央空隙不捕食）
  d.z = 0;
  d.sections = centerSections;
  assert(!d.insideSections({ x: 500, y: 230 }), '環體中央空隙不可判定為生物體內！');
  assert(d.insideSections({ x: 540, y: 230 }), '環體右側截面中心必須在生物體內');
  assert(d.insideSections({ x: 460, y: 230 }), '環體左側截面中心必須在生物體內');

  // 3. 驗證球體 (Sphere) 的數學切面解析
  d.shape = { type: 'sphere', name: '球體 (Sphere)', radius: 30, scale: 1 };
  d.extent = 30;
  const sphereSec = d.computeSections(0.5);
  assert.equal(sphereSec.length, 1, '球體中心切片應為單一截面');
  for (const p of sphereSec[0].points) {
    const dist = Math.hypot(p.x - 500, p.y - 230);
    assert(Math.abs(dist - 30) < 1e-4, '球體中心切片半徑應為 radius');
  }

  // 4. 驗證捕食與節點淡出守恆
  resetWorld();
  const initialNodesCount = nodes.length;
  assert.equal(initialNodesCount, 82, '初始節點數應為 82');

  // 設定 drifter 位於 (500, 230)，路徑固定在 (500, 230)
  drifter.shape = { type: 'sphere', name: '球體 (Sphere)', radius: 50, scale: 1 };
  drifter.extent = 50;
  drifter.path = { start: { x: 500, y: 230 }, middle: { x: 500, y: 230 }, end: { x: 500, y: 230 } };
  drifter.progress = 0.49;
  drifter.duration = 20;
  drifter.held = [];
  drifter.consumed = 0;
  nodes = [{ x: 500, y: 230, heading: 0, speed: 20 }];

  // 更新一幀，節點應被包入 drifter.held
  drifter.update(0.05);
  assert.equal(nodes.length, 0, '被捕食節點應從 nodes 移除');
  assert.equal(drifter.held.length, 1, '被捕食節點應進入 held 隊列');
  assert.equal(drifter.consumed, 0, '剛被包入尚未淡出完成');

  // 推進時間使其淡出
  for (let step = 0; step < 25; step++) {
    drifter.update(0.05);
  }
  assert.equal(drifter.held.length, 0, '淡出完成後 held 應清空');
  assert.equal(drifter.consumed, 1, '淡出完成後 consumed 應增加 1');

  // 5. 驗證追捕（Pursuit）與逃跑（Evasion）轉向力學
  drifter.shape = { type: 'sphere', name: '球體 (Sphere)', radius: 30, scale: 1 };
  drifter.extent = 30;
  drifter.x = 500;
  drifter.y = 230;
  drifter.sections = drifter.computeSections(0.5); // 圓心在 (500, 230)
  
  // (a) 警戒半徑內應產生逃跑力與恐慌值
  const nearEvasion = drifter.getEvasionForce({ x: 540, y: 230 });
  assert(nearEvasion.panicLevel > 0, '警戒半徑 75px 內應產生恐慌值');
  assert(nearEvasion.fx > 0, '逃跑向量 X 應向右背離截面中心');
  assert(Math.abs(nearEvasion.fy) < 1e-4, '水平線上逃跑向量 Y 分量應近乎為 0');

  // (b) 警戒半徑外恐慌值為 0，無逃跑力
  const farEvasion = drifter.getEvasionForce({ x: 100, y: 100 });
  assert.equal(farEvasion.panicLevel, 0, '遠離截面時恐慌值應為 0');
  assert.equal(farEvasion.fx, 0, '遠離截面時無逃跑力 X');
  assert.equal(farEvasion.fy, 0, '遠離截面時無逃跑力 Y');

  // (c) 雙截面夾擊（Pincer Effect）：環體雙截面中心為 (460, 230) 與 (540, 230)
  drifter.shape = { type: 'torus', name: '環體 (Torus)', major: 40, tube: 20, scale: 1 };
  drifter.extent = 60;
  drifter.angle = 0;
  drifter.spin = 0;
  drifter.x = 500;
  drifter.y = 230;
  drifter.sections = drifter.computeSections(0.5); // 分裂為雙截面
  assert.equal(drifter.sections.length, 2, '中心切片應為雙截面');
  // 測試落入雙截面中間偏下方的節點 (500, 240)
  const pincerEvasion = drifter.getEvasionForce({ x: 500, y: 240 });
  assert(pincerEvasion.panicLevel > 0, '夾擊狹縫中的節點應感受到恐慌');
  assert(pincerEvasion.fy > 0, '左右兩側截面同時推擠，節點應順著夾縫向下逃逸 (fy > 0)');
  assert(Math.abs(pincerEvasion.fx) < 1e-4, '雙截面對稱位置上水平逃跑力應相互抵消');

  // 6. 驗證長時間運行與多輪穿越穩定性（模擬 6000 幀，約 100 秒）
  resetWorld();
  for (let frame = 0; frame < 6000; frame++) {
    updateNodes(1 / 60);
    drifter.update(1 / 60);

    // 檢查坐標有效性
    assert(Number.isFinite(drifter.x) && Number.isFinite(drifter.y));
    assert(Number.isFinite(drifter.z));
    assert.equal(nodes.length + drifter.held.length + drifter.consumed, 82, '節點總數應守恆');
    assert(drifter.echoes.length <= 8 && drifter.ripples.length <= 2, '短暫特效不可無限累積');
    assert(drifter.bodyFragments.length <= DRIFTER.fragments, '身體碎片數量固定');
    for (const fragment of drifter.bodyFragments) {
      for (const p of fragment.points) {
        assert(p.x >= 0 && p.x <= WORLD.width && p.y >= 0 && p.y <= WORLD.height, '延伸截面不可離開畫布');
      }
    }
    for (const contour of drifter.contours) {
      for (const p of contour.points) {
        assert(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert(p.x >= 0 && p.x <= WORLD.width && p.y >= 0 && p.y <= WORLD.height, '疊相輪廓不可離開畫布');
      }
    }
    for (const sec of drifter.sections) {
      for (const p of sec.points) {
        assert(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 460, '截面點不可超出世界邊界');
      }
    }
  }

  // 驗證已成功經歷多次穿越與三維巡游
  assert(drifter.cycle >= 2, '長時間運行應經歷多次穿越週期');
  assert(drifter.consumed > 0, '長時間運行應成功捕食並帶離節點');

  // 6. 驗證 draw() 渲染無異常
  running = true;
  draw();
  running = false;
  draw();

  console.log('✅ PASS: 所有截游體 OOP 類別測試、三維切面幾何、雙截面分離、捕食淡出守恆與世界運行測試全數通過！');
`, ctx);
