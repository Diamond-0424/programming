// 截游體：四維法向管與 w=s 的真實交集。無 noise、無 4D 透視投影。
// 可直接貼入 p5.js 編輯器；也支援此資料夾的 HTML 控制列。
const PARAMS = {
  "coreRadius": 88,
  "tubeRadius": 17,
  "coreFold": 20,           // 核心向內外折返的幅度
  "lineBrightness": 1.2,   // 線條亮度倍率，小幅提高 20%
  "cornerPower": 2.65,       // 2 為圓滑；2.4～3.2 為柔和稜角
  "shapeIrregularity": 0.14, // 管身寬扁、斜切差異；0 關閉，建議 0～0.25
  "wAmplitude": 44,
  "zAmplitude": 32,
  "slicePosition": 0,
  "sliceSpeed": 0.24,
  "autoSlice": true,
  "coreSamples": 360,
  "ringSamples": 28,
  "lineConnectionDistance": 12,
  "shellLevels": [
    1,
    0.79,
    0.58
  ]
};
const TAU4 = Math.PI * 2;
let body, section, clockTime = 0, paused = false, observationCamera;
const dot4 = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
const length4 = a => Math.hypot(...a);
const normalize4 = a => { const n=length4(a); return a.map(x=>x/n); };

// 單一封閉核心繞行兩圈、徑向折返三次；不是複製幾隻生物。
// XYZ 借用 (2,3) 環面結的繞行方式，w 加入固定的多頻起伏。
function corePoint(t) {
  const R=PARAMS.coreRadius,F=PARAMS.coreFold,A=PARAMS.wAmplitude,Z=PARAMS.zAmplitude;
  const radial=R+F*Math.cos(3*t);
  return [radial*Math.cos(2*t),.78*radial*Math.sin(2*t),
    Z*(Math.sin(3*t)+.15*Math.sin(5*t+.4)),
    A*(.65*Math.sin(t+.5)+.35*Math.sin(3*t)+.2*Math.sin(5*t+.7))];
}

function coreTangent(t) {
  const R=PARAMS.coreRadius,F=PARAMS.coreFold,A=PARAMS.wAmplitude,Z=PARAMS.zAmplitude;
  const radial=R+F*Math.cos(3*t),dr=-3*F*Math.sin(3*t);
  // 與上方 C(t) 完全一致的解析導數，保持法向截面正確。
  return normalize4([dr*Math.cos(2*t)-2*radial*Math.sin(2*t),
    .78*(dr*Math.sin(2*t)+2*radial*Math.cos(2*t)),
    Z*(3*Math.cos(3*t)+.75*Math.cos(5*t+.4)),
    A*(.65*Math.cos(t+.5)+1.05*Math.cos(3*t)+Math.cos(5*t+.7))]);
}

function generate4DCoreCurve() {
  return Array.from({length:PARAMS.coreSamples},(_,i)=>{
    const t=i/PARAMS.coreSamples*TAU4;
    return {center:corePoint(t), tangent:coreTangent(t), t};
  });
}

function sample4DBody(core) {
  const frames=core.map(({center,tangent:T,t})=>{
    const h=Math.sqrt(Math.max(0,1-T[3]*T[3]));
    // N 是第四維軸在法向空間的投影方向，N.w=h。
    const N=T.map((x,i)=>((i===3?1:0)-T[3]*x)/h);
    // U、V 的 w=0，且皆垂直於核心切向 T。
    const xy=Math.hypot(T[0],T[1]);
    const baseU=[-T[1]/xy,T[0]/xy,0,0];
    const baseV=normalize4([T[1]*baseU[2]-T[2]*baseU[1],T[2]*baseU[0]-T[0]*baseU[2],T[0]*baseU[1]-T[1]*baseU[0],0]);
    // 固定在母體上的週期形狀，不隨幀數抽樣或抖動；首尾連續。
    const amount=Math.max(0,Math.min(.35,PARAMS.shapeIrregularity));
    const twist=amount*2.5*Math.sin(2*t+.3);
    const U=baseU.map((x,k)=>x*Math.cos(twist)+baseV[k]*Math.sin(twist));
    const V=baseV.map((x,k)=>x*Math.cos(twist)-baseU[k]*Math.sin(twist));
    const shape={power:Math.max(2,PARAMS.cornerPower),
      scaleU:1+amount*Math.sin(3*t+.6),
      scaleV:1+amount*.8*Math.cos(2*t-.4),
      shear:amount*.75*Math.sin(3*t+1.1)};
    return {center,T,N,U,V,h,t,shape};
  });
  const extent=Math.max(...frames.map(f=>Math.abs(f.center[3])+PARAMS.tubeRadius*f.h));
  return {frames, extent};
}

function sliceWith3DSpace(pool,s) {
  return PARAMS.shellLevels.map(level=>{
    const r=PARAMS.tubeRadius*level;
    return pool.frames.map(f=>{
      const a=(s-f.center[3])/f.h;
      if(Math.abs(a)>=r) return null;
      // 法向球改為圓角超橢球（含固定剪切）：
      // |a/r|^p + |(u-shear*v)/(r*scaleU)|^p + |v/(r*scaleV)|^p <= 1。
      // a 仍由 w=s 精確決定；以下取該纖維邊界的交線，不是全域距離等值面。
      const {power,scaleU,scaleV,shear}=f.shape;
      const rho=r*Math.pow(Math.max(0,1-Math.pow(Math.abs(a)/r,power)),1/power);
      const points=Array.from({length:PARAMS.ringSamples},(_,j)=>{
        const phi=j/PARAMS.ringSamples*TAU4;
        const co=Math.cos(phi),si=Math.sin(phi);
        const radial=Math.pow(Math.abs(co)**power+Math.abs(si)**power,-1/power);
        const v=rho*scaleV*si*radial;
        const u=rho*scaleU*co*radial+shear*v;
        return f.center.map((c,k)=>c+a*f.N[k]+u*f.U[k]+v*f.V[k]);
      });
      return {points,rho,level};
    });
  });
}

function project3DToScreen(p) { return p.slice(0,3); }

function near(a,b) {
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<=PARAMS.lineConnectionDistance;
}

function renderCreature(slices) {
  const palettes=[[189,240,250],[104,195,226],[93,137,210]];
  noFill(); blendMode(ADD);
  slices.forEach((rings,layer)=>{
    const color=palettes[layer%palettes.length];
    // 每個橫截圈都是真實交集；稀疏顯示圈線，避免密集網球外觀。
    strokeWeight(.7);
    beginShape(LINES);
    for(let i=0;i<rings.length;i++) {
      const ring=rings[i]; if(!ring) continue;
      const alpha=Math.min(1,ring.rho/4)*(layer?28:65)*PARAMS.lineBrightness;
      stroke(...color,alpha);
      for(let j=0;j<ring.points.length;j++) {
        const p=ring.points[j], q=ring.points[(j+1)%ring.points.length];
        if(i%7===0 && near(p,q)) { vertex(...project3DToScreen(p)); vertex(...project3DToScreen(q)); }
        const next=rings[(i+1)%rings.length];
        // 不跨過消失的管段，也不在分離段之間以最近點亂連。
        if(next && j%4===0 && near(p,next.points[j])) {
          vertex(...project3DToScreen(p)); vertex(...project3DToScreen(next.points[j]));
        }
      }
    }
    endShape();
    // 同位置的大淡點＋小亮點形成微光，皆是當前截面的點。
    for(const halo of [true,false]) {
      strokeWeight(halo?4:1.35);
      beginShape(POINTS);
      for(let i=0;i<rings.length;i+=2) {
        const ring=rings[i]; if(!ring)continue;
        stroke(...color,Math.min(1,ring.rho/4)*(halo?12:125)/(1+layer*.55));
        for(let j=0;j<ring.points.length;j+=4) vertex(...project3DToScreen(ring.points[j]));
      }
      endShape();
    }
  });
  blendMode(BLEND);
}

function resetView() {
  observationCamera.camera(0,-170,540,0,0,0,0,1,0);
  observationCamera.perspective(Math.PI/3,width/height,1,4000);
}

function setup() {
  const host=document.getElementById('canvas-host');
  const canvas=createCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight,WEBGL);
  if(host)canvas.parent(host);
  pixelDensity(Math.min(window.devicePixelRatio||1,2));
  observationCamera=createCamera(); resetView();
  body=sample4DBody(generate4DCoreCurve());
  document.getElementById('loading')?.remove();
  describe('深色背景中，帶柔和稜角與不對稱的冷白青藍斷環是同一個四維管狀生物與三維空間的截面，逐漸出現、分裂及消失。');
  const pause=document.getElementById('pause');
  if(pause)pause.onclick=()=>{paused=!paused;pause.textContent=paused?'繼續':'暫停';pause.setAttribute('aria-pressed',String(paused));};
  const reset=document.getElementById('reset'); if(reset)reset.onclick=resetView;
  const capture=document.getElementById('capture'); if(capture)capture.onclick=()=>saveCanvas('m2-drifter-4d-slice','png');
  canvas.elt.addEventListener('contextmenu',event=>event.preventDefault());
}

function draw() {
  background(5,10,18); orbitControl(1,1,.65);
  if(!paused)clockTime+=Math.min(deltaTime/1000,.05);
  const s=PARAMS.slicePosition+(PARAMS.autoSlice?(body.extent+8)*Math.sin(clockTime*PARAMS.sliceSpeed):0);
  section=sliceWith3DSpace(body,s);
  push(); scale(Math.min(width,height)/480); renderCreature(section); pop();
  const status=document.getElementById('slice-status');
  if(status)status.textContent='w = '+s.toFixed(1)+' / '+(section[0].some(Boolean)?'截面顯現':'離開觀察空間');
}

function windowResized() {
  const host=document.getElementById('canvas-host');
  resizeCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight); resetView();
}
