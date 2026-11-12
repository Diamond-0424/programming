// Foreground wall-clock benchmark: 5 s warm-up + 30 s sampling, three fresh trials.
// Submission time includes CPU geometry/upload; it is NOT GPU execution time.
(() => {
  if(!globalThis.drifterExperiment?.benchmark)return;
  const host=document.getElementById('canvas-host');
  host.style.width='900px';host.style.height='600px';
  const output=document.createElement('pre');output.id='benchmark-results';
  output.style.cssText='white-space:pre-wrap;color:white;font-size:12px';
  host.parentElement.after(output);
  const group=location.pathname.endsWith('three.html')?'three-low':drifterExperiment.low?'p5-low':'p5-original';
  for(const id of ['view-mode','reset','capture'])document.getElementById(id).disabled=true;
  let ready=false,last=null,elapsed=0,rows=[],trials=[],pending=true,lastText=0,done=false;
  const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
  const summarize=key=>({median:percentile(rows.map(r=>r[key]),.5),p95:percentile(rows.map(r=>r[key]),.95)});
  Promise.resolve(globalThis.drifterCoreReady).then(()=>{ready=true;});
  document.addEventListener('visibilitychange',()=>{last=null;});
  const results=()=>({group,recordedAt:new Date().toISOString(),seed:42,canvas:[900,600],pixelRatio:group==='p5-original'?Math.min(devicePixelRatio,2):1,
    backend:globalThis.drifterCoreStatus,userAgent:navigator.userAgent,cadence:'requestAnimationFrame (p5 target 1000)',warmupSeconds:5,sampleSeconds:30,trials});
  globalThis.drifterBenchmark={
    begin(){
      if(!ready||done||document.hidden||paused){last=null;return false;}
      if(pending){resetSimulation();resetView();viewMode='projection';updateModeLabels();pending=false;last=null;}
      const now=performance.now(),interval=last===null?null:now-last;last=now;
      if(interval!==null)elapsed+=interval;
      this.interval=interval;this.deltaTime=interval===null?0:interval/1000;
      if(now-lastText>=500){output.textContent=group+' · 第 '+(trials.length+1)+'/3 次 · '+(elapsed/1000).toFixed(1)+' / 35 秒';lastText=now;}
      return true;
    },
    end(update,submit){
      if(elapsed>=5000&&this.interval!==null)rows.push({interval:this.interval,update,submit});
      if(elapsed<35000)return;
      trials.push({frames:rows.length,frameMs:summarize('interval'),updateMs:summarize('update'),submitMs:summarize('submit'),over33ms:rows.filter(r=>r.interval>33.3).length/rows.length,raw:rows});
      rows=[];elapsed=0;pending=true;
      if(trials.length===3){
        done=true;globalThis.drifterBenchmarkResult=results();
        sessionStorage.setItem('drifter-'+group,JSON.stringify(results()));
        output.textContent=JSON.stringify({...results(),trials:trials.map(({raw,...t})=>t)},null,2);
        const a=document.createElement('a');a.textContent='下載原始量測 JSON';
        const url=URL.createObjectURL(new Blob([JSON.stringify(results(),null,2)],{type:'application/json'}));
        a.href=url;a.download=group+'.json';output.before(a);
        addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
      }
    }
  };
})();
