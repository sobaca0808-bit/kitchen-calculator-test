// Runs only against a fresh loopback server and disposable browser contexts.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const logicTests=['calculations','storage','recipe-view','preview-isolation'].map(name=>'tests/'+name+'.test.js');
function run(args,env=process.env) {
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0 ? done() : reject(Error(`Check failed (${signal || code}): ${args.join(' ')}`)));
  });
}
const runtimeFiles=new Map([
  ['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],
  ...['calculations','seed','storage','recipe-view','app'].map(name=>['/js/'+name+'.js','js/'+name+'.js'])
]);
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=runtimeFiles.get(pathname);
  if(req.method!=='GET' || !file){res.writeHead(404);res.end();return;}
  try {
    const body=await readFile(resolve(root,file));
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
  } catch {res.writeHead(500);res.end('Cannot read test asset');}
});
try {
  await run(['--test',...logicTests]);
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  const testURL='http://127.0.0.1:'+server.address().port;
  console.log('Browser checks use an isolated local server:',testURL);
  await run(['tests/browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
} catch(error){console.error(error.message);process.exitCode=1;}
finally {await new Promise(done=>server.close(done));}
