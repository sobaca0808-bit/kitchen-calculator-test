'use strict';
async function guard(context,keys,violations){
 await context.exposeBinding('__releaseForbidden',(_,detail)=>violations.push(detail));
 await context.addInitScript(keys=>{
  const get=Storage.prototype.getItem;window.__releaseRead=key=>get.call(localStorage,key);
  const allowed=[keys.book,keys.drafts,keys.appearance,...(keys.extraLocal||[])];
  const fail=detail=>{window.__releaseForbidden(detail);throw Error('Forbidden release storage access: '+detail);};
  for(const method of ['getItem','setItem','removeItem','clear']){
   const native=Storage.prototype[method];Storage.prototype[method]=function(...args){
    if(method==='clear'||!(allowed.includes(args[0]) || method==='getItem' && keys.readOnly?.includes(args[0])))fail(method+':'+args[0]);return native.apply(this,args);
   };
  }
  for(const method of ['open','deleteDatabase']){
   const native=IDBFactory.prototype[method];IDBFactory.prototype[method]=function(name,...args){
    if(method==='deleteDatabase'||![keys.photos,keys.backups].includes(name))fail(method+':'+name);return native.apply(this,[name,...args]);
   };
  }
 },keys);
}
module.exports={guard};
