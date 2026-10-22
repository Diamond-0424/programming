// 僅在本機提供作品檔案，讓瀏覽器可以載入 WebAssembly。
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.wasm':'application/wasm','.png':'image/png'};
const root=fs.realpathSync(__dirname);
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const name=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    const target=path.resolve(root,name),relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)||name.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
    const type=types[path.extname(target)];if(!type){res.writeHead(404).end();return;}
    const real=fs.realpathSync(target),rel=path.relative(root,real);
    if(rel.startsWith('..')||path.isAbsolute(rel)){res.writeHead(403).end();return;}
    const data=fs.readFileSync(real);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404).end();}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(8080,'127.0.0.1',()=>console.log('開啟 http://127.0.0.1:8080，按 Ctrl+C 結束。'));
