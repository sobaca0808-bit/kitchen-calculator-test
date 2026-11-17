/* Test-only bootstrap. It seeds one separate UI preference, never recipe data. */
const KEY='kitchen-calculator-appearance-test-v1';
const specs={
 berry:{paper:'rgb(255, 253, 249)',field:'rgb(255, 254, 253)',art:'watercolor-kitchen.webp'},
 graphite:{paper:'rgb(37, 52, 63)',field:'rgb(27, 41, 51)',art:'graphite-kitchen.webp'},
 sage:{paper:'rgb(255, 253, 247)',field:'rgb(254, 255, 251)',art:'sage-kitchen.webp'}
};
const theme=Object.hasOwn(specs,process.env.KITCHEN_TEST_THEME)?process.env.KITCHEN_TEST_THEME:'berry';
async function seed(context){
 if(theme==='berry'&&process.env.KITCHEN_GLASS_TEST!=='1')return context;
 await context.addInitScript(({key,theme})=>{try{if(['http:','https:'].includes(location.protocol)&&localStorage.getItem(key)===null)localStorage.setItem(key,theme);}catch(_){}},{key:KEY,theme});
 return context;
}
if(process.env.KITCHEN_TEST_THEME){
 const {chromium}=require('playwright');const launch=chromium.launch.bind(chromium),persistent=chromium.launchPersistentContext.bind(chromium);
 chromium.launch=async(...args)=>{const browser=await launch(...args),create=browser.newContext.bind(browser);browser.newContext=async(...args)=>seed(await create(...args));return browser;};
 chromium.launchPersistentContext=async(...args)=>seed(await persistent(...args));
}
module.exports={KEY,theme,spec:specs[theme],specs};
