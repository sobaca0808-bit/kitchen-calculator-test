'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
function run(file,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Published PWA check failed: '+code)));});}
(async()=>{
 const root=path.resolve(__dirname,'../..'),source=process.env.PWA_SOURCE;assert(/^[a-f0-9]{40}$/.test(source));
 const output=process.env.PWA_ARTIFACTS;assert(output);await fs.mkdir(output,{recursive:true});
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'pwa-live-checks-'));
 try{
  const files=['tests/pwa.browser.test.js','tests/pwa-install.browser.test.js','tests/establishment-expenses.browser.test.js','tests/helpers/pwa-server.js','tests/helpers/release-storage-guard.js','tests/helpers/runtime-server.js'];
  for(const name of files){const target=path.join(temporary,name);await fs.mkdir(path.dirname(target),{recursive:true});let text=execFileSync('git',['-C',root,'show',source+':'+name]).toString();if(name.endsWith('establishment-expenses.browser.test.js')){const old="url==='https://sobaca0808-bit.github.io/kitchen-calculator-test/expense-toggle/'";assert.equal(text.split(old).length,2);text=text.replace(old,old+"||url==='https://sobaca0808-bit.github.io/kitchen-calculator-test/pwa/'");}await fs.writeFile(target,text);}
  const url='https://sobaca0808-bit.github.io/kitchen-calculator-test/pwa/';
  await run(path.join(temporary,'tests/pwa.browser.test.js'),{...process.env,KITCHEN_PWA_URL:url,KITCHEN_PWA_HEADFUL:'1',KITCHEN_PWA_ARTIFACTS:path.join(output,'offline')});
  await run(path.join(temporary,'tests/pwa-install.browser.test.js'),{...process.env,KITCHEN_PWA_URL:url,KITCHEN_PWA_HEADFUL:'1',KITCHEN_PWA_ARTIFACTS:path.join(output,'installation')});
  await run(path.join(temporary,'tests/establishment-expenses.browser.test.js'),{...process.env,KITCHEN_TEST_URL:url,KITCHEN_TEST_ARTIFACT_DIR:path.join(output,'calculator'),KITCHEN_EXPENSES_NAMESPACE_JSON:JSON.stringify({book:'kitchen-calculator-pwa-preview-v1',drafts:'kitchen-calculator-pwa-drafts-v1',photos:'kitchen-calculator-pwa-photos-v1',backups:'kitchen-calculator-pwa-import-backups-v1',appearance:'kitchen-calculator-pwa-appearance-v1'})});
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
