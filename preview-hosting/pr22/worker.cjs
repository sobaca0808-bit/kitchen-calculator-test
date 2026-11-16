'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require('playwright'),{runCycle}=require('./persistence-lifecycle.js');
(async()=>{
 const request=JSON.parse(await fs.readFile(process.argv[2],'utf8')),violations=[];
 const guarded={launchPersistentContext:async(...args)=>{
  const context=await chromium.launchPersistentContext(...args);
  await context.exposeBinding('__pr22Forbidden',(_,detail)=>violations.push(detail));
  await context.addInitScript(keys=>{
   const allowed=[keys.book,keys.drafts,keys.appearance];
   const fail=detail=>{window.__pr22Forbidden(detail);throw Error('Forbidden PR22 storage access: '+detail);};
   for(const method of ['getItem','setItem','removeItem','clear']){
    const native=Storage.prototype[method];Storage.prototype[method]=function(...args){
     if(method==='clear'||!allowed.includes(args[0]))fail(method+':'+args[0]);return native.apply(this,args);
    };
   }
   for(const method of ['open','deleteDatabase']){
    const native=IDBFactory.prototype[method];IDBFactory.prototype[method]=function(name,...args){
     if(method==='deleteDatabase'||![keys.photos,keys.backups].includes(name))fail(method+':'+name);return native.apply(this,[name,...args]);
    };
   }
  },request.keys);
  return context;
 }};
 const result=await runCycle({...request,chromium:guarded});assert.deepEqual(violations,[]);
 result.report.foreignStorageAccessBlocked=true;result.report.foreignStorageViolations=violations;
 await fs.writeFile(process.argv[3],JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
