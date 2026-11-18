'use strict';
// Adapt the OLD component scenarios to real new navigation. This never alters
// app styles, data, visibility, or JS: it clicks Settings, menu and disclosures.
// The dedicated workspace suite does not load this adapter and checks the UI as-is.
const installed=new WeakSet(),preparing=new WeakSet();let patched=false;
function install(context){
  if(installed.has(context))return context;installed.add(context);
  function dialogs(p){if(p.listenerCount('dialog')===0)p.on('dialog',d=>{if(p.listenerCount('dialog')!==1)return;if(/^Есть несохранённые изменения\./.test(d.message()))d.accept();else d.dismiss();});}
  function page(p){
    dialogs(p);
    if(patched)return;patched=true;
    const prototype=Object.getPrototypeOf(p.locator('html')),click=prototype.click;
    async function ensure(locator){
      const p=locator.page();dialogs(p);if(preparing.has(p)||await locator.count()!==1||await locator.isVisible())return;
      if(!await p.locator('html[data-sintez-unified]').count())return;
      preparing.add(p);
      try{
        const info=await locator.evaluate(el=>({id:el.id,settings:!!el.closest('#sintez-settings'),work:!!el.closest('#unified-content'),menu:!!el.closest('#unified-menu'),business:!!el.closest('#packaging-editor,.selling-price-editor')||el.matches('[data-tab=packaging],[data-tab=expenses]'),palette:!!el.closest('#appearance-panel')}));
        if(info.business&&await p.locator('html').getAttribute('data-sintez-workspace-mode')!=='business')await click.call(p.locator('[data-sintez-mode=business]'));
        if(info.settings&&await p.locator('html').getAttribute('data-sintez-screen')!=='settings')await click.call(p.locator('.sintez-header [data-sintez-route=settings]'));
        if(info.work&&await p.locator('html').getAttribute('data-sintez-screen')==='settings')await click.call(p.locator('#sintez-settings [data-sintez-home]'));
        if(info.palette&&await p.locator('#appearance-panel').isHidden())await click.call(p.locator('#appearance-toggle'));
        if(info.menu&&await p.locator('#unified-sidebar').isHidden())await click.call(p.locator('#unified-menu-toggle'));
        const details=locator.locator('xpath=ancestor::details[contains(@class,"unified-card-options")][not(@open)][1]');
        if(await details.count())await click.call(details.locator(':scope > summary'));
      }finally{preparing.delete(p);}
    }
    for(const method of ['click','fill','check','selectOption','focus']){const original=prototype[method];prototype[method]=async function(...args){await ensure(this);return original.apply(this,args);};}
  }
  context.on('page',page);for(const p of context.pages())page(p);return context;
}
module.exports={install};
