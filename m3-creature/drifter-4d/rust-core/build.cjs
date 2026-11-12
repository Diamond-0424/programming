const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const local=path.join(os.homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo');
const cargo=fs.existsSync(local)?local:'cargo';
const result=spawnSync(cargo,['build','--manifest-path',path.join(__dirname,'Cargo.toml'),'--target','wasm32-unknown-unknown','--release','--offline'],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
fs.copyFileSync(path.join(__dirname,'target/wasm32-unknown-unknown/release/drifter_core.wasm'),path.join(__dirname,'drifter_core.wasm'));
console.log('Rust 核心已更新。');
