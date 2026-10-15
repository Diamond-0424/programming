// 截游體 / 24-cell：參考圖的交錯直線骨架與空心節點。
// 同一四維母體，明確分開「4D→3D 骨架投影」與「w=s 真正截面」。
const PARAMS={halfSize:94,sliceSpeed:.21,rotationSpeed:.23,lineBrightness:1,
  projectionDistance:330,nodeRadius:4,shellLevels:[1,.67],slicePosition:0,
  glowStrength:.45,lineWidth:1.65,nodeLineWidth:1.65,
  breathAmount:.045,breathPeriod:6.4,
  exploreAmount:1,
  defaultMode:"projection"};
const EPS=1e-7;
let body,section,clockTime=0,paused=false,observationCamera;
let viewMode=PARAMS.defaultMode;
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
function rotatePlane(p,a,b,angle){const q=p.slice(),c=Math.cos(angle),s=Math.sin(angle);q[a]=c*p[a]-s*p[b];q[b]=s*p[a]+c*p[b];return q;}
function rotationAngles(time){return [[0,3,.52+time*PARAMS.rotationSpeed],[1,3,.78+.6*Math.sin(time*.17)],[2,3,.31+time*.13],[0,2,.27]];}
function rotate4D(p,time,inverse=false){
  const rotations=rotationAngles(time);if(inverse)rotations.reverse();
  for(const [a,b,angle] of rotations)p=rotatePlane(p,a,b,inverse?-angle:angle);
  return p;
}
function generate4DBody(){
  // 24 胞體：所有 (±1,±1,0,0) 的座標排列，共 24 個頂點。
  const vertices=[];
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)for(const a of [-1,1])for(const b of [-1,1]){
    const p=[0,0,0,0];p[i]=a;p[j]=b;vertices.push(p);
  }
  // 正規幾何的真實 96 條邊；不是把每個節點任意兩兩連接。
  const edges=[];
  for(let i=0;i<24;i++)for(let j=i+1;j<24;j++)if(Math.abs(dot(sub(vertices[i],vertices[j]),sub(vertices[i],vertices[j]))-2)<EPS)edges.push([i,j]);
  // 母體由 24 個半空間 n·p<=1 定義，每個邊界胞都是八面體。
  const normals=[];
  for(let axis=0;axis<4;axis++)for(const sign of [-1,1]){const n=[0,0,0,0];n[axis]=sign;normals.push(n);}
  for(let mask=0;mask<16;mask++)normals.push([0,1,2,3].map(k=>mask&(1<<k)?.5:-.5));
  const cells=normals.map(normal=>{
    const ids=vertices.map((p,i)=>Math.abs(dot(normal,p)-1)<EPS?i:-1).filter(i=>i>=0);
    return {normal,ids,edges:edges.filter(([a,b])=>ids.includes(a)&&ids.includes(b))};
  });
  return {vertices,edges,cells,normals};
}
function sample4DBody(template,time,level=1){
  return {...template,vertices:template.vertices.map(p=>rotate4D(p.map(x=>x*PARAMS.halfSize*level),time)),time,level};
}
function orderFace(ids,points){
  if(ids.length<3)return null;
  const center=[0,1,2].map(k=>ids.reduce((s,id)=>s+points[id][k],0)/ids.length);
  const u=unit(sub(points[ids[0]].slice(0,3),center));let normal=null;
  for(let j=1;j<ids.length;j++){
    const n=cross(u,sub(points[ids[j]].slice(0,3),center));
    if(Math.hypot(...n)>EPS){normal=unit(n);break;}
  }
  if(!normal)return null;
  // 若切面恰與整個八面體胞重合，該胞是 3D 體積而非一個面；由相鄰胞給出外表面。
  if(ids.some(id=>Math.abs(dot(sub(points[id].slice(0,3),center),normal))>EPS*10))return null;
  const v=cross(normal,u);
  return ids.slice().sort((a,b)=>{
    const pa=sub(points[a].slice(0,3),center),pb=sub(points[b].slice(0,3),center);
    return Math.atan2(dot(pa,v),dot(pa,u))-Math.atan2(dot(pb,v),dot(pb,u));
  });
}
function sliceWith3DSpace(shape,s){
  const points=[],faces=[],pointIds=new Map(),faceIds=new Set();
  const add=p=>{const key=p.slice(0,3).map(x=>Math.round(x/EPS)).join(',');
    if(!pointIds.has(key)){pointIds.set(key,points.length);points.push(p);}return pointIds.get(key);};
  for(const cell of shape.cells){
    const ids=new Set();
    for(const [i,j] of cell.edges){
      const a=shape.vertices[i],b=shape.vertices[j],da=a[3]-s,db=b[3]-s;
      if(Math.abs(da)<EPS)ids.add(add([a[0],a[1],a[2],s]));
      if(Math.abs(db)<EPS)ids.add(add([b[0],b[1],b[2],s]));
      if(da*db<0&&Math.abs(da)>=EPS&&Math.abs(db)>=EPS){
        const t=(s-a[3])/(b[3]-a[3]);const p=a.map((x,k)=>x+t*(b[k]-x));p[3]=s;ids.add(add(p));
      }
    }
    const face=orderFace([...ids],points);if(!face)continue;
    const key=face.slice().sort((a,b)=>a-b).join(',');
    if(!faceIds.has(key)){faceIds.add(key);faces.push(face);}
  }
  const edges=[],seen=new Set();
  for(const face of faces)for(let i=0;i<face.length;i++){
    const a=face[i],b=face[(i+1)%face.length],key=[Math.min(a,b),Math.max(a,b)].join(',');
    if(!seen.has(key)){seen.add(key);edges.push([a,b]);}
  }
  // 浮點容差 EPS 用於頂點／共面去重；沒有格點近似或隨機斷裂。
  return {points,faces,edges,s,level:shape.level};
}
// 只供投影模式：顯示整個四維骨架，而非宣稱這些點位於 w=s。
function project4DTo3D(shape){
  const d=PARAMS.projectionDistance;
  if(d<=Math.SQRT2*PARAMS.halfSize*shape.level)throw new Error('projectionDistance 必須大於母體外接半徑。');
  return {points:shape.vertices.map(p=>{const k=d/(d-p[3]);return p.slice(0,3).map(v=>v*k);}),
    source4D:shape.vertices,edges:shape.edges,faces:[],level:shape.level,mode:'projection'};
}
function project3DToScreen(p){return p.slice(0,3);} // 最後由 p5.js 相機做 3D→螢幕投影。
function cameraAxes(){
  const c=observationCamera,forward=unit([c.eyeX-c.centerX,c.eyeY-c.centerY,c.eyeZ-c.centerZ]);
  const right=unit(cross([c.upX,c.upY,c.upZ],forward));
  return {right,up:unit(cross(forward,right))};
}
// 一輪 6.4 秒：吸氣 2.2 秒、吐氣 3.4 秒、休息 0.8 秒。
// 緩入緩出讓各階段銜接平順；與旋轉共用時鐘，暫停時一起停住。
function breathingAt(time){
  const phase=((time%PARAMS.breathPeriod)+PARAMS.breathPeriod)%PARAMS.breathPeriod/PARAMS.breathPeriod;
  const inhale=2.2/6.4,exhaleEnd=5.6/6.4;
  const ease=t=>t*t*t*(t*(t*6-15)+10);
  const fullness=phase<inhale?ease(phase/inhale):
    phase<exhaleEnd?1-ease((phase-inhale)/(exhaleEnd-inhale)):0;
  return {scale:1+PARAMS.breathAmount*fullness,glow:.8+.4*fullness,nodeLight:.94+.06*fullness};
}
// 自主行為：需求影響選擇，方向與速度保有記憶，沒有預排路線或動作順序。
class Explorer {
  constructor(random=Math.random){
    this.random=random;this.x=0;this.y=0;this.vx=0;this.vy=0;
    this.energy=.75;this.curiosity=.7;this.mode='observe';this.attention=0;
    this.heading=random()*Math.PI*2;this.bend=0;this.intent=0;
    this.scale=1;this.sizeGoal=1;this.tilt=0;this.turn=0;this.look=0;
  }
  choose(){
    // 體力太低時先恢復；其他時候依需求加權抽選，沒有固定輪替。
    const weights=[this.energy*this.curiosity*2.4,.35+(1-this.curiosity)*.65,(1-this.energy)**2*2];
    let pick=this.random()*weights.reduce((a,b)=>a+b,0),choice=0;
    while(choice<2&&pick>weights[choice])pick-=weights[choice++];
    this.mode=this.energy<.18?'rest':['explore','observe','rest'][choice];
    this.attention=this.mode==='explore'?2+this.random()*6:1.5+this.random()*3.5;
    this.sizeGoal=this.mode==='rest'?.8:this.mode==='observe'?.96+this.random()*.2:.8+this.random()*.36;
  }
  update(dt){
    if(!(dt>0))return;
    // 固定上限的小步積分，低幀率也不會突然跳躍。
    let remaining=Math.min(dt,.05);
    while(remaining>1e-8){const h=Math.min(remaining,1/120);this.step(h);remaining-=h;}
  }
  step(dt){
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    this.energy=clamp(this.energy+dt*(this.mode==='explore'?-.035:this.mode==='rest'?.075:.025),0,1);
    this.curiosity=clamp(this.curiosity+dt*(this.mode==='explore'?-.045:.065),.05,1);
    this.attention-=dt;this.intent-=dt;
    if(this.attention<=0||(this.energy<.16&&this.mode!=='rest'))this.choose();
    if(this.intent<=0){
      this.bend=(this.random()-.5)*1.8;
      this.look=(this.random()-.5)*.42;
      this.intent=.6+this.random()*1.5;
    }
    this.heading+=this.bend*dt;
    const speed=this.mode==='explore'?.16+.18*this.energy:.008;
    // 接近邊界便往內轉；軟邊界在硬限制之前開始作用。
    const wall=v=>-Math.sign(v)*Math.max(0,Math.abs(v)-.65)*2.8;
    const response=1-Math.exp(-2.2*dt);
    this.vx+=(Math.cos(this.heading)*speed+wall(this.x)-this.vx)*response;
    this.vy+=(Math.sin(this.heading)*speed+wall(this.y)-this.vy)*response;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    for(const [pos,velocity] of [['x','vx'],['y','vy']]){
      if(Math.abs(this[pos])>1){this[pos]=clamp(this[pos],-1,1);this[velocity]*=-.2;}
    }
    const settle=1-Math.exp(-2*dt);
    // 大幅度縮放稍慢地追上目標，避免改變主意時突然膨脹或收縮。
    this.scale+=(this.sizeGoal-this.scale)*(1-Math.exp(-1.5*dt));
    this.tilt+=(-this.vx*.55-this.tilt)*settle;
    this.turn+=(this.look+this.vx*.35-this.turn)*settle;
  }
  pose(){
    const a=PARAMS.exploreAmount;
    return {x:this.x*a,y:this.y*a,scale:1+(this.scale-1)*a,tilt:this.tilt*a,turn:this.turn*a};
  }
}
const explorer=new Explorer();
function renderCreature(meshes,breathing=breathingAt(clockTime)){
  const axes=cameraAxes();
  const corePulse=breathing.nodeLight;
  // 參考 2026-10-15 圖片：明亮白線、黑心白邊節點，光暈只貼著輪廓。
  meshes.forEach((mesh,layer)=>{
    if(!mesh.edges.length)return;
    blendMode(ADD);noFill();
    // 由寬而淡的光暈畫到細線；微光強度設為 0 即可關閉。
    for(const pass of [{width:5,alpha:4},{width:3,alpha:10},{width:0,alpha:0}]){
      const halo=pass.width>0;
      strokeWeight(halo?pass.width:PARAMS.lineWidth*(layer?.75:1));
      beginShape(LINES);
      for(const [a,b] of mesh.edges){
        const depth=mesh.source4D ? (mesh.source4D[a][3]+mesh.source4D[b][3])/(2*Math.SQRT2*PARAMS.halfSize) : 0;
        const alpha=(halo?pass.alpha*PARAMS.glowStrength*breathing.glow*(layer?.5:1):(layer?150*corePulse:245))*(.96+.04*depth)*PARAMS.lineBrightness;
        stroke(255,255,255,alpha);
        vertex(...project3DToScreen(mesh.points[a]));vertex(...project3DToScreen(mesh.points[b]));
      }endShape();
    }
    // 面保持空白，避免把密集骨架填成一團發亮的實體。
    // 與骨架共用透視：近處圓點較大，遠處較小。
    const radius=PARAMS.nodeRadius*(layer?.7:1);
    for(const pass of [{width:4,alpha:5},{width:2.4,alpha:11},{width:0,alpha:0}]){
    const halo=pass.width>0;
    if(halo){blendMode(ADD);noFill();}
    else{blendMode(BLEND);fill(0);}
    stroke(255,255,255,halo?pass.alpha*PARAMS.glowStrength*breathing.glow*(layer?.5:1):(layer?190:255)*breathing.nodeLight);
    strokeWeight(halo?pass.width:PARAMS.nodeLineWidth*(layer?.75:1));
    for(const [index,point] of mesh.points.entries()){
      const perspective=mesh.source4D?PARAMS.projectionDistance/(PARAMS.projectionDistance-mesh.source4D[index][3]):1;
      const p=project3DToScreen(point);beginShape();
      for(let j=0;j<24;j++){
        const angle=j/24*Math.PI*2;
        vertex(...p.map((v,k)=>v+radius*perspective*(Math.cos(angle)*axes.right[k]+Math.sin(angle)*axes.up[k])));
      }endShape(CLOSE);
    }
    }
  });blendMode(BLEND);
}
function resetView(){observationCamera.camera(0,-115,440,0,0,0,0,1,0);observationCamera.perspective(Math.PI/3,width/height,1,4000);}
function setup(){
  const host=document.getElementById('canvas-host');const canvas=createCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight,WEBGL);
  if(host)canvas.parent(host);pixelDensity(Math.min(window.devicePixelRatio||1,2));observationCamera=createCamera();resetView();body=generate4DBody();
  document.getElementById('loading')?.remove();describe('24 胞體以密集交錯直線與空心圓節點呈現，可切換完整四維骨架投影和真正三維截面。');
  const mode=document.getElementById('view-mode');if(mode){mode.value=viewMode;mode.onchange=()=>{viewMode=mode.value;updateModeLabels();};}updateModeLabels();
  const pause=document.getElementById('pause');if(pause)pause.onclick=()=>{paused=!paused;pause.textContent=paused?'繼續':'暫停';pause.setAttribute('aria-pressed',String(paused));};
  const reset=document.getElementById('reset');if(reset)reset.onclick=resetView;
  const capture=document.getElementById('capture');if(capture)capture.onclick=()=>saveCanvas('m2-24cell-'+viewMode,'png');
  canvas.elt.addEventListener('contextmenu',event=>event.preventDefault());
}
function updateModeLabels(){
  const label=document.getElementById('view-label'),caption=document.getElementById('view-caption');
  if(label)label.textContent=viewMode==='projection'?'24 胞體・四維骨架投影':'24 胞體・真正三維截面';
  if(caption)caption.textContent=viewMode==='projection'?'24 個頂點 / 96 條真實邊 / 四維旋轉':'同一四維母體 / w = s / 線性求交';
}
function draw(){
  background(0);orbitControl(1,1,.65);
  if(!paused){const dt=Math.max(0,Math.min(deltaTime/1000,.05));clockTime+=dt;explorer.update(dt);}
  const s=PARAMS.slicePosition+PARAMS.halfSize*1.48*Math.sin(clockTime*PARAMS.sliceSpeed);
  // 預設整體骨架投影符合參考圖的密集交錯；切換後才計算 w=s。
  section=viewMode==='projection'?[project4DTo3D(sample4DBody(body,clockTime))]:
    PARAMS.shellLevels.map(level=>sliceWith3DSpace(sample4DBody(body,clockTime,level),s));
  // 整體極輕微地收縮、舒展，像緩慢呼吸；不改動母體幾何或切面計算。
  const breathing=breathingAt(clockTime);
  const exploring=explorer.pose(),axes=cameraAxes();
  const travelSize=Math.min(width,height);
  push();
  // 留出游動空間，沿相機的左右／上下探索，轉動視角後也看得到位移。
  translate(...axes.right.map((v,k)=>v*exploring.x*travelSize*.125+axes.up[k]*exploring.y*travelSize*.1));
  rotateY(exploring.turn+.022*Math.sin(clockTime*.27));rotateZ(exploring.tilt+.012*Math.sin(clockTime*.19));
  scale(travelSize/560*breathing.scale*exploring.scale);renderCreature(section,breathing);pop();
  const status=document.getElementById('slice-status');
  if(status)status.textContent=viewMode==='projection'?'完整骨架投影 · 24 節點 / 96 邊':
    'w = '+s.toFixed(1)+' / '+(section[0].faces.length?section[0].faces.length+' 面截體':'離開觀察空間');
}
function windowResized(){const host=document.getElementById('canvas-host');resizeCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight);resetView();}
