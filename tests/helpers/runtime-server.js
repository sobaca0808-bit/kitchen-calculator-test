'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createServer}=require('node:http');
async function start(root){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8'),allowed=new Set(['index.html',...Array.from(html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)/g),m=>new URL(m[1],'http://localhost/').pathname.slice(1))]);
 for(const file of [...allowed].filter(f=>f.endsWith('.css')))for(const m of (await fs.readFile(path.join(root,file),'utf8')).matchAll(/url\(["']?([^"')]+)/g))allowed.add(path.posix.join(path.posix.dirname(file),m[1]));
 const mount='/kitchen-calculator-test/';
 const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),name=url.pathname.startsWith(mount)?url.pathname.slice(mount.length)||'index.html':null;if(req.method!=='GET'||!allowed.has(name)){res.writeHead(404);res.end();return;}try{const body=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.webp')?'image/webp':name.endsWith('.svg')?'image/svg+xml':'text/javascript','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end();}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});return {url:'http://127.0.0.1:'+server.address().port+mount,close:()=>new Promise(done=>server.close(done))};
}
module.exports={start};
