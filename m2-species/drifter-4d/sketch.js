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
function renderCreature(meshes,breathing=breathingAt(clockTime),appearance={opacity:1,nodeScale:1}){
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
        stroke(255,255,255,alpha*appearance.opacity);
        vertex(...project3DToScreen(mesh.points[a]));vertex(...project3DToScreen(mesh.points[b]));
      }endShape();
    }
    // 面保持空白，避免把密集骨架填成一團發亮的實體。
    // 與骨架共用透視：近處圓點較大，遠處較小。
    const radius=PARAMS.nodeRadius*(layer?.7:1)*appearance.nodeScale;
    for(const pass of [{width:4,alpha:5},{width:2.4,alpha:11},{width:0,alpha:0}]){
    const halo=pass.width>0;
    if(halo){blendMode(ADD);noFill();}
    else{blendMode(BLEND);fill(0,255*appearance.opacity);}
    stroke(255,255,255,(halo?pass.alpha*PARAMS.glowStrength*breathing.glow*(layer?.5:1):(layer?190:255)*breathing.nodeLight)*appearance.opacity);
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
  return [regular(tetra,Math.sqrt(8)),regular(cube,2),regular(octa,Math.SQRT2),
    {points:prism,faces:[],edges:[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]}];
}
const foodMeshes=createFoodMeshes();
// 初始散落位置與形體；活動狀態由 Ecosystem 另外保存。
const foodItems=[
  {kind:0,position:[-235,-140,-100],size:12,phase:.3},
  {kind:1,position:[210,-165,-160],size:12,phase:1.1},
  {kind:2,position:[245,35,45],size:19,phase:2.2},
  {kind:3,position:[95,190,-80],size:17,phase:.7},
  {kind:1,position:[-180,145,75],size:11,phase:2.8},
  {kind:2,position:[-260,25,-190],size:16,phase:1.7}
];
const LIFE={bounds:[290,200,210],danger:180,respawnDelay:12};
const FX={consumeDuration:4.5,birthDuration:1.25,restitution:.45,maxEffects:48,
  scatterTime:.6,absorbStrength:48,absorbRamp:.25,trailSamples:20};
const safeDirection=v=>{const n=Math.hypot(...v);return n>EPS?v.map(x=>x/n):[1,0,0];};
const clamp01=x=>Math.max(0,Math.min(1,x));
const fragmentHalf=(f,age)=>f.half?rotatePlane(rotatePlane(f.half,0,2,age*f.spin),1,2,age*f.spin*.7):null;
function smallCreaturePoints(food,time,growth=1,position=food.position){
  return foodMeshes[food.kind].points.map(p=>{
    let q=rotatePlane(p,0,2,food.phase+time*.12);
    q=rotatePlane(q,1,2,food.phase*.7+time*.08);
    return q.map((v,k)=>v*food.size*growth+position[k]);
  });
}
// 有限線段的最近點；包含平行、端點與零長度情況。
function segmentContact(p1,q1,p2,q2){
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
function hunterCollisionMeshes(meshes,breathing,pose,time){
  return meshes.map(mesh=>({...mesh,points:mesh.points.map(p=>{
    let q=p.slice(0,3).map(v=>v*breathing.scale*pose.scale);
    q=rotatePlane(q,0,1,pose.tilt+.012*Math.sin(time*.19));
    return rotatePlane(q,0,2,-pose.turn-.022*Math.sin(time*.27));
  })}));
}
class Ecosystem {
  constructor(items,random=Math.random){
    this.random=random;this.time=0;this.captures=0;this.effects=[];
    this.prey=items.map((item,id)=>({...item,id,position:item.position.slice(),velocity:[0,0,0],
      direction:this.randomDirection(),intent:0,energy:1,mode:'wander',alive:true,respawn:0,
      birth:FX.birthDuration,radius:item.size*Math.max(...foodMeshes[item.kind].points.map(p=>Math.hypot(...p))),
      mass:(item.size/12)**3}));
    this.hunter={position:[0,0,0],velocity:[0,0,0],energy:1,hunger:.8,
      mode:'wander',target:null,commit:0,cooldown:0,radius:32,mass:12};
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
  shatter(p,hit){
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
      const outward=safeDirection(sub(position,p.position)),speed=32+Math.min(75,-closing*.65);
      // 碰撞後的速度拆成沿表面與朝外兩部分，所有碎片先向外半空間散開。
      const tangent=outward.map((v,k)=>v-normal[k]*dot(outward,normal));
      const relative=sub(p.velocity,h.velocity),normalSpeed=Math.max(28,dot(relative,normal)*.65+speed*.5);
      const velocity=relative.map((v,k)=>h.velocity[k]+(v-normal[k]*dot(relative,normal))*.65+
        tangent[k]*speed*.65+normal[k]*normalSpeed);
      fragments.push({position:position.slice(),velocity,
        half,spin:.7+fragments.length*.17,history:[position.slice()],absorbed:false});
    };
    points.forEach(point=>add(point));
    for(const [a,b] of foodMeshes[p.kind].edges)add(points[a].map((v,k)=>(v+points[b][k])/2),
      points[a].map((v,k)=>(points[b][k]-v)/2));
    // 用包住整個可見骨架的支撐平面阻擋碎片，避免從鏤空線框穿入。
    const surface=this.fragmentSurface(normal),clearance=Math.max(0,...fragments.map(f=>
      surface+(f.half?Math.abs(dot(f.half,normal))+PARAMS.lineWidth/2:PARAMS.nodeRadius)-
      dot(sub(f.position,h.position),normal)));
    for(const f of fragments){
      f.position=f.position.map((v,k)=>v+normal[k]*clearance);
      f.history=[f.position.slice()];
    }
    this.emit('consume',p.position,{fragments,trailClock:0,normal,separation:normal.map(v=>v*clearance)});
    this.emit('impact',hit.first);
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
    effect.trailClock+=dt;
    const sample=effect.trailClock>=1/60;if(sample)effect.trailClock%=1/60;
    for(const f of effect.fragments){
      if(f.absorbed){if(sample)f.history.shift();continue;}
      const attraction=effect.age>FX.scatterTime;
      const pull=clamp01((effect.age-FX.scatterTime)/FX.absorbRamp);
      for(let k=0;k<3;k++){
        const acceleration=attraction?(this.hunter.position[k]-f.position[k])*FX.absorbStrength*pull-f.velocity[k]*14:-f.velocity[k]*1.8;
        f.velocity[k]+=acceleration*dt;f.position[k]+=f.velocity[k]*dt;
      }
      if(!attraction)this.blockFragment(f,effect);
      if(sample){f.history.push(f.position.slice());if(f.history.length>FX.trailSamples)f.history.shift();}
      if(attraction&&Math.hypot(...sub(f.position,this.hunter.position))<7)f.absorbed=true;
    }
  }
  resolveCollisions(visible){
    if(visible)for(const p of this.prey)if(p.alive){const hit=this.preyContact(p);if(hit)this.shatter(p,hit);}
    const live=this.prey.filter(p=>p.alive);
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++)this.collide(live[i],live[j]);
      for(const a of [...live,this.hunter])for(let k=0;k<3;k++){
        if(Math.abs(a.position[k])>LIFE.bounds[k]){
          a.position[k]=Math.sign(a.position[k])*LIFE.bounds[k];
          if(a.velocity[k]*a.position[k]>0)a.velocity[k]*=-FX.restitution;
        }
      }
    }
  }
  randomDirection(){return safeDirection([this.random()-.5,this.random()-.5,(this.random()-.5)*.7]);}
  move(agent,direction,speed,dt,response){
    const desired=safeDirection(direction).map(v=>v*speed);
    for(let k=0;k<3;k++){
      // 先柔和轉回活動區；最後一道限制避免低幀率穿出邊界。
      const p=agent.position[k],limit=LIFE.bounds[k];
      desired[k]-=Math.sign(p)*Math.max(0,Math.abs(p)-limit*.78)*2.5;
    }
    const length=Math.hypot(...desired),factor=length>speed?speed/length:1;
    for(let k=0;k<3;k++){
      agent.velocity[k]+=(desired[k]*factor-agent.velocity[k])*(1-Math.exp(-response*dt));
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
    for(const p of this.prey){
      if(!p.alive){
        p.respawn-=dt;
        if(p.respawn<=0){
          // 新個體從離獵者最遠的邊緣進場，避免在牠面前立即被捕。
          const candidates=Array.from({length:8},()=>{
            const q=this.randomDirection();const extent=Math.max(...q.map((v,k)=>Math.abs(v)/LIFE.bounds[k]));
            return q.map(v=>v/extent*.94);
          });
          candidates.sort((a,b)=>Math.hypot(...sub(b,h.position))-Math.hypot(...sub(a,h.position)));
          p.position=candidates[0];p.velocity=[0,0,0];p.energy=1;p.alive=true;p.mode='wander';p.intent=0;
          p.birth=0;this.emit('birth',p.position,{preyId:p.id});
        }
        continue;
      }
      p.birth=Math.min(FX.birthDuration,p.birth+dt);
      const away=sub(p.position,h.position),distance=Math.hypot(...away);
      const fleeing=visible&&distance<LIFE.danger;
      p.energy=clamp01(p.energy+dt*(fleeing?-.09:.07));
      p.mode=fleeing?'flee':p.energy<.45?'recover':'wander';
      p.intent-=dt;
      if(p.intent<=0){p.direction=this.randomDirection();p.intent=.8+this.random()*2;}
      let direction=p.direction.slice();
      if(fleeing){
        const predicted=h.position.map((v,k)=>v+h.velocity[k]*.35);
        direction=safeDirection(sub(p.position,predicted)).map((v,k)=>v*2+p.direction[k]*.65);
      }
      // 鄰近個體互相讓開；不強迫排成隊伍。
      for(const other of this.prey)if(other!==p&&other.alive){
        const offset=sub(p.position,other.position),d=Math.hypot(...offset);
        if(d<55)direction=direction.map((v,k)=>v+safeDirection(offset)[k]*(1-d/55)*1.8);
      }
      const speed=fleeing?48+62*p.energy:p.mode==='recover'?13:24;
      this.move(p,direction,speed,dt,4);
    }
    h.hunger=clamp01(h.hunger+dt*.022);h.cooldown=Math.max(0,h.cooldown-dt);h.commit-=dt;
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
    this.move(h,direction,h.mode==='hunt'?68+24*h.energy:h.mode==='rest'?6:18,dt,1.8);
    this.resolveCollisions(visible);
  }
}
const ecosystem=new Ecosystem(foodItems);
function renderSmallCreature(food,time,growth=1,opacity=1,position=food.position){
  const template=foodMeshes[food.kind];
  const points=smallCreaturePoints(food,time,growth,position);
  renderCreature([{...template,points}],{glow:.8,nodeLight:1},{opacity,nodeScale:growth});
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
function renderConsumption(effect){
  const axes=cameraAxes(),fade=clamp01((effect.duration-effect.age)/.5);
  blendMode(ADD);noFill();
  for(const fragment of effect.fragments){
    // 歷史位置固定於世界座標，截游體移動時不會把整條殘影一起搬走。
    for(let j=1;j<fragment.history.length;j++){
      const strength=j/fragment.history.length;
      strokeWeight(.35+strength);stroke(255,255,255,110*strength*strength*fade);
      beginShape(LINES);vertex(...fragment.history[j-1]);vertex(...fragment.history[j]);endShape();
    }
    if(fragment.absorbed)continue;
    const distance=Math.hypot(...sub(fragment.position,ecosystem.hunter.position));
    const shrink=effect.age>FX.scatterTime?Math.min(1,distance/25):1;
    for(const pass of [{width:4,alpha:18},{width:1.5,alpha:235}]){
      strokeWeight(pass.width);stroke(255,255,255,pass.alpha*fade);
      if(fragment.half){
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
    const radius=birth?8+42*t:3+18*t;
    // 三個互相垂直的細光圈，保有三維空間感；不做全畫面閃光。
    for(const pass of [{width:3,alpha:12},{width:1,alpha:110}]){
      strokeWeight(pass.width);stroke(255,255,255,pass.alpha*fade);
      for(const [a,b] of [[0,1],[1,2],[0,2]]){
        beginShape();
        for(let i=0;i<40;i++){
          const angle=i/40*Math.PI*2,p=center.slice();
          p[a]+=Math.cos(angle)*radius;p[b]+=Math.sin(angle)*radius;vertex(...p);
        }
        endShape(CLOSE);
      }
    }
    // 新生與碰撞沿固定方向向外散，不消耗行為亂數。
    strokeWeight(1);stroke(255,255,255,140*fade);beginShape(LINES);
    for(let i=0;i<12;i++){
      const z=1-2*(i+.5)/12,angle=i*2.399963,r=Math.sqrt(1-z*z);
      const direction=[r*Math.cos(angle),r*Math.sin(angle),z];
      for(const d of [radius,radius+7*(1-t)])
        vertex(...center.map((v,k)=>v+direction[k]*d));
    }
    endShape();
  }
  blendMode(BLEND);pop();
}
function resetView(){observationCamera.camera(0,-115,440,0,0,0,0,1,0);observationCamera.perspective(Math.PI/3,width/height,1,4000);}
function setup(){
  const host=document.getElementById('canvas-host');const canvas=createCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight,WEBGL);
  if(host)canvas.parent(host);pixelDensity(Math.min(window.devicePixelRatio||1,2));observationCamera=createCamera();resetView();body=generate4DBody();
  document.getElementById('loading')?.remove();describe('白色線框截游體在三維空間追捕會逃跑的小生物，可切換完整四維骨架投影和真正三維截面，並暫停觀察。');
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
  const dt=paused?0:Math.max(0,Math.min(deltaTime/1000,.05));
  if(!paused){clockTime+=dt;explorer.update(dt);}
  const s=PARAMS.slicePosition+PARAMS.halfSize*1.48*Math.sin(clockTime*PARAMS.sliceSpeed);
  // 預設整體骨架投影符合參考圖的密集交錯；切換後才計算 w=s。
  section=viewMode==='projection'?[project4DTo3D(sample4DBody(body,clockTime))]:
    PARAMS.shellLevels.map(level=>sliceWith3DSpace(sample4DBody(body,clockTime,level),s));
  // 整體極輕微地收縮、舒展，像緩慢呼吸；不改動母體幾何或切面計算。
  const breathing=breathingAt(clockTime);
  const exploring=explorer.pose();
  ecosystem.update(dt,section.some(mesh=>mesh.edges.length>0),explorer.heading,
    hunterCollisionMeshes(section,breathing,exploring,clockTime));
  renderFood(clockTime);
  const travelSize=Math.min(width,height);
  push();
  // 捕食者與獵物共用世界座標，環視不會改變追捕方向或距離。
  translate(...ecosystem.hunter.position.map(v=>v*travelSize/560));
  rotateY(exploring.turn+.022*Math.sin(clockTime*.27));rotateZ(exploring.tilt+.012*Math.sin(clockTime*.19));
  scale(travelSize/560*breathing.scale*exploring.scale);renderCreature(section,breathing);pop();
  renderLifeEffects(clockTime);
  const status=document.getElementById('slice-status');
  if(status)status.textContent=viewMode==='projection'?'完整骨架投影 · 24 節點 / 96 邊':
    'w = '+s.toFixed(1)+' / '+(section[0].faces.length?section[0].faces.length+' 面截體':'離開觀察空間');
  if(status)status.textContent+=' · '+({hunt:'追捕',rest:'休息',wander:'游走',hidden:'潛伏'}[ecosystem.hunter.mode])+
    ' · 小生物 '+ecosystem.prey.filter(p=>p.alive).length+'/6 · 捕捉 '+ecosystem.captures;
}
function windowResized(){const host=document.getElementById('canvas-host');resizeCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight);resetView();}
