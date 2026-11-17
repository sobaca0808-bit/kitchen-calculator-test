'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync,spawn}=require('node:child_process');
(async()=>{
  const source=process.env.UNIFIED_SOURCE;if(!/^[a-f0-9]{40}$/.test(source))throw Error('Exact source required');
  const root=path.resolve(__dirname,'../..'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-release-live-'));
  try{
    for(const name of ['tests/sintez-intro.browser.test.js','tests/sintez-home.browser.test.js','tests/helpers/runtime-server.js','tests/helpers/design-fixture.js','tests/helpers/release-storage-guard.js']){
      const file=path.join(temp,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,execFileSync('git',['-C',root,'show',source+':'+name]));
    }
    const url='https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-release/';
    const keys={book:'kitchen-calculator-sintez-preview-v1',drafts:'kitchen-calculator-sintez-drafts-v1',photos:'kitchen-calculator-sintez-photos-v1',backups:'kitchen-calculator-sintez-import-backups-v1',appearance:'kitchen-calculator-sintez-appearance-v1'};
    for(const suite of ['sintez-intro','sintez-home'])await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[path.join(temp,'tests/'+suite+'.browser.test.js')],{stdio:'inherit',env:{...process.env,KITCHEN_INTRO_URL:url,KITCHEN_SINTEZ_URL:url,KITCHEN_SINTEZ_KEYS:JSON.stringify(keys)}});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error('Public '+suite+' checks failed: '+code)));
    });
  }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
