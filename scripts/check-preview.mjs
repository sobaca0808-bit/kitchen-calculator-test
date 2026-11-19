// Runs only against a fresh loopback server and disposable browser contexts.
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
// The new glass matrix replaces only obsolete exact-color visual suites.
// Existing functional suites still run on the actual redesigned application.
const glass=process.argv.includes('--glass');
if(glass)process.env.KITCHEN_GLASS_TEST='1';
if(process.argv.includes('--unified'))process.env.KITCHEN_UNIFIED_TEST='1';
const mount='/kitchen-calculator-test';
const logicTests=['calculations','storage','storage-extensions','json-merge','import-transaction','folders','recipe-view','recipe-card-model','profitability','preview-isolation','pages','packaging','drafts','photos','photo-print-selection','appearance','preview-persistence','establishment-expenses','recipe-expense-preferences'].map(name=>'tests/'+name+'.test.js');
function run(args,env=process.env) {
  return new Promise((done,reject)=>{
    const label=env.KITCHEN_TEST_THEME;
    const child=spawn(process.execPath,args,{cwd:root,env,stdio:label?['ignore','pipe','pipe']:'inherit'});
    if(label)for(const stream of [child.stdout,child.stderr]){
      let pending='';stream.on('data',chunk=>{pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)process.stdout.write('['+label+'] '+line+'\n');});stream.on('end',()=>{if(pending)process.stdout.write('['+label+'] '+pending+'\n');});
    }
    child.once('error',reject);
    child.once('exit',(code,signal)=>code===0 ? done() : reject(Error(`Check failed (${signal || code}): ${args.join(' ')}`)));
  });
}
const runtimeFiles=new Map([
  ['/assets/classic-dark-glass.css','assets/classic-dark-glass.css'],
  ['/assets/unified-workspace.css','assets/unified-workspace.css'],['/assets/mode-chef.svg','assets/mode-chef.svg'],['/icons/sintez/icon-192.png','icons/sintez/icon-192.png'],['/assets/unified-kitchen.webp','assets/unified-kitchen.webp'],['/assets/unified-kitchen-mobile.webp','assets/unified-kitchen-mobile.webp'],...['workspace-policy','unified-card','build-info','unified-workspace'].map(name=>['/js/'+name+'.js','js/'+name+'.js']),
  ['/assets/recipe-showcase.css','assets/recipe-showcase.css'],['/js/recipe-showcase.js','js/recipe-showcase.js'],
  ['/assets/sintez-glass.css','assets/sintez-glass.css'],['/assets/sintez-glass-kitchen.webp','assets/sintez-glass-kitchen.webp'],['/assets/sintez-glass-kitchen-mobile.webp','assets/sintez-glass-kitchen-mobile.webp'],
  ['/assets/sintez-matte.svg','assets/sintez-matte.svg'],
  ...['favicon.ico','icon-16.png','icon-32.png','icon-180.png'].map(name=>['/icons/sintez/'+name,'icons/sintez/'+name]),
  ['/assets/sintez-intro.css','assets/sintez-intro.css'],['/js/sintez-intro.js','js/sintez-intro.js'],
  ...['01_intro','02_home','03_chef','04_business'].map(name=>['/assets/sintez-intro/'+name+'.jpg','assets/sintez-intro/'+name+'.jpg']),
  ['/assets/sintez-home.css','assets/sintez-home.css'],['/js/sintez-home.js','js/sintez-home.js'],['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/assets/folders.css','assets/folders.css'],['/assets/import.css','assets/import.css'],['/assets/editor-actions.css','assets/editor-actions.css'],['/assets/warm-kitchen.css','assets/warm-kitchen.css'],['/assets/food-pattern.svg','assets/food-pattern.svg'],
  ['/assets/appearance.css','assets/appearance.css'],['/assets/graphite-kitchen.webp','assets/graphite-kitchen.webp'],['/assets/sage-kitchen.webp','assets/sage-kitchen.webp'],
  ['/js/persistence-diagnostics.js','js/persistence-diagnostics.js'],['/js/recipe-expense-preferences.js','js/recipe-expense-preferences.js'],
  ['/assets/establishment-expenses.css','assets/establishment-expenses.css'],['/js/establishment-expenses.js','js/establishment-expenses.js'],['/js/establishment-expenses-ui.js','js/establishment-expenses-ui.js'],
  ['/assets/gastronomic-background.webp','assets/gastronomic-background.webp'],['/assets/watercolor-kitchen.webp','assets/watercolor-kitchen.webp'],
  ...['appearance','calculations','seed','storage','folders','recipe-view','recipe-card-model','recipe-card-templates','profitability','profitability-view','packaging','packaging-ui','drafts','photo-viewer','photos','json-merge','import-transaction','import-ui','editor-actions','app'].map(name=>['/js/'+name+'.js','js/'+name+'.js'])
]);
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relativePath=pathname.startsWith(mount+'/') ? pathname.slice(mount.length) : null;
  const file=runtimeFiles.get(relativePath);
  if(req.method!=='GET' || !file){res.writeHead(404);res.end();return;}
  try {
    const body=await readFile(resolve(root,file));
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.ico')?'image/x-icon':file.endsWith('.jpg')?'image/jpeg':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
  } catch {res.writeHead(500);res.end('Cannot read test asset');}
});
try {
  await run(['--test',...logicTests]);
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  const testURL='http://127.0.0.1:'+server.address().port+mount+'/?section=dish';
  console.log('Browser checks use an isolated local server:',testURL);
  const artifacts=process.env.KITCHEN_TEST_ARTIFACT_ROOT||await mkdtemp(resolve(tmpdir(),'kitchen-three-themes-'));
  console.log('Theme matrix artifacts:',artifacts);
  const selected=process.env.KITCHEN_TEST_THEME;
  const themes=selected?[selected]:['berry','graphite','sage'];
  if(themes.some(theme=>!['berry','graphite','sage'].includes(theme)))throw Error('Unknown test theme.');
  const suites=['browser','products-list.browser','library-lists.browser','packaging.browser','task8.browser','two-photos.browser','card-modes.browser','profitability.browser','compact-print.browser','folders.browser','safe-json-merge.browser','import-transaction.browser','interface-controls.browser',...(glass?[]:['warm-theme.browser'])];
  const results=await Promise.allSettled(themes.map(async theme=>{
    const folder=resolve(artifacts,theme),temporary=resolve(folder,'tmp');await mkdir(temporary,{recursive:true});
    const env={...process.env,KITCHEN_TEST_URL:testURL,KITCHEN_TEST_THEME:theme,KITCHEN_TEST_ARTIFACT_DIR:folder,TMPDIR:temporary};
    const suiteFailures=[];
    for(const suite of suites){try{await run(['tests/'+suite+'.test.js'],env);}catch(error){suiteFailures.push(error);console.error('SUITE_FAILURE',theme,suite,error.message);}}
    if(suiteFailures.length)throw Error(suiteFailures.map(error=>error.message).join('\n'));
    console.log('THEME_MATRIX_PASS',theme);
  }));
  const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  async function common(args,env){try{await run(args,env);}catch(error){failures.push(error);}}
  if(!glass)await common(['tests/appearance.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL,KITCHEN_TEST_THEME:'',KITCHEN_TEST_ARTIFACT_DIR:resolve(artifacts,'appearance')});
  await common(['tests/establishment-expenses.browser.test.js'],{...process.env,KITCHEN_TEST_URL:testURL,KITCHEN_TEST_THEME:'',KITCHEN_TEST_ARTIFACT_DIR:resolve(artifacts,'expenses')});
  await common(['tests/preview-persistence.browser.test.js'],{...process.env,KITCHEN_TEST_THEME:'',KITCHEN_TEST_ARTIFACT_DIR:resolve(artifacts,'persistence')});
  if(failures.length)throw Error(failures.map(error=>error.message).join('\n'));
} catch(error){console.error(error.message);process.exitCode=1;}
finally {await new Promise(done=>server.close(done));}
