'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
  const proof=JSON.parse(await fs.readFile(process.env.SINTEZ_RELEASE_PROOF,'utf8'));
  for(const [kind,url,keys,seen] of [
    ['web','https://sobaca0808-bit.github.io/kitchen-calculator-test/',proof.root_storage_names,'kitchen-calculator-presentation-seen-v1'],
    ['pwa','https://sobaca0808-bit.github.io/kitchen-calculator-test/pwa/',proof.pwa_storage_names,'kitchen-calculator-pwa-presentation-seen-v1']
  ]) for(const suite of ['sintez-intro','sintez-home']) await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tests/'+suite+'.browser.test.js'],{stdio:'inherit',env:{...process.env,KITCHEN_INTRO_URL:url,KITCHEN_SINTEZ_URL:url,KITCHEN_SINTEZ_KEYS:JSON.stringify(keys),KITCHEN_INTRO_SEEN_KEY:seen,KITCHEN_INTRO_ARTIFACTS:path.join(process.env.SINTEZ_RELEASE_ARTIFACTS,kind,'intro'),KITCHEN_SINTEZ_ARTIFACTS:path.join(process.env.SINTEZ_RELEASE_ARTIFACTS,kind,'home')}});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(kind+' '+suite+' failed: '+code)));
  });
})().catch(error=>{console.error(error);process.exitCode=1;});
