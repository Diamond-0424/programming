function setup() {
  createCanvas(600, 600);
  frameRate(60); // 設定每秒 60 幀
}

function draw() {
  background(253, 252, 249);

  // 圓形初始直徑
  let d = 50;

  // 每過 1 秒（累積 60 幀），直徑就變成原本的 2 倍
  if (frameCount % 60 === 0) {
    d = d * 2;
  }

  // 限制最大大小不能超過畫布寬度（600）
  if (d > width) {
    d = width;
  }

  circle(width / 2, height / 2, d);
}


