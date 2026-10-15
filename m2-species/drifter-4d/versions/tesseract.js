// 截游體 / Tesseract：四維超立方體與 w=s 的真實截面。
// B=[-a,a]^4 經正交旋轉；每條 4D 邊與超平面線性求交。
const PARAMS={halfSize:78,sliceSpeed:.21,rotationSpeed:.18,lineBrightness:1.2,
  shellLevels:[1,.76,.52],slicePosition:0};
const EPS=1e-7;
let body,section,clockTime=0,paused=false,observationCamera;
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
function rotatePlane(p,a,b,angle){const q=p.slice(),c=Math.cos(angle),s=Math.sin(angle);q[a]=c*p[a]-s*p[b];q[b]=s*p[a]+c*p[b];return q;}
function rotationAngles(time){return [[0,3,.38+time*PARAMS.rotationSpeed],[1,3,.57+.46*Math.sin(time*.13)],[2,3,.24+time*.09],[0,2,.18]];}
function rotate4D(p,time,inverse=false){
  const rotations=rotationAngles(time);if(inverse)rotations.reverse();
  for(const [a,b,angle] of rotations)p=rotatePlane(p,a,b,inverse?-angle:angle);
  return p;
}
function generate4DBody(){
  // 16 個 ±1 頂點；只差一個座標的兩點形成一條邊，共 32 條。
  const vertices=Array.from({length:16},(_,i)=>[0,1,2,3].map(k=>i&(1<<k)?1:-1));
  const edges=[];for(let i=0;i<16;i++)for(let k=0;k<4;k++)if(!(i&(1<<k)))edges.push([i,i|(1<<k)]);
  // 8 個立方胞：固定一個四維座標為 +1 或 -1。
  const cells=[];for(let axis=0;axis<4;axis++)for(const sign of [-1,1])cells.push({axis,sign,
    edges:edges.filter(([a,b])=>vertices[a][axis]===sign&&vertices[b][axis]===sign)});
  return {vertices,edges,cells};
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
  // 若切面恰與整個立方胞重合，該胞是 3D 體積而非一個面；由相鄰胞給出外表面。
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
function project3DToScreen(p){return p.slice(0,3);} // 只在求交後取 xyz；不是 4D 透視投影。
function renderCreature(slices){
  blendMode(ADD);
  slices.forEach((mesh,layer)=>{
    if(!mesh.faces.length)return;
    // 淡平面只畫外層；扇形三角化只供填色，不把對角線當成真正的邊。
    if(layer===0){noStroke();fill(80,165,198,13);beginShape(TRIANGLES);
      for(const face of mesh.faces)for(let j=1;j<face.length-1;j++)for(const id of [face[0],face[j],face[j+1]])vertex(...project3DToScreen(mesh.points[id]));
      endShape();}
    noFill();
    for(const halo of [true,false]){
      stroke(154,222,246,(halo?10:(layer?49:116))*PARAMS.lineBrightness/(1+layer*.25));strokeWeight(halo?3.5:(layer?.7:1));
      beginShape(LINES);for(const [a,b] of mesh.edges){vertex(...project3DToScreen(mesh.points[a]));vertex(...project3DToScreen(mesh.points[b]));}endShape();
    }
    stroke(210,245,255,layer?100:210);strokeWeight(layer?2:3);
    beginShape(POINTS);for(const p of mesh.points)vertex(...project3DToScreen(p));endShape();
  });blendMode(BLEND);
}
function resetView(){observationCamera.camera(0,-150,500,0,0,0,0,1,0);observationCamera.perspective(Math.PI/3,width/height,1,4000);}
function setup(){
  const host=document.getElementById('canvas-host');const canvas=createCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight,WEBGL);
  if(host)canvas.parent(host);pixelDensity(Math.min(window.devicePixelRatio||1,2));observationCamera=createCamera();resetView();body=generate4DBody();
  document.getElementById('loading')?.remove();describe('旋轉的四維超立方體在三維空間留下直線、多邊形平面與淡色內層的截面。');
  const pause=document.getElementById('pause');if(pause)pause.onclick=()=>{paused=!paused;pause.textContent=paused?'繼續':'暫停';pause.setAttribute('aria-pressed',String(paused));};
  const reset=document.getElementById('reset');if(reset)reset.onclick=resetView;
  const capture=document.getElementById('capture');if(capture)capture.onclick=()=>saveCanvas('m2-tesseract-slice','png');
  canvas.elt.addEventListener('contextmenu',event=>event.preventDefault());
}
function draw(){
  background(5,10,18);orbitControl(1,1,.65);if(!paused)clockTime+=Math.min(deltaTime/1000,.05);
  // 4D 旋轉保長；超立方體頂點半徑為 2a，切面振幅超過此值保證會離開。
  const s=PARAMS.slicePosition+PARAMS.halfSize*2.08*Math.sin(clockTime*PARAMS.sliceSpeed);
  section=PARAMS.shellLevels.map(level=>sliceWith3DSpace(sample4DBody(body,clockTime,level),s));
  push();scale(Math.min(width,height)/440);renderCreature(section);pop();
  const status=document.getElementById('slice-status');if(status)status.textContent='w = '+s.toFixed(1)+' / '+(section[0].faces.length?section[0].faces.length+' 面截體':'離開觀察空間');
}
function windowResized(){const host=document.getElementById('canvas-host');resizeCanvas(host?host.clientWidth:windowWidth,host?host.clientHeight:windowHeight);resetView();}
