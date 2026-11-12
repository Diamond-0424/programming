import * as THREE from './vendor/three/build/three.module.js';
import {LineSegments2} from './vendor/three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from './vendor/three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from './vendor/three/examples/jsm/lines/LineMaterial.js';
import {OrbitControls} from './vendor/three/examples/jsm/controls/OrbitControls.js';

// Drawing adapter only: never updates the ecosystem, consumes random numbers,
// or changes collision geometry. p5 coordinates have positive Y down.
export class ThreeRenderer {
  constructor(host){
    this.host=host;this.scene=new THREE.Scene();
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(1);this.renderer.setClearColor(0);
    this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    host.append(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(60,1,1,4000);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enablePan=false;this.controls.minDistance=30;this.controls.maxDistance=2500;
    this.controls.zoomSpeed=.65;
    this.batches=new Map();this.stack=[];this.transform={scale:1,offset:[0,0,0]};
    this.lineWidth=1;this.alpha=1;this.points=[];this.nodeCount=0;
    this.nodeCapacity=0;this.matrix=new THREE.Matrix4();this.position=new THREE.Vector3();this.size=new THREE.Vector3();
    this.nodeMaterial=new THREE.ShaderMaterial({
      transparent:true,depthTest:true,depthWrite:true,side:THREE.DoubleSide,
      vertexShader:`attribute vec3 nodeStyle; varying vec2 vUv; varying vec3 vStyle;
        void main(){vUv=uv*2.0-1.0;vStyle=nodeStyle;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec2 vUv; varying vec3 vStyle;
        void main(){float d=length(vUv);float aa=fwidth(d);float radius=.8;
        float edge=radius+vStyle.y*aa*.5;
        float outer=1.0-smoothstep(edge-aa,edge+aa,d);
        if(outer<.01)discard;
        float inner=radius-vStyle.y*aa*.5;
        float ring=smoothstep(inner-aa,inner+aa,d);
        gl_FragColor=vec4(vec3(ring*vStyle.x),outer*vStyle.z);}`
    });
    this.growNodes(512);this.growFaces(64);this.resize();this.resetView();
  }
  // 微光填色面：相加混色的半透明三角形，顏色已乘上亮度，不寫入深度。
  growFaces(capacity){
    const old=this.faces;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*9),3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(capacity*9),3).setUsage(THREE.DynamicDrawUsage));
    this.faceMaterial=this.faceMaterial||new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,
      blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true,side:THREE.DoubleSide});
    this.faces=new THREE.Mesh(geometry,this.faceMaterial);this.faces.frustumCulled=false;this.faces.renderOrder=0;
    if(old){
      geometry.attributes.position.array.set(old.geometry.attributes.position.array);
      geometry.attributes.color.array.set(old.geometry.attributes.color.array);
      this.scene.remove(old);old.geometry.dispose();
    }
    this.scene.add(this.faces);this.faceCapacity=capacity;
  }
  face(points,color,alpha){
    if(alpha<=0)return;
    if(this.faceCount===this.faceCapacity)this.growFaces(this.faceCapacity*2);
    const position=this.faces.geometry.attributes.position.array,colors=this.faces.geometry.attributes.color.array;
    const offset=this.faceCount++*9;
    points.forEach((p,i)=>{position.set(this.point(p),offset+i*3);colors.set([color[0]*alpha,color[1]*alpha,color[2]*alpha],offset+i*3);});
  }
  // 與 sketch.js 的 SPACE 相同：活動空間放大 1.5 倍，鏡頭等比拉遠。
  resetView(){this.camera.position.set(0,115*SPACE,440*SPACE);this.camera.up.set(0,1,0);this.controls.target.set(0,0,0);this.controls.update();}
  resize(){
    const {clientWidth:w,clientHeight:h}=this.host;
    this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.width=w;this.height=h;
    for(const b of this.batches.values())b.material.resolution.set(w,h);
  }
  growNodes(capacity){
    const old=this.nodes,oldStyle=this.nodeStyle;
    const geometry=new THREE.PlaneGeometry(2,2);
    this.nodeStyle=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('nodeStyle',this.nodeStyle);
    this.nodes=new THREE.InstancedMesh(geometry,this.nodeMaterial,capacity);
    this.nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodes.frustumCulled=false;this.nodes.renderOrder=2;
    if(old){
      this.nodes.instanceMatrix.array.set(old.instanceMatrix.array);
      this.nodeStyle.array.set(oldStyle.array);
      this.scene.remove(old);old.geometry.dispose();old.dispose();
    }
    this.scene.add(this.nodes);this.nodeCapacity=capacity;
  }
  begin(){
    this.controls.update();this.camera.updateMatrixWorld();
    for(const b of this.batches.values())b.count=0;
    this.nodeCount=0;this.faceCount=0;this.stack.length=0;this.transform={scale:1,offset:[0,0,0]};
  }
  push(){this.stack.push({scale:this.transform.scale,offset:this.transform.offset.slice()});}
  pop(){this.transform=this.stack.pop();}
  scale(value){this.transform.scale*=value;}
  translate(...p){for(let k=0;k<3;k++)this.transform.offset[k]+=p[k]*this.transform.scale;}
  point(p){return p.slice(0,3).map((v,k)=>(v*this.transform.scale+this.transform.offset[k])*(k===1?-1:1));}
  createBatch(width,capacity=1024){
    const geometry=new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(capacity*6));
    geometry.setColors(new Float32Array(capacity*6));
    const material=new LineMaterial({color:0xffffff,linewidth:width,vertexColors:true,
      transparent:true,blending:THREE.AdditiveBlending,depthTest:true,depthWrite:true});
    material.resolution.set(this.width,this.height);
    const mesh=new LineSegments2(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;
    const positions=geometry.attributes.instanceStart.data,colors=geometry.attributes.instanceColorStart.data;
    positions.setUsage(THREE.DynamicDrawUsage);colors.setUsage(THREE.DynamicDrawUsage);
    const batch={geometry,material,mesh,positions,colors,count:0,capacity};
    this.scene.add(mesh);return batch;
  }
  line(a,b,width=this.lineWidth,alpha=this.alpha){
    if(alpha<=0)return;
    // Animated fragment widths are continuous. Keep a bounded set of reusable
    // GPU batches instead of retaining a new mesh/material for every width.
    width=Math.max(.25,Math.min(4,Math.round(width*4)/4));
    const key=width.toFixed(4);let batch=this.batches.get(key);
    if(!batch){batch=this.createBatch(width);this.batches.set(key,batch);}
    if(batch.count===batch.capacity){
      const old=batch;batch=this.createBatch(width,old.capacity*2);batch.count=old.count;
      batch.positions.array.set(old.positions.array);batch.colors.array.set(old.colors.array);
      this.scene.remove(old.mesh);old.geometry.dispose();old.material.dispose();this.batches.set(key,batch);
    }
    const offset=batch.count++*6;
    batch.positions.array.set(this.point(a),offset);batch.positions.array.set(this.point(b),offset+3);
    batch.colors.array.fill(Math.max(0,Math.min(1,alpha)),offset,offset+6);
  }
  node(p,radius,brightness,lineWidth,opacity=1){
    if(radius<=0||brightness<=0||opacity<=0)return;
    if(this.nodeCount===this.nodeCapacity)this.growNodes(this.nodeCapacity*2);
    this.position.fromArray(this.point(p));
    const r=radius*this.transform.scale/0.8;
    this.size.set(r,r,r);this.matrix.compose(this.position,this.camera.quaternion,this.size);
    this.nodes.setMatrixAt(this.nodeCount,this.matrix);
    this.nodeStyle.setXYZ(this.nodeCount++,brightness,lineWidth,opacity);
  }
  creature(meshes,breathing,appearance){
    const {opacity=1,nodeScale=1}=appearance;
    meshes.forEach((mesh,layer)=>{
      if(!mesh.edges.length)return;
      for(const face of mesh.style?.faces||[]){
        const c=[0,1,2].map(k=>(face.points[0][k]+face.points[1][k]+face.points[2][k])/3);
        const color=mesh.style.faceColor.map(v=>v/255);
        for(const [scaleUp,alpha] of [[CREATURE_LOOK.faceHaloScale,CREATURE_LOOK.faceHalo],[1,CREATURE_LOOK.faceAlpha]])
          this.face(face.points.map(p=>p.map((v,k)=>c[k]+(v-c[k])*scaleUp)),color,alpha/255*face.alpha*opacity);
      }
      for(const [edgeIndex,[a,b]] of mesh.edges.entries()){
        const depth=mesh.source4D?(mesh.source4D[a][3]+mesh.source4D[b][3])/(2*Math.SQRT2*PARAMS.halfSize):0;
        const look=mesh.style?mesh.style.edge[edgeIndex]*(mesh.style.alpha??1):.96+.04*depth;
        this.line(mesh.points[a],mesh.points[b],PARAMS.lineWidth*(layer?.75:1),
          (layer?150*breathing.nodeLight:245)/255*look*PARAMS.lineBrightness*opacity);
      }
      mesh.points.forEach((p,i)=>this.node(p,PARAMS.nodeRadius*(layer?.7:1)*nodeScale*(mesh.style?mesh.style.node[i]:1)*
        (mesh.source4D?PARAMS.projectionDistance/(PARAMS.projectionDistance-mesh.source4D[i][3]):1),
        (layer?190/255:1)*breathing.nodeLight,PARAMS.nodeLineWidth*(layer?.75:1),opacity));
    });
  }
  // Existing special-effect geometry uses this small immediate-mode facade.
  // Only effect vertices use it; creature nodes use GPU billboard instances.
  beginShape(mode){this.mode=mode;this.points.length=0;}
  vertex(...p){this.points.push(p);}
  endShape(close){
    const step=this.mode==='lines'?2:1;
    for(let i=0;i<this.points.length-1;i+=step)this.line(this.points[i],this.points[i+1]);
    if(close==='close'&&this.points.length>2)this.line(this.points.at(-1),this.points[0]);
  }
  end(){
    for(const b of this.batches.values()){
      b.mesh.visible=b.count>0;b.geometry.instanceCount=b.count;
      if(b.count){b.positions.clearUpdateRanges();b.positions.addUpdateRange(0,b.count*6);b.positions.needsUpdate=true;
        b.colors.clearUpdateRanges();b.colors.addUpdateRange(0,b.count*6);b.colors.needsUpdate=true;}
    }
    const faceGeometry=this.faces.geometry;
    faceGeometry.setDrawRange(0,this.faceCount*3);
    faceGeometry.attributes.position.needsUpdate=true;faceGeometry.attributes.color.needsUpdate=true;
    this.nodes.count=this.nodeCount;
    this.nodes.instanceMatrix.needsUpdate=true;this.nodeStyle.needsUpdate=true;
    this.renderer.render(this.scene,this.camera);
  }
  capture(){
    // Render immediately before toBlob; do not retain the drawing buffer every frame.
    this.renderer.render(this.scene,this.camera);
    this.renderer.domElement.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='m2-three-'+viewMode+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
  dispose(){
    this.controls.dispose();
    for(const b of this.batches.values()){b.geometry.dispose();b.material.dispose();}
    this.batches.clear();this.nodes.geometry.dispose();this.nodes.dispose();this.faces.geometry.dispose();this.faceMaterial.dispose();this.nodeMaterial.dispose();
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
