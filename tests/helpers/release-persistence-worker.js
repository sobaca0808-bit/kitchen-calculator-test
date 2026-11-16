'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require('playwright'),{runCycle}=require('./persistence-lifecycle.js'),{guard}=require('./release-storage-guard.js');
(async()=>{
 const request=JSON.parse(await fs.readFile(process.argv[2],'utf8')),violations=[];
 const guarded={launchPersistentContext:async(...args)=>{const context=await chromium.launchPersistentContext(...args);await guard(context,request.keys,violations);return context;}};
 const result=await runCycle({...request,chromium:guarded});assert.deepEqual(violations,[]);
 result.report.foreignStorageAccessBlocked=true;result.report.foreignStorageViolations=violations;
 await fs.writeFile(process.argv[3],JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
