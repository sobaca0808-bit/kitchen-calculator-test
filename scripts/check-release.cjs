'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {start}=require('../tests/helpers/runtime-server');
const LIVE='https://sobaca0808-bit.github.io/kitchen-calculator-test/';
const keys={book:'kitchen-calculator-pr2-browser-test-v1',drafts:'kitchen-calculator-pr2-browser-drafts-v1',photos:'kitchen-calculator-test-photos-v1',backups:'kitchen-calculator-test-import-backups-v1',appearance:'kitchen-calculator-appearance-test-v1'};
let server,temporary;
function run(file,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Release browser checks failed: '+code)));});}
(async()=>{
 const root=path.resolve(__dirname,'..'),output=process.env.KITCHEN_RELEASE_ARTIFACTS||path.join(os.tmpdir(),'kitchen-release-proof');await fs.mkdir(output,{recursive:true});
 if(!process.env.KITCHEN_RELEASE_URL){assert(process.env.KITCHEN_RELEASE_RUNTIME_ROOT);server=await start(process.env.KITCHEN_RELEASE_RUNTIME_ROOT);}
 const url=process.env.KITCHEN_RELEASE_URL||server.url;assert(['127.0.0.1','localhost'].includes(new URL(url).hostname)||url===LIVE);
 temporary=await fs.mkdtemp(path.join(os.tmpdir(),'release-published-qa-'));
 for(const file of ['tests/establishment-expenses.browser.test.js','tests/helpers/runtime-server.js']){
  let text=await fs.readFile(path.join(root,file),'utf8');
  if(file.endsWith('establishment-expenses.browser.test.js')){const old="url==='https://sobaca0808-bit.github.io/kitchen-calculator-test/expense-toggle/'";assert.equal(text.split(old).length,2);text=text.replace(old,old+"||url==='"+LIVE+"'");}
  const target=path.join(temporary,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);
 }
 await run(path.join(temporary,'tests/establishment-expenses.browser.test.js'),{...process.env,KITCHEN_TEST_URL:url,KITCHEN_TEST_ARTIFACT_DIR:path.join(output,'expenses'),KITCHEN_EXPENSES_NAMESPACE_JSON:JSON.stringify(keys)});
 const helpers=path.join(temporary,'tests/helpers');let helper=await fs.readFile(path.join(root,'tests/helpers/persistence-lifecycle.js'),'utf8');
 const old="target.href==='https://sobaca0808-bit.github.io/kitchen-calculator-test/preview/'";assert.equal(helper.split(old).length,2);helper=helper.replace(old,"target.href==='"+LIVE+"'");await fs.writeFile(path.join(helpers,'persistence-lifecycle.js'),helper);
 await fs.copyFile(path.join(root,'tests/helpers/release-persistence-worker.js'),path.join(helpers,'persistence-worker.js'));await fs.copyFile(path.join(root,'tests/helpers/release-storage-guard.js'),path.join(helpers,'release-storage-guard.js'));
 const {lifecycle}=require(path.join(helpers,'persistence-lifecycle.js')),proof=[];
 for(const theme of ['berry','graphite','sage'])for(const width of [1366,390]){
  const folder=path.join(output,'lifecycle',theme+'-'+width);await fs.mkdir(folder,{recursive:true});
  const result=await lifecycle({url,keys,width,cycles:3,output:folder,theme,expectInitialEmpty:true,expectStaleProtection:true,downloadPolicy:process.env.KITCHEN_RELEASE_DOWNLOAD_POLICY||'all',launch:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}});
  assert(result.foreignStorageAccessBlocked);assert.deepEqual(result.foreignStorageViolations,[]);assert(!result.wroteInitialDatabase);proof.push(result);await fs.writeFile(path.join(output,'lifecycle-proof.json'),JSON.stringify(proof,null,2)+'\n');
  console.log('PASS RELEASE lifecycle:',theme,width,'three full Chrome starts; JSON, photos, drafts and no foreign storage access');
 }
 console.log('PASS RELEASE:',url,'25 expense scenarios and 6 full lifecycle scenarios');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(temporary)await fs.rm(temporary,{recursive:true,force:true});await server?.close();});
