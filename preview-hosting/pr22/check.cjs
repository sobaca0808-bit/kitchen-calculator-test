'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const SOURCE='1a68adffd2046b758b683af3b516adf944081149';
const LIVE='https://sobaca0808-bit.github.io/kitchen-calculator-test/pr-22/';
const keys={book:'kitchen-calculator-pr22-preview-v1',drafts:'kitchen-calculator-pr22-drafts-v1',photos:'kitchen-calculator-pr22-photos-v1',backups:'kitchen-calculator-pr22-import-backups-v1',appearance:'kitchen-calculator-pr22-appearance-v1'};
(async()=>{
 const url=process.env.PR22_URL||LIVE,target=new URL(url);assert(['127.0.0.1','localhost'].includes(target.hostname)||target.href===LIVE);
 const root=path.resolve(__dirname,'../..'),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'pr22-lifecycle-'));
 const output=process.env.PR22_ARTIFACTS||path.join(os.tmpdir(),'pr22-published-proof');await fs.mkdir(output,{recursive:true});
 try{
  let helper=execFileSync('git',['-C',root,'show',SOURCE+':tests/helpers/persistence-lifecycle.js']).toString();
  const old="target.href==='https://sobaca0808-bit.github.io/kitchen-calculator-test/preview/'";
  assert.equal(helper.split(old).length,2);helper=helper.replace(old,"target.href==='"+LIVE+"'");
  await fs.writeFile(path.join(temporary,'persistence-lifecycle.js'),helper);
  await fs.copyFile(path.join(__dirname,'worker.cjs'),path.join(temporary,'persistence-worker.js'));
  const {lifecycle}=require(path.join(temporary,'persistence-lifecycle.js')),proof=[];
  const themes=process.env.PR22_CHECK_THEMES?process.env.PR22_CHECK_THEMES.split(','):['berry','graphite','sage'];
  const widths=process.env.PR22_CHECK_WIDTHS?process.env.PR22_CHECK_WIDTHS.split(',').map(Number):[1366,390];
  assert(themes.length&&themes.every(t=>['berry','graphite','sage'].includes(t)));assert(widths.length&&widths.every(w=>[1366,390].includes(w)));
  for(const theme of themes)for(const width of widths){
   const folder=path.join(output,theme+'-'+width);await fs.mkdir(folder,{recursive:true});
   const report=await lifecycle({url,keys,width,cycles:3,output:folder,theme,expectInitialEmpty:true,expectStaleProtection:true,
    downloadPolicy:process.env.PR22_DOWNLOAD_POLICY||'all',launch:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}});
   assert(report.foreignStorageAccessBlocked);assert.deepEqual(report.foreignStorageViolations,[]);assert.equal(report.wroteInitialDatabase,false);
   proof.push(report);await fs.writeFile(path.join(output,'browser-proof.json'),JSON.stringify(proof,null,2)+'\n');
   console.log('PASS PR22 published isolated persistence:',theme,width,'three full Chrome starts; JSON, prices, folders, photos, drafts and stale-tab protection');
  }
  console.log('PASS PR22 link:',url,proof.length,'scenarios,',proof.length*3,'full Chrome starts');
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
