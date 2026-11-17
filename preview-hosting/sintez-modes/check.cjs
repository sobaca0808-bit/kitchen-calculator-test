'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync,spawn}=require('node:child_process');
(async()=>{
  const source=process.env.MODES_SOURCE;if(!/^[a-f0-9]{40}$/.test(source))throw Error('Exact checked source required');
  const root=path.resolve(__dirname,'../..'),folder=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-modes-live-'));
  try{
    for(const name of ['tests/sintez-modes.browser.test.js','tests/helpers/runtime-server.js','tests/helpers/design-fixture.js','tests/helpers/release-storage-guard.js','tests/helpers/persistence-lifecycle.js']){
      const file=path.join(folder,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,execFileSync('git',['-C',root,'show',source+':'+name]));
    }
    await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(folder,'tests/sintez-modes.browser.test.js')],{stdio:'inherit',env:{...process.env,SINTEZ_MODES_URL:'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-modes/'}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Public mode checks failed: '+code)));});
  }finally{await fs.rm(folder,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
