'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync,spawn}=require('node:child_process');
(async()=>{
 const source=process.env.CLASSIC_SOURCE;if(!/^[a-f0-9]{40}$/.test(source))throw Error('Exact checked source required');
 const root=path.resolve(__dirname,'../..'),folder=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-classic-live-'));
 try{
  for(const name of ['tests/classic-polish.browser.test.js','tests/classic-glass.browser.test.js','tests/home-cookbook.browser.test.js','tests/unified-workspace.browser.test.js','tests/fixtures/risotto.webp','tests/helpers/runtime-server.js','tests/helpers/unified-fixture.js','tests/helpers/release-storage-guard.js','tests/helpers/persistence-lifecycle.js']){
   const file=path.join(folder,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,execFileSync('git',['-C',root,'show',source+':'+name]));
  }
  for(const suite of ['classic-polish','classic-glass','home-cookbook','unified-workspace'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(folder,'tests/'+suite+'.browser.test.js')],{stdio:'inherit',env:{...process.env,CLASSIC_POLISH_FILTER:'',CLASSIC_GLASS_FILTER:'',CLASSIC_GLASS_URL:'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-classic/',HOME_COOKBOOK_FILTER:'',SINTEZ_UNIFIED_FILTER:'',HOME_COOKBOOK_URL:'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-classic/',SINTEZ_UNIFIED_URL:'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-classic/'}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Public unified checks failed: '+code)));});
 }finally{await fs.rm(folder,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
