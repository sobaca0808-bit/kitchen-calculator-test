'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createServer}=require('node:http');
async function start(root,{home=false}={}){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8'),allowed=new Set(['index.html','presentation.html',...Array.from(html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)/g),m=>new URL(m[1],'http://localhost/').pathname.slice(1))]);
 for(const file of [...allowed].filter(f=>f.endsWith('.css')))for(const m of (await fs.readFile(path.join(root,file),'utf8')).matchAll(/url\(["']?([^"')]+)/g))allowed.add(path.posix.join(path.posix.dirname(file),m[1]));
 let mount='/kitchen-calculator-test/';
 if(allowed.has('manifest.webmanifest')){const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest'),'utf8'));for(const icon of manifest.icons)allowed.add(icon.src);allowed.add('sw.js');allowed.add('pwa-version.json');mount=manifest.id;}
 const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),name=url.pathname.startsWith(mount)?url.pathname.slice(mount.length)||'index.html':null;if(req.method!=='GET'||!allowed.has(name)){res.writeHead(404);res.end();return;}try{const body=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.json')?'application/json':name.endsWith('.png')?'image/png':name.endsWith('.ico')?'image/x-icon':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.webp')?'image/webp':name.endsWith('.svg')?'image/svg+xml':'text/javascript','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end();}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});return {url:'http://127.0.0.1:'+server.address().port+mount+(!home&&html.includes('data-sintez-screen')?'?section=dish':''),close:()=>new Promise(done=>server.close(done))};
}
module.exports={start};
