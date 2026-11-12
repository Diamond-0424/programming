const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const c={Math};vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sketch.js'),'utf8'),c);
vm.runInContext(`
  globalThis.check=()=>{
    const tank=new TankEnvironment(),h={position:[0,0,0],cage:{phase:'opening'}};
    const initial=JSON.stringify(tank),ecology=JSON.stringify(ecosystem);
    tank.update(0,0,h,true);
    if(JSON.stringify(tank)!==initial)throw Error('paused environment changed');
    h.cage.phase='closing';tank.update(.02,.02,h,true);
    if(tank.pulses.length!==1)throw Error('missing closing pulse');
    tank.update(.02,.04,h,true);
    if(tank.pulses.length!==1)throw Error('repeated pulse');
    for(let i=0;i<18000;i++)tank.update(.02,i*.02,h,true);
    if(tank.pulses.length)throw Error('pulse did not expire');
    for(const p of tank.particles)for(let k=0;k<3;k++)
      if(!Number.isFinite(p.position[k])||Math.abs(p.position[k])>LIFE.bounds[k])throw Error('invalid particle');
    if(JSON.stringify(ecosystem)!==ecology)throw Error('environment changed ecology');
    if(JSON.stringify(new TankEnvironment())!==initial)throw Error('non-deterministic reset');
    const hidden=new TankEnvironment();hidden.update(.02,0,h,false);
    if(hidden.pulses.length)throw Error('invisible hunter emitted pulse');
    TANK.enabled=false;
    const disabled=JSON.stringify(tank);tank.update(.02,400,h,true);
    if(JSON.stringify(tank)!==disabled)throw Error('disabled environment still updates');
    TANK.enabled=true;
    return tank.particles.length;
  };
`,c);
assert.equal(c.check(),240);
console.log('PASS: six minutes of bounded particles, pause, one-shot pulse/expiry, hidden hunter, deterministic reset, unchanged ecology.');
