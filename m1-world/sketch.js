// 幾何環境原型：所有節點都是環境資訊，沒有生物或捕食行為。
const WORLD = { width: 1000, height: 460, limit: 140 };
const MOTION = { neighborhood: 80, spacing: 36, turnRate: 1.65, wallMargin: 65 };
let nodes = [], running = true, elapsed = 0, connection = 76;
let flowStrength = 0.7;
let view = { scale: 1, x: 0, y: 0 };
const ui = {};
// 固定地形與動態節點分開：它們是環境，不是生物。
const strata = [
  { x: 210, y: 145, r: 94, sides: 6, angle: -0.25 },
  { x: 730, y: 322, r: 108, sides: 5, angle: 0.2 },
  { x: 865, y: 105, r: 49, sides: 4, angle: Math.PI / 4 }
];
const regions = [
  { x: 500, y: 230, r: 75, title: '00 / 原點', detail: '幾何秩序的起點，節點在資訊場中流動。' },
  { x: 210, y: 145, r: 105, title: '02 / 平面沉積區', detail: '網格隆起表示資訊密度較高，節點在此放慢移動。' },
  { x: 730, y: 322, r: 110, title: '02 / 平面沉積區', detail: '面形成穩定的環境結構；它們不是生物。' },
  { x: 865, y: 105, r: 60, title: '02 / 小型沉積區', detail: '資訊流沿幾何密度的變化轉向，形成類似水流的運動。' }
];

function setup() {
  const host = document.getElementById('canvas-host');
  createCanvas(host.clientWidth, host.clientHeight).parent(host);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('loading').remove();
  describe('黑白數位地形由淡色起伏網格構成，資訊波緩慢通過地形，深色圓點在場中群集、漫步並隨流轉向。');
  for (const id of ['points', 'lines', 'planes', 'status', 'pause']) ui[id] = document.getElementById(id);
  document.getElementById('connection').addEventListener('input', event => {
    connection = Number(event.target.value);
    document.getElementById('distance').value = connection;
  });
  document.getElementById('flow').addEventListener('input', event => {
    flowStrength = Number(event.target.value) / 100;
    document.getElementById('flow-value').value = `${event.target.value}%`;
  });
  ui.pause.addEventListener('click', () => {
    running = !running;
    ui.pause.textContent = running ? '暫停' : '繼續';
    ui.status.textContent = running ? '環境運行中' : '觀測已暫停';
  });
  document.getElementById('reset').addEventListener('click', resetWorld);
  document.getElementById('capture').addEventListener('click', () => saveCanvas('m1-origin-world', 'png'));
  resetWorld();
}

function resetWorld() {
  randomSeed(42); // 固定初始配置，方便比較參數的差異。
  nodes = [];
  elapsed = 0;
  for (let i = 0; i < 82; i++) {
    addNode();
  }
}

function addNode(x = random(12, WORLD.width-12), y = random(12, WORLD.height-12)) {
  if (nodes.length >= WORLD.limit) return;
  const angle = random(TWO_PI), speed = random(18, 30);
  nodes.push({ x, y, vx: cos(angle) * speed, vy: sin(angle) * speed,
    heading: angle, speed, wander: 0, wanderTarget: random(-1.4, 1.4), wanderTimer: random(0.5, 2),
    baseSpeed: speed, speedTarget: speed, speedTimer: random(1,3) });
}

function unitVector(x, y) {
  const length = Math.hypot(x, y);
  return length > 0.00001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

function updateNodes(dt) {
  if (dt <= 0) return; // 暫停時連漫步計時與亂數狀態也不改變。
  elapsed += dt;
  // 所有點讀取同一幀的位置，避免陣列前面的點先移動而影響後面的點。
  const previous = nodes.map(n => ({ x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
  const nextVelocity = [];
  nodes.forEach((n, index) => {
    const here = previous[index];
    let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, count = 0;
    let closeCount = 0, spreadX = 0, spreadY = 0;
    previous.forEach((other, j) => {
      if (index === j) return;
      const dx = other.x-here.x, dy = other.y-here.y, distance = Math.hypot(dx,dy);
      if (distance < 55) closeCount++;
      // 較遠處只有很弱的密度排斥，避免相鄰小群逐漸併成一大團。
      if (distance > 0.001 && distance < 150) {
        const strength = (1-distance/150)*0.065;
        spreadX -= dx/distance*strength; spreadY -= dy/distance*strength;
      }
      if (distance < MOTION.neighborhood) {
        cx += dx; cy += dy; ax += other.vx; ay += other.vy; count++;
      }
      if (distance < MOTION.spacing) {
        if (distance < 0.001) {
          // 完全重疊也有離開方向，而且一對節點的方向相反。
          const angle = (Math.min(index,j)*13.37 + Math.max(index,j)*7.91);
          const sign = index < j ? 1 : -1;
          sx += Math.cos(angle)*sign; sy += Math.sin(angle)*sign;
        } else {
          const strength = 1-distance/MOTION.spacing;
          sx -= dx/distance*strength; sy -= dy/distance*strength;
        }
      }
    });
    const cohesion = unitVector(cx,cy), alignment = unitVector(ax,ay);
    const separation = unitVector(sx,sy);
    const crowding = Math.min(1, Math.hypot(sx,sy));
    const gathering = count ? Math.min(1, Math.hypot(cx/count,cy/count)/45) : 0;

    // 聚散只由三條局部規則決定：越密越重視分離，越鬆散越重視聚合。
    const density = Math.min(1, closeCount / 8);
    const cohesionWeight = 0.85 * (1-density*0.85);
    const alignmentWeight = 0.65 * (1-density*0.4);
    const separationWeight = 3.2 + density*2.2;
    // 個別速度目標緩慢改變；對齊只部分參考鄰居速度，保留個體差異。
    n.speedTimer -= dt;
    if (n.speedTimer <= 0) {
      n.speedTarget = n.baseSpeed * random(0.6,1.5);
      n.speedTimer += random(1.5,4);
    }
    const neighborSpeed = count ? Math.hypot(ax/count,ay/count) : n.speedTarget;
    const desiredSpeed = n.speedTarget*0.8 + neighborSpeed*0.2;
    const acceleration = Math.max(-8*dt,Math.min(8*dt,desiredSpeed-n.speed));
    n.speed = Math.max(10,Math.min(46,n.speed+acceleration));

    // 每隔一段時間抽新的偏轉目標，再逐漸靠近，保留漫步的連續性。
    n.wanderTimer -= dt;
    if (n.wanderTimer <= 0) {
      n.wanderTarget = random(-1.4,1.4);
      n.wanderTimer += random(0.6,2.2);
    }
    n.wander += (n.wanderTarget-n.wander)*(1-Math.exp(-2*dt));
    const wanderAngle = n.heading+n.wander;
    const margin = MOTION.wallMargin;
    const wallX = Math.max(0,(margin-n.x)/margin)-Math.max(0,(n.x-WORLD.width+margin)/margin);
    const wallY = Math.max(0,(margin-n.y)/margin)-Math.max(0,(n.y-WORLD.height+margin)/margin);
    const current = sampleField(n.x,n.y,elapsed);
    const targetX = Math.cos(wanderAngle)*0.85 + cohesion.x*gathering*cohesionWeight
      + alignment.x*alignmentWeight + separation.x*crowding*separationWeight + wallX*5 + spreadX
      + current.x*flowStrength*0.55;
    const targetY = Math.sin(wanderAngle)*0.85 + cohesion.y*gathering*cohesionWeight
      + alignment.y*alignmentWeight + separation.y*crowding*separationWeight + wallY*5 + spreadY
      + current.y*flowStrength*0.55;
    const targetAngle = Math.hypot(targetX,targetY) > 0.00001 ? Math.atan2(targetY,targetX) : n.heading;
    const difference = Math.atan2(Math.sin(targetAngle-n.heading),Math.cos(targetAngle-n.heading));
    n.heading += Math.max(-MOTION.turnRate*dt,Math.min(MOTION.turnRate*dt,difference));
    n.heading = Math.atan2(Math.sin(n.heading),Math.cos(n.heading));
    n.vx = Math.cos(n.heading)*n.speed;
    n.vy = Math.sin(n.heading)*n.speed;
    // 減速仍可見，但不讓固定沉積區成為長期累積點的陷阱。
    const pace = strata.some(s => Math.hypot(n.x-s.x,n.y-s.y)<s.r) ? 0.7 : 1;
    // 貼牆時夾住位置，持續平滑轉回；不瞬間反轉速度。
    // 外場提供額外平移；靠牆淡出，避免把節點持續推在牆上。
    const edge = Math.max(0,Math.min(1,(n.x-6)/50,(994-n.x)/50,(n.y-6)/50,(454-n.y)/50));
    nextVelocity.push({x:(n.vx+current.x*flowStrength*12*edge)*pace,
      y:(n.vy+current.y*flowStrength*12*edge)*pace});
  });
  if (!nodes.length) return;
  const mean = nextVelocity.reduce((sum,v)=>({x:sum.x+v.x/nodes.length,y:sum.y+v.y/nodes.length}),{x:0,y:0});
  const center = previous.reduce((sum,n)=>({x:sum.x+n.x/nodes.length,y:sum.y+n.y/nodes.length}),{x:0,y:0});
  // 只消除整群的共同平移，不消除各點相對於彼此的局部運動。
  // 中心回正是所有點相同的弱位移，並非每點朝中心吸引，因此不會壓縮星團。
  const stabilize = Math.min(1,Math.max(0,(nodes.length-1)/7));
  const returnX = Math.max(-3,Math.min(3,(WORLD.width/2-center.x)*0.035));
  const returnY = Math.max(-3,Math.min(3,(WORLD.height/2-center.y)*0.035));
  nodes.forEach((n,i)=>{
    const vx=nextVelocity[i].x+stabilize*(returnX-mean.x);
    const vy=nextVelocity[i].y+stabilize*(returnY-mean.y);
    n.x=Math.max(6,Math.min(WORLD.width-6,n.x+vx*dt));
    n.y=Math.max(6,Math.min(WORLD.height-6,n.y+vy*dt));
  });
}

function draw() {
  background(255);
  const dt = running ? Math.min(deltaTime / 1000, 0.05) : 0;
  updateNodes(dt);
  view.scale = Math.min((width - 44) / WORLD.width, (height - 44) / WORLD.height);
  view.x = (width - WORLD.width * view.scale) / 2;
  view.y = (height - WORLD.height * view.scale) / 2;
  push();
  translate(view.x, view.y);
  scale(view.scale);
  drawGrid();
  drawEnvironment();
  drawOrigin();
  const edges = [], neighbors = nodes.map(() => new Set());
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < connection) {
        edges.push([i, j]); neighbors[i].add(j); neighbors[j].add(i);
      }
    }
  }
  // 三條連線都存在時才畫面；沒有任何升維或生命邏輯。
  let planes = 0;
  noStroke(); fill(0, 10);
  for (const [i, j] of edges) {
    for (const k of neighbors[j]) {
      if (k > j && neighbors[i].has(k)) {
        const a = nodes[i], b = nodes[j], c = nodes[k];
        const area = Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) / 2;
        if (area > 24) {
          // 群集越密，單片面越淡，避免疊成黑塊。
          const density = Math.max(neighbors[i].size, neighbors[j].size, neighbors[k].size);
          fill(0, 8 / Math.max(1, density / 3));
          triangle(a.x, a.y, b.x, b.y, c.x, c.y); planes++;
        }
      }
    }
  }
  stroke(0, 40); strokeWeight(0.7 / view.scale);
  for (const [i, j] of edges) line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
  for (const n of nodes) {
    // 短方向線讓轉彎可以被看見，圓點仍是主要造形。
    stroke(0,70); strokeWeight(0.8/view.scale);
    line(n.x-Math.cos(n.heading)*7,n.y-Math.sin(n.heading)*7,n.x,n.y);
    noStroke(); fill(20); circle(n.x,n.y,3.6/Math.sqrt(view.scale));
  }
  pop();
  ui.points.textContent = String(nodes.length).padStart(3, '0');
  ui.lines.textContent = String(edges.length).padStart(3, '0');
  ui.planes.textContent = String(planes).padStart(3, '0');
  const mx = (mouseX-view.x)/view.scale, my = (mouseY-view.y)/view.scale;
  const region = regions.find(r => Math.hypot(mx-r.x, my-r.y) < r.r);
  document.getElementById('observation').textContent = region
    ? `${region.title} — ${region.detail}`
    : '淡網格顯示資訊密度與波動；圓點會隨流偏移，進入沉積區時減速。';
}

// 高度是資訊密度的視覺表示，不代表二維節點升維。
// 網格與節點共用這個函式：幾何隆起形成緩流區，傳播波形成流向。
function sampleField(x, y, time) {
  let height = 0, gx = 0, gy = 0;
  for (const s of strata) {
    const dx = x-s.x, dy = y-s.y, radius2 = s.r*s.r;
    const hill = 48*Math.exp(-(dx*dx+dy*dy)/radius2);
    height += hill; gx += -2*dx/radius2*hill; gy += -2*dy/radius2*hill;
  }
  const phase = x*0.012+y*0.009-time*0.48;
  const cross = y*0.018-x*0.004+time*0.23;
  height += flowStrength*(10*Math.sin(phase)+5*Math.sin(cross));
  gx += flowStrength*(0.12*Math.cos(phase)-0.02*Math.cos(cross));
  gy += flowStrength*(0.09*Math.cos(phase)+0.09*Math.cos(cross));
  // 保留同一張高度圖，移除固定右下向量；弱場保持弱，不強制放大成單位速度。
  const magnitude = Math.max(1,Math.hypot(gx,gy)*1.6);
  return { height, x: -gy*1.6/magnitude, y: gx*1.6/magnitude };
}

function terrainPoint(x, y) {
  const field = sampleField(x,y,elapsed);
  const edge = Math.sin(Math.PI*x/WORLD.width)*Math.sin(Math.PI*y/WORLD.height);
  return { x, y: y-field.height*edge*0.72 };
}

function drawEnvironment() {
  push();
  // 橫向細線為主，稀疏縱線為輔，避免網格搶過圓點。
  noFill(); strokeWeight(0.65 / view.scale);
  for (let y = 20; y < WORLD.height; y += 20) {
    stroke(0, y%60 === 0 ? 29 : 16);
    beginShape();
    for (let x = 0; x <= WORLD.width; x += 12.5) {
      const p = terrainPoint(x,y); vertex(p.x,p.y);
    }
    endShape();
  }
  stroke(0, 10);
  for (let x = 40; x < WORLD.width; x += 40) {
    beginShape();
    for (let y = 0; y <= WORLD.height; y += 10) {
      const p = terrainPoint(x,y); vertex(p.x,p.y);
    }
    endShape();
  }
  pop();
}

function drawGrid() {
  noFill(); stroke(0, 48); strokeWeight(1 / view.scale);
  rect(0, 0, WORLD.width, WORLD.height);
  // 四角加粗，讓平面有「被收容在箱中」的邊界感。
  stroke(0, 90); strokeWeight(1 / view.scale);
  for (const [x, y, sx, sy] of [[0,0,1,1],[1000,0,-1,1],[0,460,1,-1],[1000,460,-1,-1]]) {
    line(x, y, x + 14*sx, y); line(x, y, x, y + 14*sy);
  }
}

function drawOrigin() {
  const x = WORLD.width / 2, y = WORLD.height / 2;
  push();
  noFill(); strokeWeight(0.7 / view.scale);
  // 原點維持低對比，讓主要動態來自場與群集。
  stroke(0, 18); circle(x, y, 42 + sin(elapsed * 0.45) * 4);
  stroke(0, 65);
  line(x - 4, y, x + 4, y); line(x, y - 4, x, y + 4);
  pop();
}

function mousePressed(event) {
  if (event.target !== document.querySelector('#canvas-host canvas')) return;
  const x = (mouseX - view.x) / view.scale, y = (mouseY - view.y) / view.scale;
  if (x < 0 || x > WORLD.width || y < 0 || y > WORLD.height) return;
  for (let i = 0; i < 5; i++) addNode();
}

function windowResized() {
  const host = document.getElementById('canvas-host');
  resizeCanvas(host.clientWidth, host.clientHeight);
}
