const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  let now=0,resets=0,hidden=false,visibility;
  const element=()=>({style:{},parentElement:{after(){}},before(){},disabled:false});
  const c=vm.createContext({drifterExperiment:{benchmark:true,low:true},location:{pathname:'/three.html'},
    document:{get hidden(){return hidden;},getElementById:()=>element(),createElement:element(),
      addEventListener:(name,fn)=>{visibility=fn;}},
    performance:{now:()=>now},paused:false,drifterCoreStatus:'rust',drifterCoreReady:Promise.resolve(),
    devicePixelRatio:2,navigator:{userAgent:'unit-test'},sessionStorage:{setItem(){}},
    URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob,addEventListener(){},
    resetSimulation:()=>resets++,resetView(){},updateModeLabels(){}});
  c.document.createElement=()=>element();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../benchmark.js'),'utf8'),c);
  await new Promise(setImmediate);const b=c.drifterBenchmark;
  assert(b.begin());b.end(2,3);
  hidden=true;now+=100000;assert.equal(b.begin(),false);hidden=false;visibility();assert(b.begin());assert.equal(b.deltaTime,0);
  c.paused=true;now+=100000;assert.equal(b.begin(),false);c.paused=false;assert(b.begin());assert.equal(b.deltaTime,0);
  // 50 Hz sampling: all intervals below the 33.3 ms threshold.
  for(let i=0;i<6000&&!c.drifterBenchmarkResult;i++){now+=20;if(b.begin())b.end(2,3);}
  const result=c.drifterBenchmarkResult;assert(result);assert.equal(resets,3);assert.equal(result.trials.length,3);
  for(const trial of result.trials){assert.equal(trial.frameMs.median,20);assert.equal(trial.frameMs.p95,20);assert.equal(trial.over33ms,0);assert.equal(trial.updateMs.p95,2);assert.equal(trial.submitMs.p95,3);assert(trial.frames>=1500&&trial.frames<=1501);}
  assert.equal(b.begin(),false);
  console.log('PASS: three independent 5+30 second trials, percentile metrics, raw samples, excluded hidden/paused time, first-frame delta, completion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
