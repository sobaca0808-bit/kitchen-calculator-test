'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright'),{lifecycle,PREVIEW}=require('../tests/helpers/persistence-lifecycle.js');
const URL='https://sobaca0808-bit.github.io/kitchen-calculator-test/',SOURCE='04c98fb20444859454fc18fd6f3d6e0429818f8b',BASE='63443c53d2c7a99060584d54eae0e9c779475405';
const output=process.env.KITCHEN_AUDIT_OUTPUT||'/tmp/kitchen-issue21-live';
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
async function get(file){const response=await fetch(URL+file);assert.equal(response.status,200,file);return Buffer.from(await response.arrayBuffer());}
(async()=>{
 await fs.mkdir(output,{recursive:true});const checks=[];
 const manifest=JSON.parse(await get('preview/preview-version.json'));assert.equal(manifest.source_commit,SOURCE);assert.equal(manifest.pull_request,20);assert.deepEqual(manifest.storage_namespace,Object.values(PREVIEW));
 const previewChecks=await Promise.all(Object.entries(manifest.files).map(async([file,expected])=>{
  const data=await get('preview/'+file),source=execFileSync('git',['show',SOURCE+':'+file]);assert.equal(sha(data),expected.sha256,file);assert.equal(sha(source),expected.source_sha256,file);return {path:'preview/'+file,sha256:sha(data),sourceSha256:sha(source)};
 }));checks.push(...previewChecks);
 const html=execFileSync('git',['show',BASE+':index.html']).toString(),files=new Set(['index.html',...Array.from(html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)/g),m=>m[1])]);
 for(const file of [...files].filter(f=>f.endsWith('.css'))){const css=execFileSync('git',['show',BASE+':'+file]).toString();for(const match of css.matchAll(/url\(["']?([^"')]+)/g))files.add(path.posix.join(path.posix.dirname(file),match[1]));}
 checks.push(...await Promise.all([...files].map(async file=>{const data=await get(file),source=execFileSync('git',['show',BASE+':'+file]);assert.equal(sha(data),sha(source),file);return {path:file,sha256:sha(data)};})));
 await fs.writeFile(path.join(output,'published-version.json'),JSON.stringify({sourceCommit:SOURCE,rootCommit:BASE,manifest,httpsFileChecks:checks},null,2)+'\n');
 const results=[];
 for(const width of [1366,390]){
  const report=await lifecycle({chromium,url:URL+'preview/',rootURL:URL,width,cycles:3,output,launch:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']}});
  results.push(report);console.log('PASS published preview: three complete Chrome starts at '+width+'px, without fixture seeding or repeated import. Initial demo write: '+report.wroteInitialDatabase);
 }
 await fs.writeFile(path.join(output,'published-lifecycle.json'),JSON.stringify(results,null,2)+'\n');console.log('HTTPS bytes verified:',checks.length,'source:',SOURCE);
})().catch(error=>{console.error(error);process.exitCode=1;});
