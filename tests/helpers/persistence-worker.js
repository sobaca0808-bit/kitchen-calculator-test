'use strict';
if(process.env.KITCHEN_UNIFIED_TEST==='1')require('./unified-navigation').bootstrap();
const fs=require('node:fs/promises'),{chromium}=require('playwright'),{runCycle}=require('./persistence-lifecycle.js');
(async()=>{
 const request=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
 const result=await runCycle({...request,chromium});
 await fs.writeFile(process.argv[3],JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
