// Runs only against a fresh loopback server and disposable browser contexts.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const mount='/kitchen-calculator-test';
const logicTests=['calculations','storage','storage-extensions','json-merge','import-transaction','folders','recipe-view','recipe-card-model','profitability','preview-isolation','pages','packaging','drafts','photos','photo-print-selection'].map(name=>'tests/'+name+'.test.js');
function run(args,env=process.env) {
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0 ? done() : reject(Error(`Check failed (${signal || code}): ${args.join(' ')}`)));
  });
}
const runtimeFiles=new Map([
  ['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/assets/folders.css','assets/folders.css'],['/assets/import.css','assets/import.css'],['/assets/food-pattern.svg','assets/food-pattern.svg'],
  ['/assets/gastronomic-background.webp','assets/gastronomic-background.webp'],
  ...['calculations','seed','storage','folders','recipe-view','recipe-card-model','recipe-card-templates','profitability','profitability-view','packaging','packaging-ui','drafts','photo-viewer','photos','json-merge','import-transaction','import-ui','app'].map(name=>['/js/'+name+'.js','js/'+name+'.js'])
]);
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relativePath=pathname.startsWith(mount+'/') ? pathname.slice(mount.length) : null;
  const file=runtimeFiles.get(relativePath);
  if(req.method!=='GET' || !file){res.writeHead(404);res.end();return;}
  try {
    const body=await readFile(resolve(root,file));
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
  } catch {res.writeHead(500);res.end('Cannot read test asset');}
});
try {
  await run(['--test',...logicTests]);
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  const testURL='http://127.0.0.1:'+server.address().port+mount+'/';
  console.log('Browser checks use an isolated local server:',testURL);
  await run(['tests/browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/products-list.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/library-lists.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/packaging.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/task8.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/two-photos.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/card-modes.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/profitability.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/compact-print.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/folders.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/safe-json-merge.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
  await run(['tests/import-transaction.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL});
} catch(error){console.error(error.message);process.exitCode=1;}
finally {await new Promise(done=>server.close(done));}
