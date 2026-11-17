'use strict';
const {createServer}=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const BASE='63443c53d2c7a99060584d54eae0e9c779475405',MOUNT='/kitchen-calculator-test/';
const mapping={
 'js/storage.js':['kitchen-calculator-pr2-browser-test-v1','kitchen-calculator-preview-v1'],
 'js/drafts.js':['kitchen-calculator-pr2-browser-drafts-v1','kitchen-calculator-preview-drafts-v1'],
 'js/photos.js':['kitchen-calculator-test-photos-v1','kitchen-calculator-preview-photos-v1'],
 'js/import-transaction.js':['kitchen-calculator-test-import-backups-v1','kitchen-calculator-preview-import-backups-v1'],
 'js/appearance.js':['kitchen-calculator-appearance-test-v1','kitchen-calculator-appearance-preview-v1']
};
async function start(root){
 const readBase=file=>execFileSync('git',['-C',root,'show',BASE+':'+file]);
 async function runtime(read){
  const html=(await read('index.html')).toString(),files=new Set(['index.html',...Array.from(html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)/g),m=>new URL(m[1],'http://localhost/').pathname.slice(1))]);
  for(const css of [...files].filter(f=>f.endsWith('.css')))for(const m of (await read(css)).toString().matchAll(/url\(["']?([^"')]+)/g))files.add(path.posix.join(path.posix.dirname(css),m[1]));
  const contents=new Map();for(const file of files){if(file.includes('..')||file.startsWith('/'))throw Error('Only relative runtime files may be served');contents.set(file,await read(file));}return contents;
 }
 const base=await runtime(readBase),preview=await runtime(file=>fs.readFile(path.join(root,file)));
 for(const [file,[old,current]]of Object.entries(mapping)){
  const text=preview.get(file).toString();if(text.split(old).length!==2)throw Error('Inspect the storage constant before packaging '+file);preview.set(file,Buffer.from(text.replace(old,current)));
 }
 preview.set('index.html',Buffer.from(preview.get('index.html').toString().replace('<title>ТЕСТ PR №2 — Кухонный калькулятор</title>','<title>Предпросмотр PR №20 — Кухонный калькулятор</title>').replace('ТЕСТ PR №2 · Отдельное хранилище. Рабочие продукты и рецепты здесь не используются.','ТЕСТ · PR №20 · Отдельные данные предпросмотра. Основная версия не изменяется.')));
 const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname,isPreview=pathname.startsWith(MOUNT+'preview/');
  if(!pathname.startsWith(MOUNT)){response.writeHead(404);response.end();return;}
  const file=pathname.slice((isPreview?MOUNT+'preview/':MOUNT).length)||'index.html',body=(isPreview?preview:base).get(file);
  if(request.method!=='GET'||!body){response.writeHead(404);response.end();return;}
  const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/javascript';response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});response.end(body);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+server.address().port+MOUNT;
 return {server,url,previewURL:url+'preview/?section=dish',base,preview,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={start,BASE,mapping};
