// 同一份介面供瀏覽器與 Node 驗證使用，不依賴打包工具。
(function(root){
  function createCore(exports){
    if(exports.kernel_version?.()!==1)throw new Error('Rust 核心版本不符，請重新編譯並重新整理頁面。');
    const read=()=>Array.from(new Float64Array(exports.memory.buffer,exports.result_ptr(),exports.result_len()));
    const ranges=new WeakMap();
    const input=n=>{const ptr=exports.input_resize(n);if(!ptr)throw new Error('Rust 輸入超出容量');const b=new Float64Array(exports.memory.buffer,ptr,n);ranges.set(b,[ptr,n]);return b;};
    // Rust 輸出擴容可能使舊 ArrayBuffer 失效，不能再從舊 view 讀取長度。
    const refresh=b=>{const [ptr,n]=ranges.get(b);return new Float64Array(exports.memory.buffer,ptr,n);};
    const put3=(b,o,v)=>{b[o]=v[0];b[o+1]=v[1];b[o+2]=v[2];};
    const get3=(b,o)=>[b[o],b[o+1],b[o+2]];
    const modes=['wander','flee','recover','trapped'];
    return {
      preyStep(world,dt,visible,life,fx){
        // 隨機排程與出生事件留在 JS，數值循環一次交給 Rust；保持既有亂數順序。
        const active=[];
        for(const p of world.prey){
          if(!p.alive){
            active.push(false);p.respawn-=dt;
            if(p.respawn<=0){
              const candidates=Array.from({length:8},()=>{const q=world.randomDirection(),extent=Math.max(...q.map((v,k)=>Math.abs(v)/life.bounds[k]));return q.map(v=>v/extent*.94);});
              candidates.sort((a,b)=>Math.hypot(...b.map((v,k)=>v-world.hunter.position[k]))-Math.hypot(...a.map((v,k)=>v-world.hunter.position[k])));
              p.position=candidates[0];p.velocity=[0,0,0];p.steering=[0,0,0];p.energy=1;p.alive=true;p.mode='wander';p.intent=0;p.birth=0;p.startle=0;
              world.emit('birth',p.position,{preyId:p.id});
            }
          }else{
            active.push(true);
            if(p.mode!=='trapped'){
              p.intent-=dt;if(p.intent<=0){p.direction=world.randomDirection();p.intent=life.legMin+world.random()*life.legSpan;}
            }
          }
        }
        let b=input(16+world.prey.length*24);b.set([dt,+visible,life.danger,fx.birthDuration,...life.bounds,...world.hunter.position,...world.hunter.velocity,world.prey.length]);
        world.prey.forEach((p,i)=>{const o=16+i*24;put3(b,o,p.position);put3(b,o+3,p.velocity);put3(b,o+6,p.steering||p.velocity);put3(b,o+9,p.direction);
          // 槽 14 傳「是否存活」：本步剛復活的個體也算鄰居，與 JS 備援一致。
          b[o+12]=p.energy;b[o+13]=modes.indexOf(p.mode);b[o+14]=+p.alive;b[o+15]=p.birth;b[o+22]=+p.alive;b[o+23]=+active[i];
          // 節奏（速度倍率與閃避軸）在 JS 算好再傳入，Rust 只做加減乘除，兩邊不會因三角函數差異而分歧。
          b.set(world.rhythm(p),o+16);b[o+19]=p.startle||0;});
        exports.prey_step();b=refresh(b);
        world.prey.forEach((p,i)=>{if(!active[i])return;const o=16+i*24;p.birth=b[o+15];if(p.mode==='trapped')return;
          p.position=get3(b,o);p.velocity=get3(b,o+3);p.steering=get3(b,o+6);p.energy=b[o+12];p.mode=modes[b[o+13]];p.startle=b[o+19];});
      },
      move(agent,direction,speed,dt,response,bounds){
        let b=input(18);b.set([dt,speed,response,...bounds,...agent.position,...agent.velocity,...(agent.steering||agent.velocity),...direction]);
        exports.move_agent();b=refresh(b);agent.position=get3(b,6);agent.velocity=get3(b,9);agent.steering=get3(b,12);
      },
      collisions(world,life,fx){
        const agents=[...world.prey,world.hunter];let b=input(6+agents.length*12);b.set([agents.length,3,fx.restitution,...life.bounds]);
        agents.forEach((a,i)=>{const o=6+i*12;put3(b,o,a.position);put3(b,o+3,a.velocity);b[o+6]=a.radius;b[o+7]=a.mass;b[o+8]=+(a!==world.hunter&&a.alive&&a.mode!=='trapped');b[o+9]=+(a===world.hunter||a.alive);});
        exports.collisions();b=refresh(b);
        agents.forEach((a,i)=>{const o=6+i*12;a.position=get3(b,o);a.velocity=get3(b,o+3);});
        const impacts=read();for(let i=0;i<impacts.length;i+=3)world.emit('impact',impacts.slice(i,i+3));
      },
      fragments(world,effect,dt,fx,params){
        effect.trailClock+=dt;const sample=effect.trailClock>=1/60;if(sample)effect.trailClock%=1/60;
        let b=input(24+effect.fragments.length*24);
        b.set([dt,effect.age,+!!effect.internal,fx.scatterTime,fx.absorbRamp,fx.viscosity,fx.restitution,params.nodeRadius,params.lineWidth,
          ...world.hunter.position,...world.hunter.velocity,...effect.normal,world.fragmentSurface(effect.normal),effect.fragments.length]);
        effect.fragments.forEach((f,i)=>{const o=24+i*24;b.set([...f.position,...f.velocity,...(f.half||[0,0,0]),+!!f.half,f.spin,...(f.swirlAxis||[0,1,0]),
          f.driftPhase||0,f.driftFreq||3.2,f.driftAmp||2.2,f.swirlSpeed||46,f.wavePhase||0,f.waveFreq||3.5,f.waveAmp||32,+f.absorbed],o);});
        exports.fragments();b=refresh(b);
        effect.fragments.forEach((f,i)=>{if(f.absorbed){if(sample)f.history.shift();return;}
          const o=24+i*24;f.position=get3(b,o);f.velocity=get3(b,o+3);f.absorbed=!!b[o+21];
          if(sample){f.history.push(f.position.slice());if(f.history.length>fx.trailSamples)f.history.shift();}
        });
      },
      transform(meshes,stretch,scale,tilt,turn,axis,cage){
        const count=meshes.reduce((n,m)=>n+m.points.length,0);let b=input(24+count*3);
        b.set([count,stretch,scale,tilt,turn,...axis,cage?.open||0,...(cage?.axis||[1,0,0])]);
        let offset=24;for(const m of meshes)for(const p of m.points){put3(b,offset,p);offset+=3;}
        exports.transform();b=refresh(b);offset=24;
        return meshes.map(m=>({...m,points:m.points.map(()=>{const p=get3(b,offset);offset+=3;return p;})}));
      },
      smallPoints(points,time,phase,size,position){
        let b=input(7+points.length*3);b.set([points.length,phase+time*.12,phase*.7+time*.08,size,...position]);
        points.forEach((p,i)=>put3(b,7+i*3,p));exports.small_points();b=refresh(b);return points.map((_,i)=>get3(b,7+i*3));
      },
      rings(points,radii,axes,segments=24){
        const b=input(8+points.length*4);b.set([points.length,segments,...axes.right,...axes.up]);points.forEach((p,i)=>{put3(b,8+i*4,p);b[11+i*4]=radii[i];});
        exports.rings();const data=read();return points.map((_,i)=>Array.from({length:segments},(_,j)=>data.slice((i*segments+j)*3,(i*segments+j+1)*3)));
      },
      lifeGeometry(birth,t,radius,center){
        input(6).set([+birth,t,radius,...center]);exports.life_geometry();const data=read();
        const points=Array.from({length:data.length/3},(_,i)=>data.slice(i*3,i*3+3));
        return {rings:[points.slice(0,40),points.slice(40,80),points.slice(80,120)],spokes:points.slice(120)};
      },
      fragmentGeometry(fragments,age,scatter,nodeRadius,hunter,axes){
        const b=input(13+fragments.length*8);b.set([fragments.length,age,scatter,nodeRadius,...hunter,...axes.right,...axes.up]);
        fragments.forEach((f,i)=>b.set([...f.position,...(f.half||[0,0,0]),f.spin,+!!f.half],13+i*8));exports.fragment_geometry();const data=read();let offset=0;
        return fragments.map(f=>Array.from({length:f.half?2:16},()=>{const p=data.slice(offset,offset+3);offset+=3;return p;}));
      },
      squish(points,normal,center,compression,bulge){
        let b=input(9+points.length*3);b.set([points.length,...normal,...center,compression,bulge]);points.forEach((p,i)=>put3(b,9+i*3,p));
        exports.squish_geometry();b=refresh(b);return points.map((_,i)=>get3(b,9+i*3));
      },
      geometry(params,time,level,s,mode){
        exports.geometry(time,level,params.halfSize,params.rotationSpeed,params.projectionDistance,s,mode==='projection'?1:0);
        const data=read();if(!data.length)throw new Error('projectionDistance 必須大於母體外接半徑。');
        let i=3;const [pointCount,edgeCount,faceCount]=data;
        const take=n=>{const v=data.slice(i,i+n);i+=n;return v;};
        const points=Array.from({length:pointCount},()=>take(4));
        const edges=Array.from({length:edgeCount},()=>take(2));
        const faces=Array.from({length:faceCount},()=>take(data[i++]));
        if(mode==='projection')return {points:points.map(p=>p.slice(0,3)),edges,faces,level,mode,
          source4D:Array.from({length:pointCount},()=>take(4))};
        return {points,edges,faces,s,level};
      },
      segmentContact(p,q,r,s){
        exports.contact(...p,...q,...r,...s);const data=read();
        return {first:data.slice(0,3),second:data.slice(3,6),distance:data[6]};
      }
    };
  }
  if(typeof module!=='undefined'&&module.exports){module.exports=createCore;return;}
  root.drifterCoreStatus='loading';
  root.drifterCoreReady=(async()=>{
    try{
      const response=await fetch(new URL('./drifter_core.wasm',document.currentScript.src));
      if(!response.ok)throw new Error('HTTP '+response.status);
      const {instance}=await WebAssembly.instantiate(await response.arrayBuffer());
      root.drifterCore=createCore(instance.exports);root.drifterCoreStatus='rust';return root.drifterCore;
    }catch(error){
      root.drifterCoreStatus='javascript';
      console.warn('Rust 核心無法載入，使用原本 JavaScript 計算。請以 HTTP 開啟頁面。',error);return null;
    }
  })();
})(globalThis);
