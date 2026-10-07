// 不需瀏覽器的造型檢查：記錄真正 displayBody() 的 p5 繪圖命令為 SVG。
// 這是固定狀態的造型圖，不是瀏覽器截圖或動畫效能測試。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let seed = 42;
let parts = [], points = [], paint = { fill: 'none', stroke: '#222', width: 1 };
const alpha = (value, opacity = 255) => `rgba(${value},${value},${value},${opacity / 255})`;
const context = vm.createContext({
  Math, TWO_PI: Math.PI * 2, CLOSE: 'close',
  random(a = 1, b) {
    const t = (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
    return b === undefined ? a * t : a + (b - a) * t;
  },
  fill(v, a) { paint.fill = alpha(v, a); },
  stroke(v, a) { paint.stroke = alpha(v, a); },
  noFill() { paint.fill = 'none'; },
  noStroke() { paint.stroke = 'none'; },
  strokeWeight(w) { paint.width = w; },
  beginShape() { points = []; },
  vertex(x, y) { points.push(`${x.toFixed(3)},${y.toFixed(3)}`); },
  endShape(close) {
    parts.push(`<${close ? 'polygon' : 'polyline'} points="${points.join(' ')}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.width}" stroke-linejoin="round"/>`);
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../sketch.js'), 'utf8'), context);
const poses = [
  ['01 / IDLE', '多心截面群・錯相呼吸', 0, 0, 0, 0],
  ['02 / MOVING', '深度改變・局部斷裂', 2.7, 0.52, 0, 0],
  ['03 / SENSING', '輪廓與碎片偏向獵物', 4.1, 0.05, 0, 0],
  ['04 / ENCLOSING', '斷環重排・包圍中', 4.7, 0.05, 0.58, 0],
  ['05 / FEEDING', '閉合空缺・帶離平面', 5.2, 0.05, 1, 0],
  ['06 / RECOVERY', '劇烈錯相・逐漸恢復', 5.5, 0.05, 0.76, 0.72]
];
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="690" viewBox="0 0 1080 690"><rect width="1080" height="690" fill="#faf9f6"/><g font-family="sans-serif" fill="#303030">';
poses.forEach(([label, subtitle, time, depth, closure, shock], i) => {
  parts = [];
  vm.runInContext(`
    drifter = new SectionDrifter();
    drifter.x = 180; drifter.y = 185;
    drifter.progress = 0.5; drifter.angle = 0;
    drifter.bodyTime = ${time}; drifter.z = drifter.extent * ${depth};
    drifter.closure = ${closure}; drifter.phaseShock = ${shock};
    drifter.sense = {x:${i >= 2 ? 0.9 : 0}, y:${i >= 2 ? -0.2 : 0}};
    drifter.sections = drifter.computeSections(0.5);
    drifter.displayBody(0.7);
  `, context);
  svg += `<g transform="translate(${i % 3 * 360},${Math.floor(i / 3) * 345})"><text x="24" y="34" font-size="13" letter-spacing="2">${label}</text><text x="24" y="58" font-size="13" fill="#888">${subtitle}</text>${parts.join('')}</g>`;
});
svg += '</g></svg>';
const output = path.join(__dirname, '../previews/section-drifter-states.svg');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg);
console.log(output);
