'use strict';
const {createServer}=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const mount='/kitchen-calculator-test/pwa/';
async function start(versions){
 let selected=0;const requests=[];
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname);
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/kitchen-calculator-test/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><title>Unchanged main sentinel</title><p>Main</p></html>');return;}
  const file=url.pathname.startsWith(mount)?url.pathname.slice(mount.length)||'index.html':null;
  if(req.method!=='GET'||!file||file.includes('..')){res.writeHead(404);res.end();return;}
  try{const body=await fs.readFile(path.join(versions[selected],file)),type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'image/svg+xml';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 return {url:origin+mount,mainURL:origin+'/kitchen-calculator-test/',requests,select(index){selected=index;},close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={start};
