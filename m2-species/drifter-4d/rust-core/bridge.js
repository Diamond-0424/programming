// 同一份介面供瀏覽器與 Node 驗證使用，不依賴打包工具。
(function(root){
  function createCore(exports){
    const read=()=>Array.from(new Float64Array(exports.memory.buffer,exports.result_ptr(),exports.result_len()));
    return {
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
