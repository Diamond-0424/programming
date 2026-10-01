// =============================================================================
// M2 物種：截游體（Section Drifter）與二維幾何生態層
// 
// 世界觀依據（世界觀整理.txt）：
// 1. 宇宙重啟後由數學與幾何規則構成：點 → 線 → 面 → 體。
// 2. 低維生命無法主動升維，高維生命可穿越低維世界。
// 3. 截游體（Section Drifter）是生活在三維空間的高維生命，週期性穿越二維生態層進行覓食。
// 4. 二維觀察者永遠看不見牠的三維全貌，只能看見截面隨時間變化：
//    · → ○ → ◯ → ○ ○ → ◯ → ○ → · → 消失。
// 5. 捕食行為：當三維生命切過二維平面，落入截面範圍內的低維節點會被包入並帶離平面。
// =============================================================================

const WORLD = { width: 1000, height: 460, limit: 140 };
const MOTION = { neighborhood: 80, spacing: 36, turnRate: 1.65, wallMargin: 65 };

let nodes = [];
let running = true;
let elapsed = 0;
let connection = 76;
let flowStrength = 0.7;
let view = { scale: 1, x: 0, y: 0 };
let drifter = null;
const ui = {};

// 固定地形與動態節點分開：它們是環境沉積，不是生物
const strata = [
  { x: 210, y: 145, r: 94, sides: 6, angle: -0.25 },
  { x: 730, y: 322, r: 108, sides: 5, angle: 0.2 },
  { x: 865, y: 105, r: 49, sides: 4, angle: Math.PI / 4 }
];

const regions = [
  { x: 500, y: 230, r: 75, title: '00 / 原點 (Origin)', detail: '幾何秩序的原點標記，節點在資訊場中緩慢迴旋。' },
  { x: 210, y: 145, r: 105, title: '02 / 平面沉積區', detail: '網格隆起表示資訊密度較高，節點在此放慢移動。' },
  { x: 730, y: 322, r: 110, title: '02 / 平面沉積區', detail: '面形成穩定的幾何環境結構；它們不是生物。' },
  { x: 865, y: 105, r: 60, title: '02 / 小型沉積區', detail: '資訊流沿幾何密度的變化轉向，引導節點流向。' }
];

// =============================================================================
// 物件導向類別：SectionDrifter（截游體）
// =============================================================================
class SectionDrifter {
  constructor() {
    this.x = 500;
    this.y = 230;
    this.z = 0;                 // 三維深度座標，z = 0 恰為二維觀察平面
    this.angle = 0;             // 切面朝向角
    this.spin = 0;              // 旋轉角速度
    this.progress = 0;          // 本次穿越進度 (0 ~ 1)
    this.cycle = 0;             // 穿越次數計數
    this.phase = '三維巡游';    // 當前生命週期階段描述
    this.isCruising = false;    // 是否處於三維巡游狀態（已脫離二維平面）
    this.cruiseTimer = 0;       // 巡游剩餘時間

    // 捕食與帶離系統
    this.held = [];             // 正在被包入並抽離二維層的節點 [{x, y, age}]
    this.consumed = 0;          // 累計帶離平面的二維節點數
    this.fadeDuration = 0.9;    // 節點原地淡出被帶走的時間（秒）

    // 幾何形體與取樣
    this.samples = 128;         // 截面輪廓的取樣點數
    this.sections = [];         // 當前二維切面的多邊形頂點 [{points: [...]}]

    // 啟動第一輪穿越
    this.startPassage();
  }

  // 開始新一輪三維穿越
  startPassage() {
    this.cycle++;
    this.isCruising = false;
    this.progress = 0;

    // 抽選三維本體形態（以世界觀最經典的「環體 Torus」為主，呈現雙截面分離）
    this.shape = this.chooseShape();
    this.extent = this.calcDepthExtent(this.shape);
    this.duration = random(16, 24);    // 每次穿越二維平面耗時 16~24 秒
    this.restDuration = random(4, 7);  // 穿越結束後在三維空間巡游 4~7 秒

    // 隨機生成一條穿越畫布的平滑二次貝茲曲線路徑
    this.path = this.generatePath(this.calcScreenRadius(this.shape));
    this.baseAngle = random(TWO_PI);
    this.angle = this.baseAngle;
    this.spin = random(-0.5, 0.5);
    this.held = [];
    this.phase = '截面進入';
  }

  // 根據世界觀抽選三維形態
  chooseShape() {
    const roll = random();
    const scale = random(0.85, 1.35);

    if (roll < 0.6) {
      // 核心形態：環體 (Torus) —— 呈現「點 → 橢圓 → 收腰 → 雙截面 → 接回 → 消失」
      const major = 38 * scale;
      const tube = 19 * scale;
      return { type: 'torus', name: '環體 (Torus)', major, tube, scale };
    } else if (roll < 0.75) {
      // 球體 (Sphere) —— 呈現「點 → 圓形擴張 → 圓形縮小 → 消失」
      return { type: 'sphere', name: '球體 (Sphere)', radius: 32 * scale, scale };
    } else if (roll < 0.88) {
      // 橢球 (Ellipsoid) —— 呈現橢圓截面變化
      return {
        type: 'ellipsoid',
        name: '橢球 (Ellipsoid)',
        rx: 36 * scale,
        ry: 24 * scale,
        rz: 30 * scale,
        scale
      };
    } else {
      // 斜切立方體 (Cube) —— 呈現邊數隨深度改變的多邊形截面
      return {
        type: 'cube',
        name: '斜切立方體 (Cube)',
        half: 25 * scale,
        scale,
        tiltX: random(-0.6, 0.6),
        tiltY: random(-0.6, 0.6)
      };
    }
  }

  // 計算三維形體在 Z 軸（深度）上的半徑跨度
  calcDepthExtent(shape) {
    if (shape.type === 'sphere') return shape.radius;
    if (shape.type === 'ellipsoid') return shape.rz;
    if (shape.type === 'torus') return shape.major + shape.tube;
    const { half, tiltX, tiltY } = shape;
    return half * (Math.abs(Math.cos(tiltX) * Math.sin(tiltY)) +
      Math.abs(Math.sin(tiltX)) + Math.abs(Math.cos(tiltX) * Math.cos(tiltY)));
  }

  // 計算形體在二維投影上的最大半徑，用於路徑邊界保護
  calcScreenRadius(shape) {
    if (shape.type === 'sphere') return shape.radius;
    if (shape.type === 'ellipsoid') return Math.hypot(shape.rx, shape.ry);
    if (shape.type === 'torus') return shape.major + shape.tube;
    return Math.sqrt(3) * shape.half;
  }

  // 隨機產生平滑穿越路徑，確保起迄點跨度與邊界安全
  generatePath(radius) {
    const margin = Math.min(140, Math.max(70, radius + 20));
    const left = margin, right = WORLD.width - margin;
    const top = margin, bottom = WORLD.height - margin;
    let start = { x: random(left, right), y: random(top, bottom) };
    let end = { x: random(left, right), y: random(top, bottom) };
    let attempts = 0;
    while (Math.hypot(start.x - end.x, start.y - end.y) < 280 && attempts < 50) {
      end = { x: random(left, right), y: random(top, bottom) };
      attempts++;
    }
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const bend = random(-0.35, 0.35) * Math.min(220, len * 0.5);
    const middle = {
      x: Math.max(left, Math.min(right, (start.x + end.x) / 2 - (dy / len) * bend)),
      y: Math.max(top, Math.min(bottom, (start.y + end.y) / 2 + (dx / len) * bend))
    };
    return { start, middle, end };
  }

  // 深度座標：進度 progress 由 0 到 1，深度從 +extent 降至 -extent，垂直貫穿 z = 0
  getDepth(progress) {
    return this.extent * (1 - 2 * progress);
  }

  // 局部切面座標轉至二維世界坐標
  toWorld(u, v) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return {
      x: this.x + u * c - v * s,
      y: this.y + u * s + v * c
    };
  }

  // 解析求得當前切面邊界頂點
  computeSections(progress) {
    if (progress <= 0 || progress >= 1) return [];
    const depth = this.getDepth(progress);
    const shape = this.shape;

    // 1. 球體與橢球：解橢圓二次方程
    if (shape.type === 'sphere' || shape.type === 'ellipsoid') {
      const rx = shape.type === 'sphere' ? shape.radius : shape.rx;
      const ry = shape.type === 'sphere' ? shape.radius : shape.ry;
      const rz = shape.type === 'sphere' ? shape.radius : shape.rz;
      const factor = 1 - (depth * depth) / (rz * rz);
      if (factor <= 0) return [];
      const points = [];
      const currentRx = rx * Math.sqrt(factor);
      const currentRy = ry * Math.sqrt(factor);
      for (let i = 0; i < this.samples; i++) {
        const a = (i * Math.PI * 2) / this.samples;
        points.push(this.toWorld(currentRx * Math.cos(a), currentRy * Math.sin(a)));
      }
      return [{ points }];
    }

    // 2. 環體 (Torus)：解螺旋截面方程 (Spiric Section)
    // (sqrt(u^2 + depth^2) - R)^2 + v^2 = r^2
    if (shape.type === 'torus') {
      const R = shape.major, r = shape.tube;
      const outer2 = (R + r) ** 2 - depth * depth;
      if (outer2 <= 0) return [];
      const outer = Math.sqrt(outer2);
      const inner2 = (R - r) ** 2 - depth * depth;
      const inner = inner2 > 0 ? Math.sqrt(inner2) : 0;

      // 當 |depth| < R - r 時，切過中央空隙，自然分裂為兩個分離的獨立截面！
      const ranges = inner > 0 ? [[-outer, -inner], [inner, outer]] : [[-outer, outer]];
      return ranges.map(([left, right]) => {
        const points = [];
        for (let i = 0; i < this.samples; i++) {
          const a = (i * Math.PI * 2) / this.samples;
          const u = (left + right) / 2 + ((right - left) / 2) * Math.cos(a);
          const radial = Math.hypot(u, depth) - R;
          const diff = r * r - radial * radial;
          const v = (i <= this.samples / 2 ? 1 : -1) * (diff > 0 ? Math.sqrt(diff) : 0);
          points.push(this.toWorld(u, v));
        }
        return { points };
      });
    }

    // 3. 斜切立方體：計算 12 條立體稜線與 z = depth 切面的交點並逆時針排序
    if (shape.type === 'cube') {
      const h = shape.half;
      const cx = Math.cos(shape.tiltX), sx = Math.sin(shape.tiltX);
      const cy = Math.cos(shape.tiltY), sy = Math.sin(shape.tiltY);
      const vertices = [];
      for (let i = 0; i < 8; i++) {
        const x = (i & 1) ? h : -h, y = (i & 2) ? h : -h, z = (i & 4) ? h : -h;
        const zY = -sy * x + cy * z;
        vertices.push({ x: cy * x + sy * z, y: cx * y - sx * zY, z: sx * y + cx * zY });
      }
      const points = [];
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          if ((i ^ j) === 1 || (i ^ j) === 2 || (i ^ j) === 4) {
            const a = vertices[i], b = vertices[j];
            const da = a.z - depth, db = b.z - depth;
            if (Math.abs(da) < 1e-8) points.push({ x: a.x, y: a.y });
            if (da * db < 0) {
              const t = da / (da - db);
              points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            }
          }
        }
      }
      const unique = [];
      for (const p of points) {
        if (!unique.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 1e-7)) unique.push(p);
      }
      if (unique.length < 3) return [];
      const center = unique.reduce((s, p) => ({ x: s.x + p.x / unique.length, y: s.y + p.y / unique.length }), { x: 0, y: 0 });
      unique.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
      return [{ points: unique.map(p => this.toWorld(p.x, p.y)) }];
    }

    return [];
  }

  // 判斷點是否位於截游體實心幾何內部（捕食判定）
  insideSections(point) {
    if (!this.sections.length || this.isCruising) return false;
    const dx = point.x - this.x, dy = point.y - this.y;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const depth = this.z;
    const shape = this.shape;

    if (shape.type === 'sphere') {
      return u * u + v * v + depth * depth <= shape.radius * shape.radius;
    }
    if (shape.type === 'ellipsoid') {
      return (u * u) / (shape.rx * shape.rx) + (v * v) / (shape.ry * shape.ry) + (depth * depth) / (shape.rz * shape.rz) <= 1;
    }
    if (shape.type === 'torus') {
      // 三維環體解析判定：甜甜圈中央空洞不屬於實體，點不會被誤捕食！
      return (Math.hypot(u, depth) - shape.major) ** 2 + v * v <= shape.tube * shape.tube;
    }
    if (shape.type === 'cube') {
      return this.sections.some(sec => this.pointInPolygon(point, sec.points));
    }
    return false;
  }

  pointInPolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > point.y) !== (b.y > point.y) &&
          point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  // 每幀更新生命週期、位置、切面與捕食
  update(dt) {
    if (dt <= 0) return;

    // 1. 處理被包入節點的原地淡出（被帶離平面，進入三維）
    this.held = this.held.filter(n => {
      n.age += dt;
      if (n.age < this.fadeDuration) return true;
      this.consumed++;
      return false;
    });

    // 2. 處理三維巡游等待
    if (this.isCruising) {
      this.cruiseTimer -= dt;
      if (this.cruiseTimer <= 0) {
        this.startPassage();
      }
      return;
    }

    // 3. 推進穿越進度
    this.progress += dt / this.duration;

    // 4. 穿越結束，進入三維巡游
    if (this.progress >= 1) {
      this.progress = 1;
      this.isCruising = true;
      this.cruiseTimer = this.restDuration;
      this.sections = [];
      this.phase = '三維巡游';
      this.consumed += this.held.length;
      this.held = [];
      return;
    }

    // 5. 計算平面投影軌跡（二次貝茲曲線）
    const t = this.progress;
    const inv = 1 - t;
    this.x = inv * inv * this.path.start.x + 2 * inv * t * this.path.middle.x + t * t * this.path.end.x;
    this.y = inv * inv * this.path.start.y + 2 * inv * t * this.path.middle.y + t * t * this.path.end.y;
    this.angle = this.baseAngle + this.spin * Math.sin(Math.PI * t);
    this.z = this.getDepth(t);

    // 6. 計算當前二維截面幾何
    this.sections = this.computeSections(t);

    // 7. 更新生命階段描述
    if (this.shape.type === 'torus') {
      const neck = Math.abs(Math.abs(this.z) - (this.shape.major - this.shape.tube));
      if (this.sections.length === 2) {
        this.phase = '同體・雙截面 (分開覓食)';
      } else if (neck < 5) {
        this.phase = '臨界頸部 (收腰過渡)';
      } else if (t < 0.5) {
        this.phase = '截面擴張 (進入平面)';
      } else {
        this.phase = '截面縮小 (離開平面)';
      }
    } else {
      this.phase = t < 0.5 ? `${this.shape.name}・進入平面` : `${this.shape.name}・離開平面`;
    }

    // 8. 捕食機制（世界觀整理.txt 第九節）：
    // 截游體穿過平面，截面擴張把周圍的低維點包入，同伴隨之被帶離平面！
    if (this.sections.length > 0 && typeof nodes !== 'undefined') {
      nodes = nodes.filter(n => {
        if (!this.insideSections(n)) return true;
        this.held.push({ x: n.x, y: n.y, age: 0 });
        return false;
      });
    }
  }

  // 繪製高維生物在二維平面的投影與截面輪廓
  display(scale = 1) {
    if (this.isCruising && this.held.length === 0) return;
    push();

    // 繪製截面邊界（極淡填色、深色細輪廓、稀疏幾何標記點）
    for (const section of this.sections) {
      fill(0, 5);
      stroke(0, 110);
      strokeWeight(0.8 / scale);
      beginShape();
      for (const p of section.points) {
        vertex(p.x, p.y);
      }
      endShape(CLOSE);

      // 截面邊界的觀測標記點
      noStroke();
      fill(0, 140);
      let distAcc = 0;
      for (let i = 1; i < section.points.length; i++) {
        const a = section.points[i - 1], b = section.points[i];
        distAcc += Math.hypot(b.x - a.x, b.y - a.y);
        if (distAcc >= 15) {
          circle(b.x, b.y, 2.0 / Math.sqrt(scale));
          distAcc %= 15;
        }
      }
    }

    // 繪製正在被「帶離平面、抽離至三維空間」的節點（原地淡出 + 幾何漣漪）
    noStroke();
    for (const n of this.held) {
      const alpha = Math.max(0, 1 - n.age / this.fadeDuration);
      fill(20, 220 * alpha);
      circle(n.x, n.y, (3.6 / Math.sqrt(scale)) * (1 + (1 - alpha) * 0.8));

      // 淡出時產生的微弱維度漣漪
      stroke(0, 50 * alpha);
      strokeWeight(0.6 / scale);
      noFill();
      circle(n.x, n.y, (14 * (1 - alpha)) / Math.sqrt(scale));
      noStroke();
    }

    pop();
  }

  getStats() {
    return {
      shapeName: this.shape ? this.shape.name : '等待穿越',
      phase: this.phase,
      held: this.held.length,
      consumed: this.consumed,
      sliceCount: this.sections.length
    };
  }
}

// =============================================================================
// 二維世界與環境邏輯（承襲自 M1 原型）
// =============================================================================

function setup() {
  const host = document.getElementById('canvas-host');
  createCanvas(host.clientWidth, host.clientHeight).parent(host);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));

  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.remove();

  describe('黑白幾何生態層中，節點隨資訊流運動與群集。三維生命截游體週期性穿透平面，展現單截面與雙截面的幾何變化，並捕食低維資訊。');

  // 快取 UI 元素
  for (const id of ['points', 'lines', 'planes', 'status', 'pause', 'drifter-type', 'drifter-phase', 'held', 'consumed', 'observation']) {
    ui[id] = document.getElementById(id);
  }

  // 互動控制監聽
  const connInput = document.getElementById('connection');
  if (connInput) {
    connInput.addEventListener('input', event => {
      connection = Number(event.target.value);
      const out = document.getElementById('distance');
      if (out) out.value = connection;
    });
  }

  const flowInput = document.getElementById('flow');
  if (flowInput) {
    flowInput.addEventListener('input', event => {
      flowStrength = Number(event.target.value) / 100;
      const out = document.getElementById('flow-value');
      if (out) out.value = `${event.target.value}%`;
    });
  }

  if (ui.pause) {
    ui.pause.addEventListener('click', () => {
      running = !running;
      ui.pause.textContent = running ? '暫停' : '繼續';
      if (ui.status) ui.status.textContent = running ? '環境運行中' : '觀測已暫停';
    });
  }

  const resetBtn = document.getElementById('reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetWorld);
  }

  const captureBtn = document.getElementById('capture');
  if (captureBtn) {
    captureBtn.addEventListener('click', () => saveCanvas('m2-section-drifter', 'png'));
  }

  resetWorld();
}

function resetWorld() {
  randomSeed(42);
  nodes = [];
  elapsed = 0;
  for (let i = 0; i < 82; i++) {
    addNode();
  }
  // 建立物件導向物種實例
  drifter = new SectionDrifter();
}

function addNode(x = random(12, WORLD.width - 12), y = random(12, WORLD.height - 12)) {
  if (nodes.length >= WORLD.limit) return;
  const angle = random(TWO_PI), speed = random(18, 30);
  nodes.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    heading: angle,
    speed,
    wander: 0,
    wanderTarget: random(-1.4, 1.4),
    wanderTimer: random(0.5, 2),
    baseSpeed: speed,
    speedTarget: speed,
    speedTimer: random(1, 3)
  });
}

function unitVector(x, y) {
  const length = Math.hypot(x, y);
  return length > 0.00001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

function updateNodes(dt) {
  if (dt <= 0) return;
  elapsed += dt;

  // 生態自我平衡補充：若節點因截游體捕食降至 35 顆以下，緩步補充新生節點
  if (nodes.length < 35 && random() < 0.04) {
    addNode();
  }

  const previous = nodes.map(n => ({ x: n.x, y: n.y, vx: n.vx, vy: n.vy }));
  const nextVelocity = [];

  nodes.forEach((n, index) => {
    const here = previous[index];
    let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, count = 0;
    let closeCount = 0, spreadX = 0, spreadY = 0;

    previous.forEach((other, j) => {
      if (index === j) return;
      const dx = other.x - here.x, dy = other.y - here.y, distance = Math.hypot(dx, dy);

      if (distance < 55) closeCount++;
      if (distance > 0.001 && distance < 150) {
        const strength = (1 - distance / 150) * 0.065;
        spreadX -= (dx / distance) * strength;
        spreadY -= (dy / distance) * strength;
      }
      if (distance < MOTION.neighborhood) {
        cx += dx; cy += dy; ax += other.vx; ay += other.vy; count++;
      }
      if (distance < MOTION.spacing) {
        if (distance < 0.001) {
          const angle = index * 13.37 + j * 7.91;
          const sign = index < j ? 1 : -1;
          sx += Math.cos(angle) * sign;
          sy += Math.sin(angle) * sign;
        } else {
          const strength = 1 - distance / MOTION.spacing;
          sx -= (dx / distance) * strength;
          sy -= (dy / distance) * strength;
        }
      }
    });

    const cohesion = unitVector(cx, cy), alignment = unitVector(ax, ay);
    const separation = unitVector(sx, sy);
    const crowding = Math.min(1, Math.hypot(sx, sy));
    const gathering = count ? Math.min(1, Math.hypot(cx / count, cy / count) / 45) : 0;

    const density = Math.min(1, closeCount / 8);
    const cohesionWeight = 0.85 * (1 - density * 0.85);
    const alignmentWeight = 0.65 * (1 - density * 0.4);
    const separationWeight = 3.2 + density * 2.2;

    n.speedTimer -= dt;
    if (n.speedTimer <= 0) {
      n.speedTarget = n.baseSpeed * random(0.6, 1.5);
      n.speedTimer += random(1.5, 4);
    }
    const neighborSpeed = count ? Math.hypot(ax / count, ay / count) : n.speedTarget;
    const desiredSpeed = n.speedTarget * 0.8 + neighborSpeed * 0.2;
    const acceleration = Math.max(-8 * dt, Math.min(8 * dt, desiredSpeed - n.speed));
    n.speed = Math.max(10, Math.min(46, n.speed + acceleration));

    n.wanderTimer -= dt;
    if (n.wanderTimer <= 0) {
      n.wanderTarget = random(-1.4, 1.4);
      n.wanderTimer += random(0.6, 2.2);
    }
    n.wander += (n.wanderTarget - n.wander) * (1 - Math.exp(-2 * dt));
    const wanderAngle = n.heading + n.wander;
    const margin = MOTION.wallMargin;
    const wallX = Math.max(0, (margin - n.x) / margin) - Math.max(0, (n.x - WORLD.width + margin) / margin);
    const wallY = Math.max(0, (margin - n.y) / margin) - Math.max(0, (n.y - WORLD.height + margin) / margin);
    const current = sampleField(n.x, n.y, elapsed);

    const targetX = Math.cos(wanderAngle) * 0.85 + cohesion.x * gathering * cohesionWeight
      + alignment.x * alignmentWeight + separation.x * crowding * separationWeight + wallX * 5 + spreadX
      + current.x * flowStrength * 0.55;
    const targetY = Math.sin(wanderAngle) * 0.85 + cohesion.y * gathering * cohesionWeight
      + alignment.y * alignmentWeight + separation.y * crowding * separationWeight + wallY * 5 + spreadY
      + current.y * flowStrength * 0.55;

    const targetAngle = Math.hypot(targetX, targetY) > 0.00001 ? Math.atan2(targetY, targetX) : n.heading;
    const difference = Math.atan2(Math.sin(targetAngle - n.heading), Math.cos(targetAngle - n.heading));
    n.heading += Math.max(-MOTION.turnRate * dt, Math.min(MOTION.turnRate * dt, difference));
    n.heading = Math.atan2(Math.sin(n.heading), Math.cos(n.heading));
    n.vx = Math.cos(n.heading) * n.speed;
    n.vy = Math.sin(n.heading) * n.speed;

    const pace = strata.some(s => Math.hypot(n.x - s.x, n.y - s.y) < s.r) ? 0.7 : 1;
    const edge = Math.max(0, Math.min(1, (n.x - 6) / 50, (994 - n.x) / 50, (n.y - 6) / 50, (454 - n.y) / 50));
    nextVelocity.push({
      x: (n.vx + current.x * flowStrength * 12 * edge) * pace,
      y: (n.vy + current.y * flowStrength * 12 * edge) * pace
    });
  });

  if (!nodes.length) return;
  const mean = nextVelocity.reduce((sum, v) => ({ x: sum.x + v.x / nodes.length, y: sum.y + v.y / nodes.length }), { x: 0, y: 0 });
  const center = previous.reduce((sum, n) => ({ x: sum.x + n.x / nodes.length, y: sum.y + n.y / nodes.length }), { x: 0, y: 0 });

  const stabilize = Math.min(1, Math.max(0, (nodes.length - 1) / 7));
  const returnX = Math.max(-3, Math.min(3, (WORLD.width / 2 - center.x) * 0.035));
  const returnY = Math.max(-3, Math.min(3, (WORLD.height / 2 - center.y) * 0.035));

  nodes.forEach((n, i) => {
    const vx = nextVelocity[i].x + stabilize * (returnX - mean.x);
    const vy = nextVelocity[i].y + stabilize * (returnY - mean.y);
    n.x = Math.max(6, Math.min(WORLD.width - 6, n.x + vx * dt));
    n.y = Math.max(6, Math.min(WORLD.height - 6, n.y + vy * dt));
  });
}

function sampleField(x, y, time) {
  let height = 0, gx = 0, gy = 0;
  for (const s of strata) {
    const dx = x - s.x, dy = y - s.y, radius2 = s.r * s.r;
    const hill = 48 * Math.exp(-(dx * dx + dy * dy) / radius2);
    height += hill;
    gx += (-2 * dx / radius2) * hill;
    gy += (-2 * dy / radius2) * hill;
  }
  const phase = x * 0.012 + y * 0.009 - time * 0.48;
  const cross = y * 0.018 - x * 0.004 + time * 0.23;
  height += flowStrength * (10 * Math.sin(phase) + 5 * Math.sin(cross));
  gx += flowStrength * (0.12 * Math.cos(phase) - 0.02 * Math.cos(cross));
  gy += flowStrength * (0.09 * Math.cos(phase) + 0.09 * Math.cos(cross));
  const magnitude = Math.max(1, Math.hypot(gx, gy) * 1.6);
  return { height, x: -gy * 1.6 / magnitude, y: gx * 1.6 / magnitude };
}

function terrainPoint(x, y) {
  const field = sampleField(x, y, elapsed);
  const edge = Math.sin(Math.PI * x / WORLD.width) * Math.sin(Math.PI * y / WORLD.height);
  return { x, y: y - field.height * edge * 0.72 };
}

function drawEnvironment() {
  push();
  noFill();
  strokeWeight(0.65 / view.scale);
  for (let y = 20; y < WORLD.height; y += 20) {
    stroke(0, y % 60 === 0 ? 29 : 16);
    beginShape();
    for (let x = 0; x <= WORLD.width; x += 12.5) {
      const p = terrainPoint(x, y);
      vertex(p.x, p.y);
    }
    endShape();
  }
  stroke(0, 10);
  for (let x = 40; x < WORLD.width; x += 40) {
    beginShape();
    for (let y = 0; y <= WORLD.height; y += 10) {
      const p = terrainPoint(x, y);
      vertex(p.x, p.y);
    }
    endShape();
  }
  pop();
}

function drawGrid() {
  noFill();
  stroke(0, 48);
  strokeWeight(1 / view.scale);
  rect(0, 0, WORLD.width, WORLD.height);
  stroke(0, 90);
  strokeWeight(1 / view.scale);
  for (const [x, y, sx, sy] of [[0,0,1,1],[1000,0,-1,1],[0,460,1,-1],[1000,460,-1,-1]]) {
    line(x, y, x + 14 * sx, y);
    line(x, y, x, y + 14 * sy);
  }
}

function drawOrigin() {
  const x = WORLD.width / 2, y = WORLD.height / 2;
  push();
  noFill();
  strokeWeight(0.7 / view.scale);
  stroke(0, 18);
  circle(x, y, 42 + Math.sin(elapsed * 0.45) * 4);
  stroke(0, 65);
  line(x - 4, y, x + 4, y);
  line(x, y - 4, x, y + 4);
  pop();
}

// 主渲染迴圈
function draw() {
  background(255);
  const dt = running ? Math.min(deltaTime / 1000, 0.05) : 0;

  // 1. 更新二維世界節點
  updateNodes(dt);

  // 2. 更新物件導向截游體（三維生命週期、截面、捕食）
  if (drifter) {
    drifter.update(dt);
  }

  // 計算畫布等比縮放居中
  view.scale = Math.min((width - 44) / WORLD.width, (height - 44) / WORLD.height);
  view.x = (width - WORLD.width * view.scale) / 2;
  view.y = (height - WORLD.height * view.scale) / 2;

  push();
  translate(view.x, view.y);
  scale(view.scale);

  // 繪製二維世界背景（外框、地形網格、原點標記）
  drawGrid();
  drawEnvironment();
  drawOrigin();

  // 計算動態連線與三角面
  const edges = [], neighbors = nodes.map(() => new Set());
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < connection) {
        edges.push([i, j]);
        neighbors[i].add(j);
        neighbors[j].add(i);
      }
    }
  }

  let planes = 0;
  noStroke();
  fill(0, 10);
  for (const [i, j] of edges) {
    for (const k of neighbors[j]) {
      if (k > j && neighbors[i].has(k)) {
        const a = nodes[i], b = nodes[j], c = nodes[k];
        const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
        if (area > 24) {
          const density = Math.max(neighbors[i].size, neighbors[j].size, neighbors[k].size);
          fill(0, 8 / Math.max(1, density / 3));
          triangle(a.x, a.y, b.x, b.y, c.x, c.y);
          planes++;
        }
      }
    }
  }

  // 繪製連線
  stroke(0, 40);
  strokeWeight(0.7 / view.scale);
  for (const [i, j] of edges) {
    line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
  }

  // 繪製二維節點
  for (const n of nodes) {
    stroke(0, 70);
    strokeWeight(0.8 / view.scale);
    line(n.x - Math.cos(n.heading) * 7, n.y - Math.sin(n.heading) * 7, n.x, n.y);
    noStroke();
    fill(20);
    circle(n.x, n.y, 3.6 / Math.sqrt(view.scale));
  }

  // 3. 繪製三維物種截游體（二維截面輪廓與被捕食淡出點）
  if (drifter) {
    drifter.display(view.scale);
  }

  pop();

  // 更新世界統計 UI
  if (ui.points) ui.points.textContent = String(nodes.length).padStart(3, '0');
  if (ui.lines) ui.lines.textContent = String(edges.length).padStart(3, '0');
  if (ui.planes) ui.planes.textContent = String(planes).padStart(3, '0');

  // 更新物種觀測 UI
  if (drifter) {
    const stats = drifter.getStats();
    if (ui['drifter-type']) ui['drifter-type'].textContent = stats.shapeName;
    if (ui['drifter-phase']) ui['drifter-phase'].textContent = stats.phase;
    if (ui.held) ui.held.textContent = stats.held;
    if (ui.consumed) ui.consumed.textContent = stats.consumed;
  }

  // 滑鼠懸停即時觀測提示
  const currentMouseX = typeof mouseX !== 'undefined' ? mouseX : -9999;
  const currentMouseY = typeof mouseY !== 'undefined' ? mouseY : -9999;
  const mx = (currentMouseX - view.x) / view.scale, my = (currentMouseY - view.y) / view.scale;
  const isInsideDrifter = drifter && drifter.insideSections({ x: mx, y: my });
  const region = regions.find(r => Math.hypot(mx - r.x, my - r.y) < r.r);

  if (ui.observation) {
    if (isInsideDrifter) {
      ui.observation.textContent = '截游體 / SECTION DRIFTER — 你看見的是同一隻三維生命的高維截面；被包入的二維點正隨牠離開平面。';
    } else if (region) {
      ui.observation.textContent = `${region.title} — ${region.detail}`;
    } else if (drifter && !drifter.isCruising) {
      ui.observation.textContent = `截游體正在穿越平面：【${drifter.phase}】· 可見截面：${drifter.sections.length} 個 · 本體三維深度 z ≈ ${drifter.z.toFixed(1)}`;
    } else {
      ui.observation.textContent = '淡網格顯示資訊密度與波動；截游體巡游於三維空間中，等待下一次週期性穿越。';
    }
  }
}

function mousePressed(event) {
  if (event.target !== document.querySelector('#canvas-host canvas')) return;
  const x = (mouseX - view.x) / view.scale, y = (mouseY - view.y) / view.scale;
  if (x < 0 || x > WORLD.width || y < 0 || y > WORLD.height) return;
  for (let i = 0; i < 5; i++) addNode();
}

function windowResized() {
  const host = document.getElementById('canvas-host');
  if (host) resizeCanvas(host.clientWidth, host.clientHeight);
}
