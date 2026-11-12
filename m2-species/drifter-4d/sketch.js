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
const explorer=new Explorer(globalThis.drifterExperiment?.benchmark?seededRandom(42):Math.random);
function renderCreature(meshes,breathing=breathingAt(clockTime),appearance={opacity:1,nodeScale:1}){
  if(globalThis.drifterRenderer)return globalThis.drifterRenderer.creature(meshes,breathing,appearance);
  const axes=cameraAxes();
  const corePulse=breathing.nodeLight;
  // 參考 2026-10-15 圖片：明亮白線、黑心白邊節點，光暈只貼著輪廓。
  meshes.forEach((mesh,layer)=>{
    if(!mesh.edges.length)return;
    if(mesh.style?.faces){
      // 先畫填色面與外擴的淡暈，再畫線與節點，讓骨架保持清楚。
      blendMode(ADD);noStroke();
      const [r,g,b]=mesh.style.faceColor;
      for(const face of mesh.style.faces){
        const c=[0,1,2].map(k=>(face.points[0][k]+face.points[1][k]+face.points[2][k])/3);
        for(const [scaleUp,alpha] of [[CREATURE_LOOK.faceHaloScale,CREATURE_LOOK.faceHalo],[1,CREATURE_LOOK.faceAlpha]]){
          fill(r,g,b,alpha*face.alpha*appearance.opacity);
          beginShape(TRIANGLES);
          for(const p of face.points)vertex(...p.map((v,k)=>c[k]+(v-c[k])*scaleUp));
          endShape();
        }
      }
    }
    blendMode(ADD);noFill();
    // 由寬而淡的光暈畫到細線；微光強度設為 0 即可關閉。
    for(const pass of [{width:5,alpha:4},{width:3,alpha:10},{width:0,alpha:0}]){
      const halo=pass.width>0;
    if(halo&&PARAMS.glowStrength===0)continue;
      strokeWeight(halo?pass.width:PARAMS.lineWidth*(layer?.75:1));
      beginShape(LINES);
      for(const [edgeIndex,[a,b]] of mesh.edges.entries()){
        const depth=mesh.source4D ? (mesh.source4D[a][3]+mesh.source4D[b][3])/(2*Math.SQRT2*PARAMS.halfSize) : 0;
        const look=mesh.style?mesh.style.edge[edgeIndex]*(mesh.style.alpha??1):.96+.04*depth;
        const alpha=(halo?pass.alpha*PARAMS.glowStrength*breathing.glow*(layer?.5:1):(layer?150*corePulse:245))*look*PARAMS.lineBrightness;
        stroke(255,255,255,alpha*appearance.opacity);
        vertex(...project3DToScreen(mesh.points[a]));vertex(...project3DToScreen(mesh.points[b]));
      }endShape();
    }
    // 面保持空白，避免把密集骨架填成一團發亮的實體。
    // 與骨架共用透視：近處圓點較大，遠處較小。
    const radius=PARAMS.nodeRadius*(layer?.7:1)*appearance.nodeScale;
    const nodeStyle=index=>mesh.style?mesh.style.node[index]:1;
    const rings=globalThis.drifterCore?.rings(mesh.points,mesh.points.map((_,index)=>radius*nodeStyle(index)*(mesh.source4D?
      PARAMS.projectionDistance/(PARAMS.projectionDistance-mesh.source4D[index][3]):1)),axes);
    for(const pass of [{width:4,alpha:5},{width:2.4,alpha:11},{width:0,alpha:0}]){
    const halo=pass.width>0;
    if(halo&&PARAMS.glowStrength===0)continue;
    if(halo){blendMode(ADD);noFill();}
    else{blendMode(BLEND);fill(0,255*appearance.opacity);}
    stroke(255,255,255,(halo?pass.alpha*PARAMS.glowStrength*breathing.glow*(layer?.5:1):(layer?190:255)*breathing.nodeLight)*appearance.opacity);
    strokeWeight(halo?pass.width:PARAMS.nodeLineWidth*(layer?.75:1));
    for(const [index,point] of mesh.points.entries()){
      const perspective=mesh.source4D?PARAMS.projectionDistance/(PARAMS.projectionDistance-mesh.source4D[index][3]):1;
      const p=project3DToScreen(point);beginShape();
      if(rings){for(const v of rings[index])vertex(...v);}
      else for(let j=0;j<24;j++){
        const angle=j/24*Math.PI*2;
        vertex(...p.map((v,k)=>v+radius*nodeStyle(index)*perspective*(Math.cos(angle)*axes.right[k]+Math.sin(angle)*axes.up[k])));
      }endShape(CLOSE);
    }
    }
  });blendMode(BLEND);
}
// 小生物保有獨立三維形體，不參與四維切面。
function createFoodMeshes(){
  const tetra=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
  const cube=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])cube.push([x,y,z]);
  const octa=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const prism=[];
  for(const z of [-.8,.8])for(let i=0;i<3;i++)prism.push([Math.cos(i*Math.PI*2/3),Math.sin(i*Math.PI*2/3),z]);
  const regular=(points,length)=>({points,faces:[],edges:points.flatMap((p,i)=>
    points.slice(i+1).flatMap((q,j)=>Math.abs(Math.hypot(...sub(p,q))-length)<EPS?[[i,i+j+1]]:[]))});
  const crown=Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3),0]);
  const spindle=[[0,0,-1.8],[0,0,1.8],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]];
  const bodies=[regular(tetra,Math.sqrt(8)),regular(cube,2),regular(octa,Math.SQRT2),
    {points:prism,faces:[],edges:[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]},
    {points:[...crown,[0,0,.8],[0,0,-.8]],faces:[],edges:crown.flatMap((_,i)=>[[i,(i+1)%6],[i,6],[i,7]])},
    {points:spindle,faces:[],edges:[2,3,4,5].flatMap(i=>[[0,i],[1,i],[i,i===5?2:i+1]])}];
  return bodies.map((body,kind)=>addAppendages(body,APPENDAGES[kind]));
}
// 本體 +z 為前方：尾絲接在最後方的頂點，觸鬚接在最前方的頂點。
// bodyCount 之前的點是本體（用來算碰撞半徑），之後的點是會擺動的附肢。
const APPENDAGES=[{tail:3,whiskers:true},{tail:2},{tail:3,whiskers:true},{tail:2},{tail:3,whiskers:true},{tail:3}];
function addAppendages(body,{tail=0,whiskers=false}){
  const points=body.points.map(p=>p.slice()),edges=body.edges.map(e=>e.slice()),bodyCount=points.length;
  const zs=points.map(p=>p[2]),back=Math.min(...zs),front=Math.max(...zs);
  const rear=points.map((_,i)=>i).filter(i=>points[i][2]<back+EPS);
  let previous=null;
  for(let s=0;s<tail;s++){
    points.push([0,0,back-.95*(s+1)]);
    const id=points.length-1;
    if(s===0)for(const i of rear)edges.push([i,id]);else edges.push([previous,id]);
    previous=id;
  }
  if(whiskers){
    const nose=points.map((_,i)=>i).filter(i=>i<bodyCount&&points[i][2]>front-EPS);
    for(const side of [1,-1]){
      const tip=[.75*side,.3*side,front+1.4];
      points.push(tip);
      const id=points.length-1,near=nose.reduce((a,i)=>Math.hypot(...sub(points[i],tip))<Math.hypot(...sub(points[a],tip))?i:a,nose[0]);
      edges.push([near,id]);
    }
  }
  return {...body,points,edges,bodyCount};
}
const foodMeshes=createFoodMeshes();
// 活動空間相對原版放大的倍數；初始位置、邊界、警戒距離與鏡頭都照這個比例。
const SPACE=1.5;
// 初始散落位置與形體；活動狀態由 Ecosystem 另外保存。
const foodItems=[
  {kind:0,position:[-235,-140,-100],size:12,phase:.3},
  {kind:1,position:[210,-165,-160],size:12,phase:1.1},
  {kind:2,position:[245,35,45],size:19,phase:2.2},
  {kind:3,position:[95,190,-80],size:17,phase:.7},
  {kind:1,position:[-180,145,75],size:11,phase:2.8},
  {kind:2,position:[-260,25,-190],size:16,phase:1.7}
];
// 小型個體分散在不同深度；同樣參與逃跑、捕食、消化與補入。
for(let i=0;i<21;i++){
  const angle=i*2.3999632297;
  foodItems.push({kind:i%6,position:[Math.cos(angle)*(150+i*6),Math.sin(angle)*(110+i*4),-170+(i%5)*74],
    size:7+(i%4)*2,phase:angle});
}
for(const item of foodItems)item.position=item.position.map(v=>v*SPACE);
const LIFE={bounds:[290*SPACE,200*SPACE,210*SPACE],danger:180*SPACE,respawnDelay:12};
// 群聚：半徑內的同伴會互相靠攏與對齊；被追時不靠攏，改為加強互斥而散開。
const FLOCK={radius:150,comfort:45,cohesion:.5,align:.7,separation:1.8,fleeSeparation:3.2};
// 游動節奏：划一下、滑行、再划一下。floor 是滑行時的速度倍率，burst 是划動峰值。
const STROKE={rate:4.2,floor:.4,burst:1.6};
const strokeLevel=(time,phase)=>{const s=Math.max(0,Math.sin(time*STROKE.rate+phase*5));return s*s;};
// 回傳 [速度倍率, 閃避軸一, 閃避軸二]；Rust 與 JS 備援共用同一組數值，避免三角函數差異累積。
const preyRhythm=(p,time)=>[STROKE.floor+STROKE.burst*strokeLevel(time,p.phase),
  Math.sin(time*7.3+p.phase*3),Math.cos(time*4.1+p.phase*2)];
const FX={consumeDuration:4.5,birthDuration:1.25,restitution:.45,maxEffects:48,
  squishTime:.18,scatterTime:.75,absorbStrength:48,absorbRamp:.25,trailSamples:22,viscosity:3.4};
const safeDirection=v=>{const n=Math.hypot(...v);return n>EPS?v.map(x=>x/n):[1,0,0];};
const clamp01=x=>Math.max(0,Math.min(1,x));
// 五次緩動曲線：每段起終點的速度與加速度都歸零。
const easeInOut=t=>{t=clamp01(t);return t*t*t*(t*(t*6-15)+10);};
function pulseAt(phase){
  // 一整輪連續波形，經過原尺寸時仍在運動，不在每段接點停住。
  const wave=-Math.sin(phase*Math.PI*2);
  return {stretch:1+.12*wave,speed:1+.28*wave};
}
function flourishAt(timer){
  const u=clamp01(1-timer/2.4),progress=easeInOut(u);
  return {roll:progress*Math.PI*2,bloom:Math.sin(Math.PI*progress)**2};
}
// 臨界阻尼：保留姿態與變化速度，改變目標時不重新播放過渡。
function settleMotion(state,key,target,dt,rate=4){
  const velocityKey=key+'Velocity',velocity=state[velocityKey]||0;
  const offset=state[key]-target,j=velocity+rate*offset,decay=Math.exp(-rate*dt);
  state[key]=target+(offset+j*dt)*decay;
  state[velocityKey]=(velocity-rate*j*dt)*decay;
}
function hunterPose(h){
  const a=PARAMS.exploreAmount;
  return {scale:1+(h.motion.scale-1)*a,tilt:h.motion.tilt*a,turn:h.motion.turn*a};
}
// 前半部骨架向四瓣漏斗舒展；後半部保留推進用的軀幹。
function cagePoint(point,cage){
  if(!cage||cage.open<=0)return point;
  const axis=cage.axis,z=dot(point,axis),front=easeInOut((z+35)/140);
  const radial=point.map((v,k)=>v-axis[k]*z),r=Math.hypot(...radial);
  const tangent=safeDirection(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0]));
  const bitangent=cross(axis,tangent),angle=Math.atan2(dot(radial,bitangent),dot(radial,tangent));
  const petal=.85+.15*Math.cos(angle*4),opening=cage.open*front;
  const spread=1+opening*1.05*petal,depth=z-opening*(30+z*.22);
  return point.map((_,k)=>axis[k]*depth+radial[k]*spread+(r<1?0:radial[k]/r*opening*24));
}
const fragmentHalf=(f,age)=>f.half?rotatePlane(rotatePlane(f.half,0,2,age*f.spin),1,2,age*f.spin*.7):null;
// 小生物的身體：長軸對準前進方向，划動時縮短再伸長，尾端與觸鬚像波一樣擺動。
// 只算畫面與接觸用的點位，純 JS（約三十隻、每隻十餘點，成本可忽略），不經 Rust。
const BODY={length:1.3,pulse:.25,squeeze:.12,startleStretch:.35,wave:.3,waveRate:5.5,waveNumber:1.6,rollRate:.3};
function smallCreaturePoints(food,time,growth=1,position=food.position){
  const heading=food.heading||[0,0,1],swim=food.swim??.3,startle=food.startle||0;
  const level=strokeLevel(time,food.phase),amplitude=BODY.wave*(.3+.7*clamp01(swim));
  const stretch=BODY.length*(1+BODY.pulse*level+BODY.startleStretch*startle),side=(1-BODY.squeeze*level)/Math.sqrt(stretch/BODY.length);
  const helper=Math.abs(heading[1])<.9?[0,1,0]:[1,0,0];
  const right=safeDirection(cross(helper,heading)),up=cross(heading,right);
  const roll=food.phase+time*BODY.rollRate,cr=Math.cos(roll),sr=Math.sin(roll);
  return foodMeshes[food.kind].points.map(p=>{
    const z=p[2]*stretch;
    // 頭部不動、越往尾端擺幅越大。
    const tail=clamp01((1.2-z)/3.5),sway=amplitude*tail*Math.sqrt(tail),phase=z*BODY.waveNumber-time*BODY.waveRate+food.phase;
    const x=p[0]*side+sway*Math.sin(phase),y=p[1]*side+sway*.5*Math.cos(phase);
    const lx=x*cr-y*sr,ly=x*sr+y*cr,scale=food.size*growth;
    return position.map((c,k)=>c+(right[k]*lx+up[k]*ly+heading[k]*z)*scale);
  });
}
// 有限線段的最近點；包含平行、端點與零長度情況。
function segmentContact(p1,q1,p2,q2){
  if(globalThis.drifterCore)return globalThis.drifterCore.segmentContact(p1,q1,p2,q2);
  const d1=sub(q1,p1),d2=sub(q2,p2),r=sub(p1,p2);
  const a=dot(d1,d1),e=dot(d2,d2),f=dot(d2,r);let s=0,t=0;
  if(a<=EPS){t=e>EPS?clamp01(f/e):0;}
  else{
    const c=dot(d1,r);
    if(e<=EPS)s=clamp01(-c/a);
    else{
      const b=dot(d1,d2),denom=a*e-b*b;
      s=denom>EPS?clamp01((b*f-c*e)/denom):0;t=(b*s+f)/e;
      if(t<0){t=0;s=clamp01(-c/a);}else if(t>1){t=1;s=clamp01((b-c)/a);}
    }
  }
  const first=p1.map((v,k)=>v+d1[k]*s),second=p2.map((v,k)=>v+d2[k]*t);
  return {first,second,distance:Math.hypot(...sub(first,second))};
}
function hunterCollisionMeshes(meshes,breathing,pose,time,h=null){
  const flourish=flourishAt(h?.somersaultTimer??0);
  const stretch=h?1+(pulseAt(h.pulsePhase).stretch-1)*h.motion.drive*(1-.45*flourish.bloom):1;
  const bloom=h?1+.12*flourish.bloom:1;
  if(globalThis.drifterCore)return globalThis.drifterCore.transform(meshes,stretch,breathing.scale*pose.scale*bloom,
    pose.tilt+.012*Math.sin(time*.19)+(h?flourish.roll:0),-pose.turn-.022*Math.sin(time*.27),h?h.motion.axis:[1,0,0],h?.cage);
  return meshes.map(mesh=>({...mesh,points:mesh.points.map(p=>{
    let q=p.slice(0,3);
    // 伸展沿實際游動方向；靜止時沿用最後的方向，避免低速翻面。
    if(h){const along=dot(q,h.motion.axis),side=1/Math.sqrt(stretch);
      q=q.map((v,k)=>v*side+h.motion.axis[k]*along*(stretch-side));}
    q=q.map(v=>v*breathing.scale*pose.scale*bloom);
    q=rotatePlane(q,0,1,pose.tilt+.012*Math.sin(time*.19)+(h?flourish.roll:0));
    q=rotatePlane(q,0,2,-pose.turn-.022*Math.sin(time*.27));
    return h?cagePoint(q,h.cage):q;
  })}));
}
class Ecosystem {
  constructor(items,random=Math.random){
    this.random=random;this.time=0;this.captures=0;this.effects=[];
    this.prey=items.map((item,id)=>({...item,id,position:item.position.slice(),velocity:[0,0,0],
      direction:this.randomDirection(),intent:0,energy:1,mode:'wander',alive:true,respawn:0,
      heading:[0,0,1],swim:0,startle:0,scatter:0,
      birth:FX.birthDuration,radius:item.size*Math.max(...foodMeshes[item.kind].points.slice(0,foodMeshes[item.kind].bodyCount).map(p=>Math.hypot(...p))),
      mass:(item.size/12)**3}));
    this.hunter={position:[0,0,0],velocity:[0,0,0],energy:1,hunger:.8,
      mode:'wander',target:null,commit:0,cooldown:0,radius:32,mass:12,
      jiggle:0,jiggleNormal:[1,0,0],
      pulseTime:0,pulsePhase:0,pulseRate:1/2.4,hyperOffset:0,
      motion:{scale:1,tilt:0,turn:0,drive:.65,axis:[1,0,0]},
      cage:{phase:'idle',open:0,axis:[1,0,0],preyId:null,timer:0},
      somersaultTimer:0,somersaultCooldown:7+this.random()*6};
    this.hunterMeshes=[project4DTo3D(sample4DBody(generate4DBody(),0))];
    this.hunterExtent=200;
  }
  emit(type,position,extra={}){
    this.effects.push({type,position:position.slice(),age:0,
      duration:type==='consume'?FX.consumeDuration:type==='birth'?FX.birthDuration:.4,...extra});
    if(this.effects.length>FX.maxEffects)this.effects.shift();
  }
  collide(a,b){
    const offset=sub(b.position,a.position),distance=Math.hypot(...offset),radius=a.radius+b.radius;
    if(distance>=radius)return false;
    const normal=safeDirection(offset),ia=1/a.mass,ib=1/b.mass,total=ia+ib;
    // 依質量分攤重疊修正；只對彼此靠近的速度施加回彈衝量。
    const overlap=radius-distance;
    for(let k=0;k<3;k++){
      a.position[k]-=normal[k]*overlap*ia/total;
      b.position[k]+=normal[k]*overlap*ib/total;
    }
    const closing=dot(sub(b.velocity,a.velocity),normal);
    if(closing<0){
      const impulse=-(1+FX.restitution)*closing/total;
      for(let k=0;k<3;k++){
        a.velocity[k]-=normal[k]*impulse*ia;b.velocity[k]+=normal[k]*impulse*ib;
      }
      if(closing<-8)this.emit('impact',a.position.map((v,k)=>v+normal[k]*a.radius));
    }
    return true;
  }
  preyContact(p){
    const h=this.hunter;
    if(Math.hypot(...sub(p.position,h.position))>this.hunterExtent+p.radius+8)return null;
    const growth=clamp01(p.birth/FX.birthDuration),size=growth*growth*(3-2*growth);
    const points=smallCreaturePoints(p,this.time,size),edges=foodMeshes[p.kind].edges;
    const thickness=PARAMS.lineWidth; // 兩條白線的合併半徑。
    for(const mesh of this.hunterMeshes)for(const [ia,ib] of mesh.edges){
      const a=mesh.points[ia].map((v,k)=>v+h.position[k]),b=mesh.points[ib].map((v,k)=>v+h.position[k]);
      if(segmentContact(a,b,p.position,p.position).distance>p.radius+8)continue;
      for(const point of points){
        const hit=segmentContact(a,b,point,point);
        if(hit.distance<=PARAMS.nodeRadius*size+thickness*.5)return hit;
      }
      for(const [i,j] of edges){
        const hit=segmentContact(a,b,points[i],points[j]);
        if(hit.distance<=thickness)return hit;
        // 端點的空心圓以小球近似；不是整隻生物的包圍球。
        for(const endpoint of [a,b]){
          const nodeHit=segmentContact(endpoint,endpoint,points[i],points[j]);
          if(nodeHit.distance<=PARAMS.nodeRadius+thickness*.5)return nodeHit;
        }
      }
    }
    return null;
  }
  shatter(p,hit,internal=false){
    const h=this.hunter;
    // 以身體中心到接觸位置的方向定義外側，避免最近點法線指向骨架內部。
    const radial=sub(hit.first,h.position);
    const normal=safeDirection(Math.hypot(...radial)>EPS?radial:sub(p.position,h.position));
    const closing=Math.min(0,dot(sub(p.velocity,h.velocity),normal));
    const impulse=-(1+FX.restitution)*closing/(1/p.mass+1/h.mass);
    for(let k=0;k<3;k++){p.velocity[k]+=normal[k]*impulse/p.mass;h.velocity[k]-=normal[k]*impulse/h.mass;}
    const t=clamp01(p.birth/FX.birthDuration),points=smallCreaturePoints(p,this.time,t*t*(3-2*t));
    const fragments=[];
    const add=(position,half=null)=>{
      const outward=safeDirection(sub(position,p.position));
      // 隨機散射風暴：每個碎片具備不同速度、擾動角度與自轉，形成範圍更廣、更自然的微觀噴散
      const rndDir=safeDirection([this.random()-.5,this.random()-.5,this.random()-.5]);
      const mixed=safeDirection(outward.map((v,k)=>v*.55+rndDir[k]*.6));
      const speed=(54+this.random()*58)+Math.min(95,-closing*.75);
      const tangent=mixed.map((v,k)=>v-normal[k]*dot(mixed,normal));
      const relative=sub(p.velocity,h.velocity);
      const normalSpeed=Math.max(36,Math.abs(dot(rndDir,normal))*24+dot(relative,normal)*.65+speed*.52);
      const velocity=relative.map((v,k)=>h.velocity[k]+(v-normal[k]*dot(relative,normal))*.65+
        tangent[k]*speed*.98+normal[k]*normalSpeed);
      const spin=(this.random()*2.4+1.3)*(this.random()>.5?1:-1);
      const driftPhase=this.random()*Math.PI*2,driftFreq=2.2+this.random()*3.2,driftAmp=1.8+this.random()*2.8;
      const swirlAxis=safeDirection([this.random()-.5,this.random()-.5,this.random()-.5]);
      const swirlSpeed=(this.random()*32+26)*(this.random()>.5?1:-1);
      const wavePhase=this.random()*Math.PI*2,waveFreq=2.6+this.random()*3.2,waveAmp=16+this.random()*18;
      fragments.push({position:position.slice(),velocity,
        half,spin,driftPhase,driftFreq,driftAmp,swirlAxis,swirlSpeed,wavePhase,waveFreq,waveAmp,
        history:[position.slice()],absorbed:false});
    };
    points.forEach(point=>add(point));
    for(const [a,b] of foodMeshes[p.kind].edges)add(points[a].map((v,k)=>(v+points[b][k])/2),
      points[a].map((v,k)=>(points[b][k]-v)/2));
    // 用包住整個可見骨架的支撐平面阻擋碎片，避免從鏤空線框穿入。
    const surface=this.fragmentSurface(normal),clearance=internal?0:Math.max(0,...fragments.map(f=>
      surface+(f.half?Math.abs(dot(f.half,normal))+PARAMS.lineWidth/2:PARAMS.nodeRadius)-
      dot(sub(f.position,h.position),normal)));
    for(const f of fragments){
      if(internal)f.velocity=f.velocity.map((v,k)=>h.velocity[k]+(v-h.velocity[k])*.08);
      f.position=f.position.map((v,k)=>v+normal[k]*clearance);
      f.history=[f.position.slice()];
    }
    this.emit('consume',p.position,{fragments,trailClock:0,normal,internal,separation:normal.map(v=>v*clearance),
      kind:p.kind,size:p.size,phase:p.phase,birth:p.birth,heading:p.heading.slice(),swim:p.swim,startle:p.startle});
    if(!internal)this.emit('impact',hit.first);
    h.jiggle=internal?.15:1;h.jiggleNormal=normal.slice();
    if(!internal&&h.somersaultTimer<=0)h.somersaultTimer=2.4;
    h.somersaultCooldown=10+this.random()*6;
    p.alive=false;p.mode='captured';p.respawn=LIFE.respawnDelay;
    this.captures++;h.hunger=Math.max(0,h.hunger-.6);h.energy=clamp01(h.energy+.2);
    h.cooldown=3;h.target=null;h.mode='wander';
  }
  fragmentSurface(normal){
    return Math.max(0,...this.hunterMeshes.flatMap(m=>m.points.map(p=>dot(p.slice(0,3),normal))))+PARAMS.nodeRadius+1;
  }
  blockFragment(f,effect){
    const n=effect.normal,half=fragmentHalf(f,effect.age);
    const extent=half?Math.abs(dot(half,n))+PARAMS.lineWidth/2:PARAMS.nodeRadius;
    const penetration=this.fragmentSurface(n)+extent-dot(sub(f.position,this.hunter.position),n);
    if(penetration<=0)return;
    for(let k=0;k<3;k++)f.position[k]+=n[k]*penetration;
    const inward=dot(sub(f.velocity,this.hunter.velocity),n);
    if(inward<0)for(let k=0;k<3;k++)f.velocity[k]-=(1+FX.restitution)*inward*n[k];
  }
  updateFragments(effect,dt){
    if(globalThis.drifterCore)return globalThis.drifterCore.fragments(this,effect,dt,FX,PARAMS);
    effect.trailClock+=dt;
    const sample=effect.trailClock>=1/60;if(sample)effect.trailClock%=1/60;
    for(const f of effect.fragments){
      if(f.absorbed){if(sample)f.history.shift();continue;}
      const scatterTime=effect.internal?.12:FX.scatterTime;
      const attraction=effect.age>scatterTime;
      const pull=clamp01((effect.age-scatterTime)/FX.absorbRamp);
      const drag=attraction?9.5:FX.viscosity;
      const toHunter=sub(this.hunter.position,f.position);
      const dist=Math.hypot(...toHunter);
      const inDir=safeDirection(toHunter);
      const axis=f.swirlAxis||[0,1,0];
      const swirlRaw=cross(inDir,axis);
      const swirlDir=safeDirection(Math.hypot(...swirlRaw)>EPS?swirlRaw:[0,1,0]);
      const waveDir=safeDirection(cross(inDir,swirlDir));
      // 大幅度有感的橫向螺旋與波浪速度（與向心速度相當，確保視覺呈現顯著螺旋弧線）
      const swirlSpeed=attraction?(f.swirlSpeed||46)*pull*Math.min(1.8,0.25+dist/26):0;
      const waveSpeed=attraction?(f.waveAmp||32)*pull*Math.sin(effect.age*(f.waveFreq||3.5)+(f.wavePhase||0))*Math.min(1.5,0.2+dist/24):0;
      const inSpeed=attraction?(32+dist*0.72)*pull:0;
      const wPhase=effect.age*(f.driftFreq||3.2)+(f.driftPhase||0),wAmp=!attraction?(f.driftAmp||2.2):0;
      const drift=[Math.cos(wPhase)*wAmp*.7,Math.sin(wPhase)*wAmp,Math.sin(wPhase*.7)*wAmp*.5];
      for(let k=0;k<3;k++){
        const targetVel=attraction?
          (inDir[k]*inSpeed + swirlDir[k]*swirlSpeed + waveDir[k]*waveSpeed) :
          drift[k];
        const acceleration=attraction?
          (targetVel-f.velocity[k])*drag :
          -f.velocity[k]*drag+drift[k];
        f.velocity[k]+=acceleration*dt;f.position[k]+=f.velocity[k]*dt;
      }
      if(!attraction&&!effect.internal)this.blockFragment(f,effect);
      if(sample){f.history.push(f.position.slice());if(f.history.length>FX.trailSamples)f.history.shift();}
      if(attraction&&Math.hypot(...sub(f.position,this.hunter.position))<7)f.absorbed=true;
    }
  }
  resolveCollisions(visible){
    if(globalThis.drifterCore)return globalThis.drifterCore.collisions(this,LIFE,FX);
    // 捕食改由開瓣包覆完成，擦過外側骨架不再直接吃掉。
    const live=this.prey.filter(p=>p.alive&&p.mode!=='trapped');
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)this.collide(live[i],live[j]);
      for(const a of [...this.prey.filter(p=>p.alive),this.hunter])for(let k=0;k<3;k++){
        if(Math.abs(a.position[k])>LIFE.bounds[k]){
          a.position[k]=Math.sign(a.position[k])*LIFE.bounds[k];
          if(a.velocity[k]*a.position[k]>0)a.velocity[k]*=-FX.restitution;
        }
      }
    }
  }
  rhythm(p){return preyRhythm(p,this.time);}
  // 只影響繪圖：朝向平順跟隨速度方向，swim 是 0~1 的游動強度。
  animatePrey(dt){
    const turn=1-Math.exp(-5*dt),ease=1-Math.exp(-6*dt);
    for(const p of this.prey){
      const speed=Math.hypot(...p.velocity);
      p.swim+=(clamp01(speed/110)-p.swim)*ease;
      if(speed>4)p.heading=safeDirection(p.heading.map((v,k)=>v+(p.velocity[k]/speed-v)*turn));
      // 近距離逃跑時解體（scatter→1），危險離開後慢慢重連（→0）；JS 與 Rust 路徑共用這一處。
      const scared=p.alive&&p.mode==='flee'&&Math.hypot(...sub(p.position,this.hunter.position))<LIFE.danger*SCATTER.fleeDistance;
      p.scatter=scared?Math.min(SCATTER.max,p.scatter+dt*SCATTER.breakRate):Math.max(0,p.scatter-dt*SCATTER.mendRate);
    }
  }
  randomDirection(){return safeDirection([this.random()-.5,this.random()-.5,(this.random()-.5)*.7]);}
  updateCage(dt,visible){
    const h=this.hunter,c=h.cage,p=this.prey[c.preyId];
    if(c.phase==='closing'){
      if(!visible||!p?.alive){
        if(p?.alive)p.mode='flee';
        c.phase='recover';c.timer=.8;c.preyId=null;
      }else{
        c.timer+=dt;
        // 把接住的位置連續拉向籠內，保留獵物的慣性及微小掙扎。
        const depth=65-40*easeInOut(c.timer/.95);
        const goal=h.position.map((v,k)=>v+c.axis[k]*depth+Math.sin(this.time*15+k*2)*3);
        for(let k=0;k<3;k++){
          p.velocity[k]+=(35*(goal[k]-p.position[k])-10*(p.velocity[k]-h.velocity[k]))*dt;
          p.position[k]+=p.velocity[k]*dt;
        }
        if(c.timer>=1.05&&c.open<.18){
          this.shatter(p,{first:p.position.slice()},true);
          c.phase='recover';c.timer=1.3;c.preyId=null;
        }
      }
    }else if(c.phase==='recover'){
      c.timer-=dt;if(c.timer<=0)c.phase='idle';
    }else{
      const target=this.prey[h.target],offset=target?sub(target.position,h.position):null;
      const distance=offset?Math.hypot(...offset):Infinity;
      const ready=visible&&h.mode==='hunt'&&target?.alive&&distance<235;
      c.phase=ready?'opening':'idle';
      if(ready&&distance>1){
        const desired=safeDirection(offset),follow=1-Math.exp(-3*dt);
        c.axis=safeDirection(c.axis.map((v,k)=>v+(desired[k]-v)*follow));
        const depth=dot(offset,c.axis),side=Math.sqrt(Math.max(0,distance*distance-depth*depth));
        if(c.open>.7&&depth>10&&depth<110&&side+target.radius<80){
          c.phase='closing';c.timer=0;c.preyId=target.id;target.mode='trapped';
        }
      }
    }
    settleMotion(c,'open',c.phase==='opening'?1:0,dt,c.phase==='closing'?5:3.5);
  }
  move(agent,direction,speed,dt,response){
    if(globalThis.drifterCore)return globalThis.drifterCore.move(agent,direction,speed,dt,response,LIFE.bounds);
    const desired=safeDirection(direction).map(v=>v*speed);
    for(let k=0;k<3;k++){
      // 先柔和轉回活動區；最後一道限制避免低幀率穿出邊界。
      const p=agent.position[k],limit=LIFE.bounds[k];
      desired[k]-=Math.sign(p)*Math.max(0,Math.abs(p)-limit*.78)*2.5;
    }
    const length=Math.hypot(...desired),factor=length>speed?speed/length:1;
    // 意圖先轉彎，身體速度再跟上；保留慣性，避免換目標時加速度突變。
    if(!agent.steering)agent.steering=agent.velocity.slice();
    for(let k=0;k<3;k++){
      agent.steering[k]+=(desired[k]*factor-agent.steering[k])*(1-Math.exp(-3*dt));
      agent.velocity[k]+=(agent.steering[k]-agent.velocity[k])*(1-Math.exp(-response*dt));
      agent.position[k]+=agent.velocity[k]*dt;
      if(Math.abs(agent.position[k])>LIFE.bounds[k]){
        agent.position[k]=Math.sign(agent.position[k])*LIFE.bounds[k];agent.velocity[k]*=-.3;
      }
    }
  }
  update(dt,visible=true,heading=0,meshes=null){
    if(!(dt>0))return;
    if(meshes){this.hunterMeshes=meshes;this.hunterExtent=Math.max(0,...meshes.flatMap(m=>m.points.map(p=>Math.hypot(...p.slice(0,3)))));}
    let remaining=Math.min(dt,.05);
    while(remaining>EPS){const h=Math.min(remaining,1/120);this.step(h,visible,heading);remaining-=h;}
  }
  step(dt,visible,heading){
    this.time+=dt;const h=this.hunter;
    for(const effect of this.effects){effect.age+=dt;if(effect.fragments)this.updateFragments(effect,dt);}
    this.effects=this.effects.filter(effect=>effect.age<effect.duration);
    if(globalThis.drifterCore)globalThis.drifterCore.preyStep(this,dt,visible,LIFE,FX);
    else for(const p of this.prey){
      if(!p.alive){
        p.respawn-=dt;
        if(p.respawn<=0){
          // 新個體從離獵者最遠的邊緣進場，避免在牠面前立即被捕。
          const candidates=Array.from({length:8},()=>{
            const q=this.randomDirection();const extent=Math.max(...q.map((v,k)=>Math.abs(v)/LIFE.bounds[k]));
            return q.map(v=>v/extent*.94);
          });
          candidates.sort((a,b)=>Math.hypot(...sub(b,h.position))-Math.hypot(...sub(a,h.position)));
          p.position=candidates[0];p.velocity=[0,0,0];p.steering=[0,0,0];p.energy=1;p.alive=true;p.mode='wander';p.intent=0;p.startle=0;
          p.birth=0;this.emit('birth',p.position,{preyId:p.id});
        }
        continue;
      }
      p.birth=Math.min(FX.birthDuration,p.birth+dt);
      if(p.mode==='trapped')continue;
      const away=sub(p.position,h.position),distance=Math.hypot(...away);
      const fleeing=visible&&distance<LIFE.danger;
      // 剛被發現的瞬間驚嚇：startle=1 後漸退，期間加速並加快轉向。
      p.startle=fleeing&&p.mode!=='flee'?1:Math.max(0,p.startle-dt*2.2);
      p.energy=clamp01(p.energy+dt*(fleeing?-.09:.07));
      p.mode=fleeing?'flee':p.energy<.45?'recover':'wander';
      p.intent-=dt;
      if(p.intent<=0){p.direction=this.randomDirection();p.intent=.8+this.random()*2;}
      const rhythm=preyRhythm(p,this.time);
      let direction=p.direction.slice();
      if(fleeing){
        const predicted=h.position.map((v,k)=>v+h.velocity[k]*.35);
        const escape=safeDirection(sub(p.position,predicted));
        // 兩條垂直於逃離方向的軸，左右交錯閃避，讓路線不能被預測。
        const s1=safeDirection(cross(escape,Math.abs(escape[1])<.9?[0,1,0]:[1,0,0])),s2=cross(escape,s1);
        direction=escape.map((v,k)=>v*2+p.direction[k]*.65+s1[k]*rhythm[1]*.9+s2[k]*rhythm[2]*.5);
      }
      // 鄰近個體互相讓開；半徑內的同伴（未被關籠者）還會靠攏、對齊，被追時改為散開。
      const gain=fleeing?FLOCK.fleeSeparation:FLOCK.separation;
      const centre=[0,0,0],heading=[0,0,0];let mates=0;
      for(const other of this.prey)if(other!==p&&other.alive){
        const offset=sub(p.position,other.position),d=Math.hypot(...offset);
        if(d<55)direction=direction.map((v,k)=>v+safeDirection(offset)[k]*(1-d/55)*gain);
        if(d<FLOCK.radius&&other.mode!=='trapped'){
          mates++;
          for(let k=0;k<3;k++)centre[k]+=other.position[k];
          const s=Math.hypot(...other.velocity);
          if(s>1)for(let k=0;k<3;k++)heading[k]+=other.velocity[k]/s;
        }
      }
      if(!fleeing&&mates>0){
        const toCentre=centre.map((v,k)=>v/mates-p.position[k]),gap=Math.hypot(...toCentre);
        if(gap>FLOCK.comfort)direction=direction.map((v,k)=>v+toCentre[k]/gap*FLOCK.cohesion);
        const aligned=Math.hypot(...heading);
        if(aligned>EPS)direction=direction.map((v,k)=>v+heading[k]/aligned*FLOCK.align);
      }
      const base=fleeing?60+70*p.energy:p.mode==='recover'?16:30;
      this.move(p,direction,base*rhythm[0]*(1+1.4*p.startle),dt,4+10*p.startle);
    }
    this.animatePrey(dt);
    h.hunger=clamp01(h.hunger+dt*.022);h.cooldown=Math.max(0,h.cooldown-dt);h.commit-=dt;
    if(h.jiggle>0)h.jiggle=Math.max(0,h.jiggle-dt*3.5);
    // 水母脈衝推進與四維特技伸展計時
    h.pulseTime+=dt;
    h.somersaultCooldown-=dt;
    if(h.somersaultCooldown<=0&&h.mode==='wander'&&h.cage.phase==='idle'&&h.somersaultTimer<=0){
      h.somersaultTimer=2.4;h.somersaultCooldown=10+this.random()*8;
    }
    if(h.somersaultTimer>0)h.somersaultTimer=Math.max(0,h.somersaultTimer-dt);
    // 累積額外旋轉量，舒展收尾時只減速，不把四維時間倒回去。
    h.hyperOffset+=dt*flourishAt(h.somersaultTimer).bloom*.85;
    const pulsePeriod=h.mode==='hunt'?1.4:h.mode==='rest'?3.6:2.4;
    // 只逐漸改變頻率，切換行為不會把目前週期重新定位。
    h.pulseRate+=(1/pulsePeriod-h.pulseRate)*(1-Math.exp(-2*dt));
    h.pulsePhase=(h.pulsePhase+dt*h.pulseRate)%1;
    const pulseSpeedMult=pulseAt(h.pulsePhase).speed;
    const resting=h.energy<.2||(h.mode==='rest'&&h.energy<.72);
    if(!visible||resting||h.cooldown>0||h.hunger<.35){
      h.mode=!visible?'hidden':resting?'rest':'wander';h.target=null;
    }else{
      if(h.target===null||!this.prey[h.target]?.alive||h.commit<=0){
        const candidates=this.prey.filter(p=>p.alive);
        candidates.sort((a,b)=>Math.hypot(...sub(a.position,h.position))-Math.hypot(...sub(b.position,h.position)));
        h.target=candidates[0]?.id??null;h.commit=5+this.random()*3;
      }
      h.mode=h.target===null?'wander':'hunt';
    }
    h.energy=clamp01(h.energy+dt*(h.mode==='hunt'?-.045:.085));
    const target=this.prey[h.target];
    let direction=[Math.cos(heading),Math.sin(heading),Math.sin(this.time*.23)*.4];
    if(h.mode==='hunt'){
      const lead=Math.min(.65,Math.hypot(...sub(target.position,h.position))/150);
      direction=target.position.map((v,k)=>v+target.velocity[k]*lead-h.position[k]);
    }
    const baseSpeed=h.cage.phase==='closing'?12:h.cage.phase==='recover'?10:h.mode==='hunt'?68+24*h.energy:h.mode==='rest'?6:18;
    this.move(h,direction,baseSpeed*pulseSpeedMult,dt,2.0);
    // 同一個身體由真實速度帶動，不再疊加 Explorer 的另一套表演。
    const speed=Math.hypot(...h.velocity),activity=clamp01(speed/85);
    const fullness=h.cage.phase==='recover'?.045*clamp01(h.cage.timer/1.3):0;
    settleMotion(h.motion,'scale',.94+.12*activity+fullness,dt,2.8);
    settleMotion(h.motion,'tilt',-h.velocity[0]*.0025,dt);
    settleMotion(h.motion,'turn',h.velocity[2]*.003,dt);
    settleMotion(h.motion,'drive',.35+.65*activity,dt,3);
    if(speed>2){
      const follow=1-Math.exp(-2*dt);
      // 伸縮軸正反等價，選較近的一側，掉頭時不讓軸穿過零向量。
      const sign=dot(h.motion.axis,h.velocity)<0?-1:1;
      const axis=h.motion.axis.map((v,k)=>v+(sign*h.velocity[k]/speed-v)*follow);
      if(Math.hypot(...axis)>.1)h.motion.axis=safeDirection(axis);
    }
    this.updateCage(dt,visible);
    this.resolveCollisions(visible);
  }
}
const ecosystem=new Ecosystem(foodItems,globalThis.drifterExperiment?.benchmark?seededRandom(43):Math.random);
// 低維生命的求生方式（世界觀「Disconnect → 危險離開 → Connect」）：
// 遇險時連線一條條斷開、節點各自漂開；危險離開後再連回原形。只影響繪圖，不改碰撞與 Rust。
// max：解體程度上限（<1 表示永遠留著部分邊，身體仍認得出來）；rate：每秒變化量，越小越慢。
const SCATTER={fleeDistance:.55,max:.6,breakRate:1.4,mendRate:.9,spread:1.1,drift:.2,driftRate:3};
const scatterNoise=(i,seed)=>{const x=Math.sin(i*127.1+seed*311.7)*43758.5453;return x-Math.floor(x);};
function renderSmallCreature(food,time,growth=1,opacity=1,position=food.position){
  const template=foodMeshes[food.kind];
  let points=smallCreaturePoints(food,time,growth,position),edges=template.edges;
  const s=food.scatter||0;
  if(s>.01){
    const reach=s*s*food.size*growth*SCATTER.spread;
    points=points.map((p,i)=>{
      const dir=safeDirection([0,1,2].map(k=>scatterNoise(i,food.phase+k)-.5));
      const wobble=1+SCATTER.drift*Math.sin(time*SCATTER.driftRate+i*1.7+food.phase);
      return p.map((v,k)=>v+dir[k]*reach*wobble);
    });
    edges=edges.filter((_,i)=>scatterNoise(i,food.phase+7)>s*.95);
  }
  // 受驚時光暈變亮，一眼看得出牠察覺到危險。
  renderCreature([{...template,points,edges}],{glow:.8+.9*(food.startle||0),nodeLight:1},{opacity,nodeScale:growth});
}
function renderFood(time){
  push();scale(Math.min(width,height)/560);
  for(const food of ecosystem.prey){
    if(!food.alive)continue;
    const t=clamp01(food.birth/FX.birthDuration),growth=t*t*(3-2*t);
    renderSmallCreature(food,time,growth,growth);
  }
  pop();
}
function renderConsumption(effect,time=0){
  const axes=cameraAxes(),fade=clamp01((effect.duration-effect.age)/.5);
  blendMode(ADD);noFill();
  if(effect.age<FX.squishTime&&effect.kind!==undefined){
    const u=clamp01(effect.age/FX.squishTime);
    const squish=Math.sin(Math.PI*u);
    const comp=1-0.54*squish,bulge=1+0.29*squish;
    const jitter=Math.sin(u*44)*squish*0.07;
    const n=effect.normal,center=effect.position.map((v,k)=>v+effect.separation[k]);
    const growth=clamp01((effect.birth||FX.birthDuration)/FX.birthDuration);
    const sz=growth*growth*(3-2*growth);
    const base=smallCreaturePoints({kind:effect.kind,size:effect.size,phase:effect.phase||0,
      heading:effect.heading,swim:effect.swim,startle:effect.startle},time,sz,[0,0,0]);
    const squished=globalThis.drifterCore?globalThis.drifterCore.squish(base,n,center,comp+jitter,bulge-jitter*.5):base.map(p=>{
      const proj=dot(p,n),perp=sub(p,n.map(v=>v*proj));
      return center.map((v,k)=>v+n[k]*proj*(comp+jitter)+perp[k]*(bulge-jitter*.5));
    });
    const squishAlpha=(1-u*u)*fade;
    const rings=globalThis.drifterCore?.rings(squished,squished.map(()=>PARAMS.nodeRadius*bulge),axes,16);
    for(const pass of [{width:3.5,alpha:22},{width:1.5,alpha:220}]){
      if(PARAMS.glowStrength===0&&pass.width>2)continue;
      strokeWeight(pass.width);stroke(255,255,255,pass.alpha*squishAlpha);
      for(const [a,b] of foodMeshes[effect.kind].edges){
        beginShape(LINES);vertex(...squished[a]);vertex(...squished[b]);endShape();
      }
      for(const [index,pt] of squished.entries()){
        beginShape();
        if(rings){for(const p of rings[index])vertex(...p);}
        else for(let i=0;i<16;i++){
          const angle=i/16*Math.PI*2;
          vertex(...pt.map((v,k)=>v+PARAMS.nodeRadius*bulge*(Math.cos(angle)*axes.right[k]+Math.sin(angle)*axes.up[k])));
        }
        endShape(CLOSE);
      }
    }
  }
  const burstFade=effect.age<FX.squishTime?clamp01(effect.age/FX.squishTime):1;
  const fragmentGeometry=globalThis.drifterCore?.fragmentGeometry(effect.fragments,effect.age,FX.scatterTime,PARAMS.nodeRadius,ecosystem.hunter.position,axes);
  for(const [index,fragment] of effect.fragments.entries()){
    // 歷史位置固定於世界座標，截游體移動時不會把整條殘影一起搬走。
    for(let j=1;j<fragment.history.length;j++){
      const strength=j/fragment.history.length;
      strokeWeight(.35+strength);stroke(255,255,255,110*strength*strength*fade*burstFade);
      beginShape(LINES);vertex(...fragment.history[j-1]);vertex(...fragment.history[j]);endShape();
    }
    if(fragment.absorbed)continue;
    const distance=Math.hypot(...sub(fragment.position,ecosystem.hunter.position));
    const shrink=effect.age>FX.scatterTime?Math.min(1,distance/25):1;
    for(const pass of [{width:4,alpha:18},{width:1.5,alpha:235}]){
      if(PARAMS.glowStrength===0&&pass.width>2)continue;
      strokeWeight(pass.width);stroke(255,255,255,pass.alpha*fade*burstFade);
      if(fragmentGeometry){
        if(fragment.half)beginShape(LINES);else beginShape();
        for(const p of fragmentGeometry[index])vertex(...p);
        if(fragment.half)endShape();else endShape(CLOSE);
      }else if(fragment.half){
        const half=fragmentHalf(fragment,effect.age);
        beginShape(LINES);
        for(const sign of [-1,1])vertex(...fragment.position.map((v,k)=>v+sign*half[k]*shrink));
        endShape();
      }else{
        beginShape();
        for(let i=0;i<16;i++){
          const a=i/16*Math.PI*2;
          vertex(...fragment.position.map((v,k)=>v+PARAMS.nodeRadius*shrink*(Math.cos(a)*axes.right[k]+Math.sin(a)*axes.up[k])));
        }
        endShape(CLOSE);
      }
    }
  }
}
function renderLifeEffects(time){
  push();scale(Math.min(width,height)/560);
  for(const effect of ecosystem.effects){
    if(effect.type==='consume'){renderConsumption(effect,time);continue;}
    const t=clamp01(effect.age/effect.duration),fade=Math.sin(Math.PI*t);
    const birth=effect.type==='birth';
    const center=birth?ecosystem.prey[effect.preyId].position:effect.position;
    blendMode(ADD);noFill();
    const radius=birth?8+42*t:3+26*(1-(1-t)*(1-t));
    const geometry=globalThis.drifterCore?.lifeGeometry(birth,t,radius,center);
    // 三個互相垂直的細光圈，保有三維空間感；不做全畫面閃光。
    for(const pass of [{width:3,alpha:12},{width:1,alpha:110}]){
      if(PARAMS.glowStrength===0&&pass.width>2)continue;
      strokeWeight(pass.width);stroke(255,255,255,pass.alpha*fade);
      if(geometry){for(const ring of geometry.rings){beginShape();for(const p of ring)vertex(...p);endShape(CLOSE);}}
      else for(const [a,b] of [[0,1],[1,2],[0,2]]){
        beginShape();
        for(let i=0;i<40;i++){
          const angle=i/40*Math.PI*2,p=center.slice();
          const ripple=birth?1:1+0.07*Math.sin(angle*6+t*12);
          p[a]+=Math.cos(angle)*radius*ripple;p[b]+=Math.sin(angle)*radius*ripple;vertex(...p);
        }
        endShape(CLOSE);
      }
    }
    // 新生與碰撞沿固定方向向外散，不消耗行為亂數。
    strokeWeight(1);stroke(255,255,255,140*fade);beginShape(LINES);
    if(geometry){for(const p of geometry.spokes)vertex(...p);}
    else for(let i=0;i<12;i++){
      const z=1-2*(i+.5)/12,angle=i*2.399963,r=Math.sqrt(1-z*z);
      const direction=[r*Math.cos(angle),r*Math.sin(angle),z];
      for(const d of [radius,radius+7*(1-t)])
        vertex(...center.map((v,k)=>v+direction[k]*d));
    }
    endShape();
  }
  blendMode(BLEND);pop();
}
function resetView(){observationCamera.camera(0,-115*SPACE,440*SPACE,0,0,0,0,1,0);observationCamera.perspective(Math.PI/3,width/height,1,4000);}
function setup(){
  if(globalThis.drifterExperiment?.low)PARAMS.glowStrength=0;
  // Benchmark both engines at the browser's rAF cadence, avoiding p5's default
  // 60 Hz cap being mistaken for an engine improvement on high-refresh screens.
  if(globalThis.drifterExperiment?.benchmark)frameRate(1000);
  const host=document.getElementById('canvas-host');const canvas=createCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight,WEBGL);
  if(host)canvas.parent(host);pixelDensity(globalThis.drifterExperiment?.low?1:Math.min(window.devicePixelRatio||1,2));observationCamera=createCamera();resetView();body=generate4DBody();
  document.getElementById('loading')?.remove();describe('白色線框截游體在三維空間追捕會逃跑的小生物，可切換完整四維骨架投影和真正三維截面，並暫停觀察。');
  const mode=document.getElementById('view-mode');if(mode){mode.value=viewMode;mode.onchange=()=>{viewMode=mode.value;updateModeLabels();};}updateModeLabels();
  const pause=document.getElementById('pause');if(pause)pause.onclick=()=>{paused=!paused;pause.textContent=paused?'繼續':'暫停';pause.setAttribute('aria-pressed',String(paused));};
  const reset=document.getElementById('reset');if(reset)reset.onclick=resetView;
  const capture=document.getElementById('capture');if(capture)capture.onclick=()=>saveCanvas('m2-24cell-'+viewMode,'png');
  canvas.elt.addEventListener('contextmenu',event=>event.preventDefault());
}
function updateModeLabels(){
  const environment=document.getElementById('environment');
  if(environment){environment.checked=TANK.enabled;environment.disabled=!!globalThis.drifterExperiment?.benchmark;environment.onchange=()=>{
    TANK.enabled=environment.checked;tankEnvironment.pulses=[];
    tankEnvironment.lastPhase=ecosystem.hunter.cage.phase;
  };}
  const label=document.getElementById('view-label'),caption=document.getElementById('view-caption');
  if(label)label.textContent=viewMode==='projection'?'24 胞體・四維骨架投影':'24 胞體・真正三維截面';
  if(caption)caption.textContent=viewMode==='projection'?'24 個頂點 / 96 條真實邊 / 四維旋轉':'同一四維母體 / w = s / 線性求交';
}
// Independent deterministic visual layer: no ecosystem random numbers or forces.
const TANK={particles:240,brightness:110,cornerLength:28*SPACE,enabled:true,linkDistance:85*SPACE,linkAlpha:38};
class TankEnvironment{
  constructor(){
    let seed=819;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    this.particles=Array.from({length:TANK.particles},()=>({
      position:LIFE.bounds.map(b=>(random()*2-1)*b),previous:null,phase:random()*Math.PI*2
    }));
    this.pulses=[];this.lastPhase='idle';
  }
  update(dt,time,h,visible){
    if(dt<=0||!TANK.enabled)return;
    const phase=visible?h.cage.phase:'idle';
    if(phase==='closing'&&this.lastPhase!=='closing'){
      this.pulses.push({position:h.position.slice(),age:0});
      if(this.pulses.length>4)this.pulses.shift();
    }
    this.lastPhase=phase;
    this.pulses.forEach(p=>p.age+=dt);
    this.pulses=this.pulses.filter(p=>p.age<3);
    for(const p of this.particles){
      const [x,y,z]=p.position;
      const velocity=[5+4*Math.sin(y/95+time*.15),2*Math.sin(z/100+time*.19+p.phase),3*Math.cos(x/130+time*.12)];
      if(visible&&phase==='opening'){
        const d=h.position.map((v,k)=>v-p.position[k]),r=Math.hypot(...d);
        if(r>1&&r<140)for(let k=0;k<3;k++)velocity[k]+=d[k]/r*12*(1-r/140);
      }
      for(const pulse of this.pulses){
        const d=p.position.map((v,k)=>v-pulse.position[k]),r=Math.hypot(...d);
        const force=26*Math.exp(-Math.pow((r-pulse.age*65)/28,2))*(1-pulse.age/3);
        if(r>1)for(let k=0;k<3;k++)velocity[k]+=d[k]/r*force;
      }
      p.previous=p.position.slice();
      for(let k=0;k<3;k++){
        p.position[k]+=velocity[k]*dt;
        const b=LIFE.bounds[k];
        if(Math.abs(p.position[k])>b){p.position[k]=((p.position[k]+b)%(2*b)+2*b)%(2*b)-b;p.previous=null;}
      }
    }
  }
  render(){
    if(!TANK.enabled)return;
    push();scale(Math.min(width,height)/560);noFill();strokeWeight(.65);
    stroke(255,255,255,25);beginShape(LINES);
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
      const signs=[x,y,z],corner=LIFE.bounds.map((b,k)=>b*signs[k]);
      for(let k=0;k<3;k++){
        const tip=corner.slice();tip[k]-=signs[k]*TANK.cornerLength;
        vertex(...corner);vertex(...tip);
      }
    }
    endShape();strokeWeight(1.4);stroke(255,255,255,TANK.brightness);beginShape(LINES);
    const stride=globalThis.drifterExperiment?.low?2:1;
    for(let i=0;i<this.particles.length;i+=stride){
      const p=this.particles[i],tail=p.previous?p.position.map((v,k)=>v+(p.previous[k]-v)*3):p.position;
      vertex(...tail);vertex(p.position[0]+2.2,p.position[1],p.position[2]);
    }
    endShape();
    // 點 → 線：靠近到門檻的粒子連成細線,離得越近越亮；與 M1 的連線規則同一個想法。
    // 分近、遠兩批各畫一次,避免逐線切換樣式。
    const near=[],far=[],list=this.particles,link=TANK.linkDistance;
    for(let i=0;i<list.length;i+=stride)for(let j=i+stride;j<list.length;j+=stride){
      const a=list[i].position,b=list[j].position,dx=a[0]-b[0];
      if(dx>link||dx<-link)continue;
      const d=Math.hypot(dx,a[1]-b[1],a[2]-b[2]);
      if(d<link*.55)near.push(a,b);else if(d<link)far.push(a,b);
    }
    strokeWeight(.7);
    for(const [segments,alpha] of [[far,TANK.linkAlpha*.5],[near,TANK.linkAlpha]]){
      if(!segments.length)continue;
      stroke(255,255,255,alpha);beginShape(LINES);
      for(const p of segments)vertex(...p);
      endShape();
    }
    pop();
  }
}
const tankEnvironment=new TankEnvironment();
// ── 截游體的辨識特徵（只影響繪圖，不改碰撞與生態）──
// 1. w 深度明暗：四維上較「近」的骨架亮、較「遠」的淡，轉動時看得出第四軸。
// 2. 前導漸層：朝游動方向的邊較亮，尾端淡出，像一道推進的光，不是有頭有尾的身體。
// 3. 感測節點：4 個互相最遠的頂點（四面體排列，沒有左右對稱），追捕時放大並閃動。
// 4. 內核：24 胞體裡的 16 胞體，反向旋轉；吃飽時大而亮，飢餓時縮小變暗。
const CREATURE_LOOK={sensorCount:4,depthContrast:.55,leadContrast:.3,coreMin:.2,coreMax:.5,coreFollow:1.2};
// 5. 微光面：24 胞體有 96 個三角面，挑 6 個分散的填色發光；亮度隨 w 深度、個別相位與追捕狀態起伏。
Object.assign(CREATURE_LOOK,{glowFaces:6,faceColor:[255,255,255],faceAlpha:70,faceHalo:26,faceHaloScale:1.14});
// 6. 軌道環：三圈不連續的細環，各自轉動，和身體一起伸縮、開瓣。
// 7. 探針：從感測節點伸出的細線；追捕時變長並偏向目標。
// 8. 尾跡：身後最近幾秒的位置軌跡，漸漸淡去。
// 9. 進食閃光：捕到獵物時所有發光面瞬間亮起再淡去。
Object.assign(CREATURE_LOOK,{circleAlpha:55,circlePoints:64,circleArcs:8,probeReach:.2,probeHuntReach:.45,probeAlpha:120,
  wakeSamples:14,wakeInterval:.07,wakeAlpha:60,flashDecay:1.6,
  torusScale:1.25,fibres:4,fibrePoints:48,fibreArcs:3,fibreAlpha:45,fibreDrift:.12,knotPoints:120,knotArcs:8,knotAlpha:150,waveAlpha:130,waveGrowth:.55,waveDuration:1.8,waveMax:3,beadAlpha:240,beads:false,beadLength:7,beadSpeed:[.55,-.4,.33,-.62]});
let sensorVertices=null,glowFaces=null,coreFill=.2,faceFlash=0,lastCaptures=0,wake=[],wakeTimer=0,waves=[];
// 6. 六邊形大圓：24 個頂點恰好分成 4 組正六邊形，每組 6 點共圓（外接 3-球面上的大圓，
//    類似 Hopf 纖維分解）。圓用 4D 畫出，和骨架做同一個 4D 旋轉再投影，所以一定穿過節點。
// 7. 探針：沿感測頂點自己的 4D 徑向射線延伸（等於推出更大的同心 24 胞體）；正對目標的那根伸得最長。
let hexCircles=null;
function pickHexagonCircles(){
  const vs=generate4DBody().vertices,key=p=>p.join(','),index=new Map(vs.map((p,i)=>[key(p),i])),used=new Set(),circles=[];
  for(let i=0;i<24;i++){
    if(used.has(i))continue;
    for(let j=0;j<24;j++){
      if(Math.abs(dot(vs[i],vs[j])-1)>EPS)continue; // 夾 60° 的相鄰頂點
      const v=vs[i],w=vs[j],hex=[v,w,w.map((x,k)=>x-v[k]),v.map(x=>-x),w.map(x=>-x),v.map((x,k)=>x-w[k])];
      const ids=hex.map(q=>index.get(key(q)));
      if(ids.some(id=>id===undefined||used.has(id)))continue;
      ids.forEach(id=>used.add(id));
      const e1=unit(v),rest=w.map((x,k)=>x-dot(w,e1)*e1[k]);
      circles.push({e1,e2:unit(rest)});break;
    }
  }
  return circles;
}
// 圓與探針的 4D 點，旋轉並投影成 3D（結構和 project4DTo3D 相同），再交給共用變形。
function generateTraitMesh(time){
  hexCircles??=pickHexagonCircles();sensorVertices??=pickSensorVertices();
  const radius=PARAMS.halfSize*Math.SQRT2,vs=generate4DBody().vertices,d=PARAMS.projectionDistance;
  const four=[];
  hexCircles.forEach(({e1,e2})=>{
    for(let i=0;i<CREATURE_LOOK.circlePoints;i++){
      const t=i/CREATURE_LOOK.circlePoints*Math.PI*2;
      four.push(e1.map((x,k)=>radius*(Math.cos(t)*x+Math.sin(t)*e2[k])));
    }
  });
  const probeSteps=4;
  sensorVertices.forEach(vi=>{
    for(let step=0;step<=probeSteps;step++)four.push(vs[vi].map(x=>x*PARAMS.halfSize*(1+CREATURE_LOOK.probeHuntReach*step/probeSteps)));
  });
  const rotated=four.map(q=>rotate4D(q,time));
  return {points:rotated.map(q=>{const k=d/(d-q[3]);return q.slice(0,3).map(v=>v*k);}),source4D:rotated,edges:[],faces:[]};
}
// 8. Clifford 環面上的 Hopf 纖維：在 3-球面 x1²+x2²+x3²+x4²=R² 上，取 |z1|=|z2|=R/√2（z1=x1+i·x2，z2=x3+i·x4）
//    就是 Clifford 環面。點 (cos t, sin t, cos(t+ψ), sin(t+ψ))·R/√2 對固定 ψ 是一個大圓（Hopf 纖維），
//    不同 ψ 的圓彼此互相鉤環、合起來鋪滿整個環面。ψ 緩慢漂移，圓族像沿環面流動。
// 9. (2,3) 環面結：同一個環面上的曲線 (cos 2t, sin 2t, cos 3t, sin 3t)·R/√2，繞第一個圓 2 圈、第二個圓 3 圈，
//    投影後呈三葉結。
// 10. 擴散波：捕到獵物時，4 個六邊形大圓沿 4D 徑向放大並淡去。
// 11. 光珠：每個大圓上有一顆亮珠沿圓周繞行，帶漸淡拖尾。
function projectPoint(q){const k=PARAMS.projectionDistance/(PARAMS.projectionDistance-q[3]);return q.slice(0,3).map(v=>v*k);}
function drawArcs(points,arcs,alpha,weight){
  const n=points.length,per=n/arcs;
  strokeWeight(weight);
  for(let arc=0;arc<arcs;arc++){
    let near=0;
    for(let i=0;i<=per;i++)near+=points[(arc*per+i)%n].depth;
    stroke(255,255,255,alpha*(.2+.8*near/(per+1)));
    beginShape(LINES);
    for(let i=0;i<per;i++){vertex(...points[(arc*per+i)%n].p);vertex(...points[(arc*per+i+1)%n].p);}
    endShape();
  }
}
function renderTorus(time,breathing,hunting){
  const R=PARAMS.halfSize*Math.SQRT2*CREATURE_LOOK.torusScale,a=R/Math.SQRT2,rotation=-time*.45+2.1;
  const place=q=>{const r=rotate4D(q,rotation);return {p:projectPoint(r).map(v=>v*breathing.scale),depth:(r[3]/R+1)/2};};
  const boost=hunting?1.35:1;
  for(let k=0;k<CREATURE_LOOK.fibres;k++){
    const psi=k/CREATURE_LOOK.fibres*Math.PI*2+time*CREATURE_LOOK.fibreDrift;
    const curve=Array.from({length:CREATURE_LOOK.fibrePoints},(_,i)=>{
      const t=i/CREATURE_LOOK.fibrePoints*Math.PI*2;
      return place([a*Math.cos(t),a*Math.sin(t),a*Math.cos(t+psi),a*Math.sin(t+psi)]);
    });
    drawArcs(curve,CREATURE_LOOK.fibreArcs,CREATURE_LOOK.fibreAlpha*boost,.9);
  }
  const knot=Array.from({length:CREATURE_LOOK.knotPoints},(_,i)=>{
    const t=i/CREATURE_LOOK.knotPoints*Math.PI*2;
    return place([a*Math.cos(2*t),a*Math.sin(2*t),a*Math.cos(3*t),a*Math.sin(3*t)]);
  });
  drawArcs(knot,CREATURE_LOOK.knotArcs,CREATURE_LOOK.knotAlpha*boost,1.8);
}
function renderWaves(time){
  if(!waves.length)return;
  const radius=PARAMS.halfSize*Math.SQRT2,n=40;
  strokeWeight(1.4);
  for(const wave of waves){
    const u=wave.age/CREATURE_LOOK.waveDuration,grow=1+CREATURE_LOOK.waveGrowth*(1-(1-u)**2);
    stroke(255,255,255,CREATURE_LOOK.waveAlpha*(1-u)**1.5);
    for(const {e1,e2} of hexCircles){
      const ring=Array.from({length:n},(_,i)=>{
        const t=i/n*Math.PI*2;
        return projectPoint(rotate4D(e1.map((x,k)=>radius*grow*(Math.cos(t)*x+Math.sin(t)*e2[k])),time));
      });
      beginShape(LINES);for(let i=0;i<n;i++){vertex(...ring[i]);vertex(...ring[(i+1)%n]);}endShape();
    }
  }
}
function renderBeads(traits,time){
  const n=CREATURE_LOOK.circlePoints,len=CREATURE_LOOK.beadLength;
  for(let c=0;c<hexCircles.length;c++){
    const head=((time*CREATURE_LOOK.beadSpeed[c]*n/6)%n+n)%n,dir=CREATURE_LOOK.beadSpeed[c]<0?-1:1;
    for(let k=0;k<len;k++){
      const i0=Math.floor(head-dir*k+n*4)%n,i1=(i0+dir+n)%n;
      strokeWeight(2.6-1.6*k/len);stroke(255,255,255,CREATURE_LOOK.beadAlpha*(1-k/len)**1.6);
      beginShape(LINES);vertex(...traits.points[c*n+i0]);vertex(...traits.points[c*n+i1]);endShape();
    }
  }
}
function renderTraits(body,traits,h,time,breathing){
  const hunting=h.mode==='hunt'||h.cage.phase==='opening'||h.cage.phase==='closing';
  blendMode(ADD);noFill();
  renderTorus(time+h.hyperOffset,breathing,hunting);renderWaves(time);if(CREATURE_LOOK.beads)renderBeads(traits,time);
  const R=PARAMS.halfSize*Math.SQRT2,depth=i=>(traits.source4D[i][3]/R+1)/2;
  const {circlePoints:n,circleArcs:arcs}=CREATURE_LOOK,per=n/arcs;
  blendMode(ADD);noFill();strokeWeight(1.1);
  for(let c=0;c<hexCircles.length;c++)for(let arc=0;arc<arcs;arc++){
    const first=c*n+arc*per;let near=0;
    for(let i=0;i<=per;i++)near+=depth(c*n+(arc*per+i)%n);
    stroke(255,255,255,CREATURE_LOOK.circleAlpha*(.3+.7*near/(per+1))*(hunting?1.4:1));
    beginShape(LINES);
    for(let i=0;i<per;i++){vertex(...traits.points[c*n+(arc*per+i)%n]);vertex(...traits.points[c*n+(arc*per+i+1)%n]);}
    endShape();
  }
  const center=[0,1,2].map(k=>body.points.reduce((sum,p)=>sum+p[k],0)/body.points.length);
  const prey=h.target!==null?ecosystem.prey[h.target]:null;
  const toTarget=prey?.alive?safeDirection(sub(prey.position,h.position)):null;
  const steps=4,base=hexCircles.length*n;
  const facing=sensorVertices.map((_,k)=>{
    if(!toTarget)return 0;
    const tip=traits.points[base+k*(steps+1)+steps];
    return dot(unit(sub(tip,center)),toTarget);
  });
  const best=toTarget?facing.indexOf(Math.max(...facing)):-1;
  sensorVertices.forEach((_,k)=>{
    // 沒有目標：全部縮回基本長度；追捕時只有正對目標的那根伸到最長。
    const reach=hunting?(k===best?1:.45):(CREATURE_LOOK.probeReach/CREATURE_LOOK.probeHuntReach);
    const flicker=1+.1*Math.sin(time*(hunting?6:2)+k*1.7);
    const root=traits.points[base+k*(steps+1)],tip=traits.points[base+k*(steps+1)+steps];
    const at=u=>root.map((v,i)=>v+(tip[i]-v)*u*reach*flicker);
    for(let step=0;step<steps;step++){
      strokeWeight(1.3-.7*step/steps);stroke(255,255,255,CREATURE_LOOK.probeAlpha*(1-step/steps)**1.5);
      beginShape(LINES);vertex(...at(step/steps));vertex(...at((step+1)/steps));endShape();
    }
  });
  blendMode(BLEND);
}
// ── 截面模式：四維特徵與超平面 w=s 求交（不是把投影版硬搬過來）──
// 曲線（維度 1）與 3D 超平面一般只交於有限個點；曲面（維度 2，如 Clifford 環面）交出一條曲線；
// 3D 的胞交出多邊形。交點用線性內插：t=(s-a_w)/(b_w-a_w)。
function polylineCrossings(points4,s){
  const out=[],n=points4.length;
  for(let i=0;i<n;i++){
    const a=points4[i],b=points4[(i+1)%n],da=a[3]-s,db=b[3]-s;
    if(da*db<0){const t=da/(da-db);out.push([0,1,2].map(k=>a[k]+t*(b[k]-a[k])));}
  }
  return out;
}
function greatCirclePoints4(e1,e2,radius,count,time){
  return Array.from({length:count},(_,i)=>{
    const t=i/count*Math.PI*2;
    return rotate4D(e1.map((x,k)=>radius*(Math.cos(t)*x+Math.sin(t)*e2[k])),time);
  });
}
// Clifford 環面 ∩ {w=s}：把 (u,v) 參數格切成三角形（marching triangles），每個三角形至多交出一段線。
function torusSection(time,s){
  const R=PARAMS.halfSize*Math.SQRT2*CREATURE_LOOK.torusScale,a=R/Math.SQRT2,G=44,rotation=-time*.45+2.1;
  const grid=[];
  for(let i=0;i<G;i++)for(let j=0;j<G;j++){
    const u=i/G*Math.PI*2,v=j/G*Math.PI*2;
    grid.push(rotate4D([a*Math.cos(u),a*Math.sin(u),a*Math.cos(v),a*Math.sin(v)],rotation));
  }
  const at=(i,j)=>grid[(i%G)*G+(j%G)],segments=[];
  const triangle=(p,q,r)=>{
    const hits=[];
    for(const [x,y] of [[p,q],[q,r],[r,p]]){
      const dx=x[3]-s,dy=y[3]-s;
      if(dx*dy<0){const t=dx/(dx-dy);hits.push([0,1,2].map(k=>x[k]+t*(y[k]-x[k])));}
    }
    if(hits.length===2)segments.push(hits[0],hits[1]);
  };
  for(let i=0;i<G;i++)for(let j=0;j<G;j++){
    triangle(at(i,j),at(i+1,j),at(i+1,j+1));triangle(at(i,j),at(i+1,j+1),at(i,j+1));
  }
  return {segments,rotation};
}
// 16 胞體 ∩ {w=s}：邊與平面的交點是截面的頂點；每個三角面若被平面切到兩條邊，就連成截面的一條邊。
function coreSection(time,level,s){
  const vertices=[];
  for(let axis=0;axis<4;axis++)for(const sign of [-1,1]){const p=[0,0,0,0];p[axis]=sign*PARAMS.halfSize*level;vertices.push(rotate4D(p,-time*1.7+1.3));}
  const crossing=new Map(),points=[];
  const edgeKey=(i,j)=>i*8+j;
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){
    if(i>>1===j>>1)continue;
    const a=vertices[i],b=vertices[j],da=a[3]-s,db=b[3]-s;
    if(da*db<0){const t=da/(da-db);crossing.set(edgeKey(i,j),points.length);points.push([...[0,1,2].map(k=>a[k]+t*(b[k]-a[k])),s]);}
  }
  const edges=[];
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)for(let k=j+1;k<8;k++){
    if((i>>1)===(j>>1)||(j>>1)===(k>>1)||(i>>1)===(k>>1))continue;
    const hit=[edgeKey(i,j),edgeKey(i,k),edgeKey(j,k)].filter(e=>crossing.has(e)).map(e=>crossing.get(e));
    if(hit.length===2)edges.push(hit);
  }
  return {points,edges,faces:[],s,level};
}
function styleSection(shell,h,time){
  const hunting=h.mode==='hunt'||h.cage.phase==='opening'||h.cage.phase==='closing',faces=[];
  shell.faces.forEach((ids,fi)=>{
    if(fi%4!==0||ids.length<3)return;
    const alpha=Math.min(2.2,(.55+.45*Math.sin(time*1.1+fi*2.1))*(hunting?1.35:1)+faceFlash*1.4);
    for(let t=1;t<ids.length-1;t++)faces.push({points:[ids[0],ids[t],ids[t+1]].map(id=>shell.points[id].slice(0,3)),alpha});
  });
  return {...shell,style:{edge:shell.edges.map(()=>1),node:shell.points.map(()=>1),alpha:1,faces,faceColor:CREATURE_LOOK.faceColor}};
}
// 回傳需要經過和骨架相同變形的點集合：內核截面、交點（以空心節點顯示）、環面截線。
function sliceTraitMeshes(hyperTime,s,coreLevel){
  hexCircles??=pickHexagonCircles();
  const R=PARAMS.halfSize*Math.SQRT2,L=CREATURE_LOOK,dots=[];
  for(const {e1,e2} of hexCircles)dots.push(...polylineCrossings(greatCirclePoints4(e1,e2,R,L.circlePoints,hyperTime),s));
  const torus=torusSection(hyperTime,s),a=R*L.torusScale/Math.SQRT2;
  for(let k=0;k<L.fibres;k++){
    const psi=k/L.fibres*Math.PI*2+hyperTime*L.fibreDrift;
    dots.push(...polylineCrossings(Array.from({length:96},(_,i)=>{const t=i/96*Math.PI*2;
      return rotate4D([a*Math.cos(t),a*Math.sin(t),a*Math.cos(t+psi),a*Math.sin(t+psi)],torus.rotation);}),s));
  }
  dots.push(...polylineCrossings(Array.from({length:240},(_,i)=>{const t=i/240*Math.PI*2;
    return rotate4D([a*Math.cos(2*t),a*Math.sin(2*t),a*Math.cos(3*t),a*Math.sin(3*t)],torus.rotation);}),s));
  return {core:coreSection(hyperTime,coreLevel,s),
    dots:{points:dots,edges:dots.length?[[0,0]]:[],faces:[]},
    curve:{points:torus.segments,edges:[],faces:[]}};
}
function renderSectionCurve(curve,h){
  if(!curve.points.length)return;
  const hunting=h.mode==='hunt'||h.cage.phase==='opening'||h.cage.phase==='closing';
  blendMode(ADD);noFill();strokeWeight(1.7);stroke(255,255,255,CREATURE_LOOK.knotAlpha*(hunting?1.3:1));
  beginShape(LINES);for(const point of curve.points)vertex(...point);endShape();
  blendMode(BLEND);
}
function renderWake(){
  if(wake.length<2)return;
  blendMode(ADD);noFill();strokeWeight(1.2);
  for(let i=1;i<wake.length;i++){
    const strength=i/wake.length;
    stroke(255,255,255,CREATURE_LOOK.wakeAlpha*strength*strength);
    beginShape(LINES);vertex(...wake[i-1]);vertex(...wake[i]);endShape();
  }
  blendMode(BLEND);
}
function pickGlowFaces(){
  const {vertices,edges}=generate4DBody(),linked=(a,b)=>edges.some(([i,j])=>(i===a&&j===b)||(i===b&&j===a));
  const triangles=[];
  for(let a=0;a<24;a++)for(let b=a+1;b<24;b++)if(linked(a,b))for(let c=b+1;c<24;c++)if(linked(a,c)&&linked(b,c))triangles.push([a,b,c]);
  const centroid=t=>[0,1,2,3].map(k=>(vertices[t[0]][k]+vertices[t[1]][k]+vertices[t[2]][k])/3);
  const chosen=[triangles[0]];
  while(chosen.length<CREATURE_LOOK.glowFaces){
    let best=null,bestGap=-1;
    for(const t of triangles){
      if(chosen.includes(t))continue;const c=centroid(t);
      const gap=Math.min(...chosen.map(o=>{const d=sub(c,centroid(o));return dot(d,d);}));
      if(gap>bestGap+EPS){bestGap=gap;best=t;}
    }
    chosen.push(best);
  }
  return chosen;
}
function pickSensorVertices(){
  const vs=generate4DBody().vertices,chosen=[0];
  while(chosen.length<CREATURE_LOOK.sensorCount){
    let best=-1,bestGap=-1;
    vs.forEach((v,i)=>{if(chosen.includes(i))return;
      const gap=Math.min(...chosen.map(j=>dot(sub(v,vs[j]),sub(v,vs[j]))));
      if(gap>bestGap+EPS){bestGap=gap;best=i;}});
    chosen.push(best);
  }
  return chosen;
}
function generateCoreMesh(time,level){
  const points=[],edges=[];
  for(let axis=0;axis<4;axis++)for(const sign of [-1,1]){const p=[0,0,0,0];p[axis]=sign;points.push(p);}
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)if(i>>1!==j>>1)edges.push([i,j]); // 只連非對徑頂點，共 24 條
  const rotated=points.map(p=>rotate4D(p.map(x=>x*PARAMS.halfSize*level),-time*1.7+1.3));
  const d=PARAMS.projectionDistance;
  return {points:rotated.map(p=>{const k=d/(d-p[3]);return p.slice(0,3).map(v=>v*k);}),
    source4D:rotated,edges,faces:[],level,mode:'projection'};
}
function styleCreature(meshes,h,time){
  sensorVertices??=pickSensorVertices();
  const R=PARAMS.halfSize*Math.SQRT2,hunting=h.mode==='hunt'||h.cage.phase==='opening'||h.cage.phase==='closing';
  const drive=clamp01(h.motion.drive),axis=h.motion.axis;
  const [body,core]=meshes;
  const center=[0,1,2].map(k=>body.points.reduce((s,p)=>s+p[k],0)/body.points.length);
  const wDepth=i=>(body.source4D[i][3]/R+1)/2; // 0=四維最遠，1=最近
  const lead=i=>clamp01((dot(sub(body.points[i],center),axis)/R+1)/2);
  const edge=body.edges.map(([a,b])=>{
    const depth=(wDepth(a)+wDepth(b))/2,front=(lead(a)+lead(b))/2;
    return (1-CREATURE_LOOK.depthContrast+CREATURE_LOOK.depthContrast*depth)*
      (1-CREATURE_LOOK.leadContrast*drive+CREATURE_LOOK.leadContrast*drive*front);
  });
  const node=body.points.map((_,i)=>{
    const k=sensorVertices.indexOf(i),base=.8+.2*wDepth(i);
    if(k<0)return base;
    const flare=hunting?.45:.15;
    return 1.55*(1+flare*Math.sin(time*(hunting?5.2:1.7)+k*1.9));
  });
  glowFaces??=pickGlowFaces();
  const faces=glowFaces.map((ids,k)=>{
    const depth=ids.reduce((s,i)=>s+wDepth(i),0)/3;
    const pulse=.55+.45*Math.sin(time*1.1+k*2.1);
    return {points:ids.map(i=>body.points[i]),
      alpha:Math.min(2.2,(.35+.65*depth)*pulse*(hunting?1.35:1)+faceFlash*1.4)};
  });
  const styled=[{...body,style:{edge,node,alpha:1,faces,faceColor:CREATURE_LOOK.faceColor}}];
  if(core){
    const fill=coreFill;
    styled.push({...core,style:{edge:core.edges.map(()=>1),node:core.points.map(()=>.8),alpha:.35+.65*fill}});
  }
  return styled;
}
function updateSimulation(dt){
  dt=paused?0:Math.max(0,Math.min(dt,.05));
  if(!paused){clockTime+=dt;explorer.update(dt);}
  const h=ecosystem.hunter;
  // 特技翻滾時，4D 旋轉速度暴增，胞體翻轉像伸展筋骨般開花
  const hyperTime=clockTime+h.hyperOffset;
  coreFill+=((1-h.hunger)-coreFill)*(1-Math.exp(-CREATURE_LOOK.coreFollow*dt));
  if(ecosystem.captures>lastCaptures){faceFlash=1;waves.push({age:0});if(waves.length>CREATURE_LOOK.waveMax)waves.shift();}
  waves.forEach(w=>w.age+=dt);waves=waves.filter(w=>w.age<CREATURE_LOOK.waveDuration);
  lastCaptures=ecosystem.captures;faceFlash=Math.max(0,faceFlash-dt*CREATURE_LOOK.flashDecay);
  if(dt>0){
    wakeTimer+=dt;
    if(wakeTimer>=CREATURE_LOOK.wakeInterval){
      wakeTimer=0;wake.push(h.position.slice());
      if(wake.length>CREATURE_LOOK.wakeSamples)wake.shift();
    }
  }
  const s=PARAMS.slicePosition+PARAMS.halfSize*1.48*Math.sin(hyperTime*PARAMS.sliceSpeed);
  // 預設整體骨架投影符合參考圖的密集交錯；切換後才計算 w=s。
  section=globalThis.drifterCore?
    (viewMode==='projection'?[1]:PARAMS.shellLevels).map(level=>globalThis.drifterCore.geometry(PARAMS,hyperTime,level,s,viewMode)):
    viewMode==='projection'?[project4DTo3D(sample4DBody(body,hyperTime))]:
    PARAMS.shellLevels.map(level=>sliceWith3DSpace(sample4DBody(body,hyperTime,level),s));
  // 整體極輕微地收縮、舒展，像緩慢呼吸；不改動母體幾何或切面計算。
  const breathing=breathingAt(clockTime);
  const exploring=hunterPose(h);
  ecosystem.update(dt,section.some(mesh=>mesh.edges.length>0),explorer.heading,
    hunterCollisionMeshes(section,breathing,exploring,clockTime,h));
  tankEnvironment.update(dt,clockTime,h,section.some(mesh=>mesh.edges.length>0));
  return {s,breathing};
}
function renderSimulation(frame){
  const {s,breathing}=frame,h=ecosystem.hunter;
  tankEnvironment.render();
  renderFood(clockTime);
  const travelSize=Math.min(width,height);
  push();scale(travelSize/560);renderWake();pop();
  push();
  const jiggleOffset=h.jiggle>0?Math.sin(clockTime*48)*h.jiggle*3.2:0;
  const hPos=h.position.map((v,k)=>
    (v+(h.jiggleNormal?h.jiggleNormal[k]*jiggleOffset:0))*travelSize/560);
  translate(...hPos);
  const jiggleScale=1+(h.jiggle>0?Math.sin(clockTime*36)*h.jiggle*0.035:0);
  scale(travelSize/560*jiggleScale);
  let drawn;
  if(viewMode==='projection'){
    const coreLevel=CREATURE_LOOK.coreMin+(CREATURE_LOOK.coreMax-CREATURE_LOOK.coreMin)*coreFill;
    const moved=hunterCollisionMeshes([section[0],generateCoreMesh(clockTime+h.hyperOffset,coreLevel),generateTraitMesh(clockTime+h.hyperOffset)],breathing,hunterPose(h),clockTime,h);
    drawn=styleCreature(moved.slice(0,2),h,clockTime);
    renderCreature(drawn,breathing);
    renderTraits(moved[0],moved[2],h,clockTime,breathing);
  }else{
    // 截面：骨架殼層 + 內核截面 + 交點 + 環面截線，全部經過同樣的伸縮與開瓣變形。
    const hyperTime=clockTime+h.hyperOffset;
    const coreLevel=CREATURE_LOOK.coreMin+(CREATURE_LOOK.coreMax-CREATURE_LOOK.coreMin)*coreFill;
    const traits=sliceTraitMeshes(hyperTime,frame.s,coreLevel);
    const moved=hunterCollisionMeshes([...section,traits.core,traits.dots,traits.curve],breathing,hunterPose(h),clockTime,h);
    const shells=moved.slice(0,section.length);
    drawn=[styleSection(shells[0],h,clockTime),...shells.slice(1),moved[section.length],moved[section.length+1]];
    renderCreature(drawn,breathing);
    renderSectionCurve(moved[section.length+2],h);
  }
  pop();
  renderLifeEffects(clockTime);
  const status=document.getElementById('slice-status');
  let statusText=viewMode==='projection'?'完整骨架投影 · 24 節點 / 96 邊':
    'w = '+s.toFixed(1)+' / '+(section[0].faces.length?section[0].faces.length+' 面截體':'離開觀察空間');
  statusText+=' · '+({hunt:'追捕',rest:'休息',wander:'游走',hidden:'潛伏'}[ecosystem.hunter.mode])+
    ({opening:' · 骨架開瓣',closing:' · 合籠捕食',recover:' · 消化回穩'}[h.cage.phase]||'')+
    (h.somersaultTimer>0?' · 四維翻滾舒展':'')+
    ' · 小生物 '+ecosystem.prey.filter(p=>p.alive).length+'/'+ecosystem.prey.length+' · 捕捉 '+ecosystem.captures;
  if(status&&status.textContent!==statusText)status.textContent=statusText;
}
function resetSimulation(){
  Object.assign(explorer,new Explorer(seededRandom(42)));
  Object.assign(ecosystem,new Ecosystem(foodItems,seededRandom(43)));
  Object.assign(tankEnvironment,new TankEnvironment());
  clockTime=0;body=generate4DBody();wake=[];wakeTimer=0;faceFlash=0;lastCaptures=0;waves=[];
}
function draw(){
  const meter=globalThis.drifterBenchmark;
  if(meter&&!meter.begin())return;
  const start=meter?performance.now():0;
  const frame=updateSimulation(meter?meter.deltaTime:deltaTime/1000);
  const updated=meter?performance.now():0;
  background(0);if(!globalThis.drifterExperiment?.benchmark)orbitControl(1,1,.65);
  renderSimulation(frame);
  if(meter)meter.end(updated-start,performance.now()-updated);
}
function windowResized(){const host=document.getElementById('canvas-host');resizeCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight);resetView();}
