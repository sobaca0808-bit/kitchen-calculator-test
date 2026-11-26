(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(root,node?require('./storage.js'):root.KitchenStorage,node?require('./drafts.js'):root.KitchenDrafts,node?require('./photos.js'):root.KitchenPhotos);
  if(node)module.exports=api;else root.KitchenPersistenceDiagnostics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root,S,D,Photos){
  'use strict';
  // These are read-only source descriptors, not migrations or replacement keys.
  // The five active storage constants remain in their original modules.
  function namespaces(){
    const all=[
      {id:'current',key:S.KEY,draftKey:D.KEY,photoDB:Photos.DB_NAME,label:'Текущий калькулятор'},
      {id:'preview',key:'kitchen-calculator-preview-v1',draftKey:'kitchen-calculator-preview-drafts-v1',photoDB:'kitchen-calculator-preview-photos-v1',label:'Отдельный адрес /preview/'},
      {id:'test-root',key:'kitchen-calculator-pr2-browser-test-v1',draftKey:'kitchen-calculator-pr2-browser-drafts-v1',photoDB:'kitchen-calculator-test-photos-v1',label:'Корень тестового сайта / прежний общий источник'},
      {id:'production',key:'kitchen-calculator-v1',draftKey:'kitchen-calculator-drafts-v1',photoDB:'kitchen-calculator-photos-v1',label:'Отдельный рабочий источник'}
    ],seen=new Set();
    return all.filter(source=>!seen.has(source.key)&&seen.add(source.key));
  }
  function inspect(storage){
    return namespaces().map(meta=>{
      const source={...meta,raw:undefined,draftRaw:undefined,data:null,error:null,draftCount:0,draftError:null};
      try{
        const target=storage===undefined?root.localStorage:storage;
        source.raw=target.getItem(meta.key);source.draftRaw=target.getItem(meta.draftKey);
        if(source.raw!==null)try{source.data=S.parseJSON(source.raw);}catch(error){source.error=error.message;}
        const drafts=D.load({getItem:()=>source.draftRaw});source.draftCount=drafts.items.length;source.draftError=drafts.error;
      }catch(error){source.error='Хранилище недоступно: '+error.message;}
      return source;
    });
  }
  function unchanged(source,storage){
    const target=storage===undefined?root.localStorage:storage;
    if(source.raw===undefined||target.getItem(source.key)!==source.raw)throw Error('Выбранный источник изменился. Откройте диагностику заново и проверьте его.');
  }
  function readPhoto(database,id){
    return new Promise((resolve,reject)=>{
      let request,settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(Error('Не удалось открыть фотографии выбранного источника.')),8000);
      try{request=root.indexedDB.open(database);}catch(error){finish(error);return;}
      request.onupgradeneeded=()=>request.transaction.abort();
      request.onerror=()=>finish(Error('Хранилище фотографий этого источника отсутствует или недоступно. Исходные данные не изменены.'));
      request.onsuccess=()=>{
        const db=request.result;if(settled){db.close();return;}
        let tx,read;
        try{tx=db.transaction('photos','readonly');read=tx.objectStore('photos').get(id);}catch(error){db.close();finish(error);return;}
        tx.oncomplete=()=>{db.close();const record=read.result;finish(record?.blob?null:Error('Фотография не найдена: '+id),record);};
        tx.onabort=tx.onerror=()=>{db.close();finish(tx.error||Error('Ошибка чтения фотографии.'));};
      };
    });
  }
  async function portable(source,{storage,photos=Photos,read=readPhoto}={}){
    if(!source.data)throw Error(source.error||'В источнике нет сохранённой базы.');
    unchanged(source,storage);
    const data=await photos.exportData(source.data,id=>read(source.photoDB,id));
    unchanged(source,storage);return data;
  }
  function mount({missing,failed,openImport,message}){
    const $=selector=>root.document.querySelector(selector),help=$('#storage-help'),panel=$('#storage-diagnostics');
    if(!help||!panel)return;
    const explicit=root.location.hash==='#storage-diagnostics';help.hidden=!(missing||failed||explicit);
    let sources=[],busy=false;
    function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),link=root.document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    function render(){
      const host=$('#storage-sources');host.replaceChildren();
      for(const source of sources){
        const article=root.document.createElement('section');article.className='import-conflict';article.dataset.storageSource=source.id;
        const heading=root.document.createElement('h3');heading.textContent=source.label;article.append(heading);
        const key=root.document.createElement('p');key.className='import-file-name';key.textContent=source.key;article.append(key);
        const counts=root.document.createElement('p');counts.textContent=source.error||!source.data?'Запись: '+(source.error||'отсутствует'):`Продуктов: ${source.data.products.length} · Полуфабрикатов: ${source.data.recipes.filter(r=>r.type==='prep').length} · Блюд: ${source.data.recipes.filter(r=>r.type==='dish').length} · Папок: ${(source.data.folders||[]).length} · Упаковки: ${(source.data.packaging||[]).length}`;article.append(counts);
        if(source.data){const examples=root.document.createElement('p');examples.className='field-help';examples.textContent='Примеры: '+source.data.products.slice(0,3).map(p=>p.name+(['home','chef'].includes(root.document.documentElement.dataset.sintezWorkspaceMode)?'':' — '+(p.price===null?'нет цены':p.price+' ₽'))).join('; ')+'. Рецепты: '+source.data.recipes.slice(0,4).map(r=>r.name).join('; ');article.append(examples);}
        const draftNote=root.document.createElement('p');draftNote.className='field-help';draftNote.textContent='Черновики: '+source.draftCount+(source.draftError?' · '+source.draftError:'')+'. Черновики остаются в исходном хранилище и не входят в обычный экспорт карточек.';article.append(draftNote);
        const actions=root.document.createElement('div');actions.className='import-backup-actions';
        function button(label,action,disabled,kind){const el=root.document.createElement('button');el.type='button';el.textContent=label;el.disabled=disabled;el.dataset.diagnosticAction=kind;el.onclick=action;actions.append(el);}
        button('Скачать исходный JSON',()=>download(source.raw,'kitchen-source-'+source.id+'-'+Date.now()+'.json'),typeof source.raw!=='string','raw');
        button('Скачать черновики',()=>download(source.draftRaw,'kitchen-source-drafts-'+source.id+'-'+Date.now()+'.json'),typeof source.draftRaw!=='string','drafts');
        const run=action=>async()=>{
          if(busy)return;busy=true;panel.setAttribute('aria-busy','true');for(const el of panel.querySelectorAll('button'))el.disabled=true;
          try{await action();}catch(error){message('Действие отменено: '+error.message+' Ни один источник не очищен.',true);}
          finally{busy=false;panel.setAttribute('aria-busy','false');render();$('#storage-diagnostics-close').disabled=false;$('#storage-diagnostics-refresh').disabled=false;}
        };
        button('Скачать JSON с фото',run(async()=>{download(S.stringify(await portable(source)),'kitchen-source-photos-'+source.id+'-'+Date.now()+'.json');message('JSON сохранённых карточек и фотографий подготовлен. Черновики скачиваются отдельно.');}),!source.data,'photos');
        button('Открыть проверку объединения',run(async()=>{
          if(source.id==='current')throw Error('Это уже активная база. Для другого файла используйте обычный «Импорт JSON».');
          const candidate=await portable(source),opened=await openImport(candidate,source.label,()=>unchanged(source));
          if(opened){panel.hidden=true;message('Открыта проверка объединения. Источник остаётся прежним; изменения применятся только вашей кнопкой и после резервного копирования.');}
        }),!source.data||source.id==='current','merge');
        article.append(actions);host.append(article);
      }
    }
    function open(){if(busy)return;sources=inspect();render();panel.hidden=false;$('#storage-context').textContent='Адрес: '+root.location.origin+root.location.pathname+'. Активный ключ: '+S.KEY;$('#storage-diagnostics-title').focus({preventScroll:true});}
    $('#storage-diagnostics-open').onclick=open;$('#storage-diagnostics-refresh').onclick=open;
    $('#storage-diagnostics-close').onclick=()=>{if(!busy){panel.hidden=true;$('#storage-diagnostics-open').focus();}};
    root.addEventListener('hashchange',()=>{if(root.location.hash==='#storage-diagnostics'){help.hidden=false;open();}});
    if(explicit)open();
  }
  return {namespaces,inspect,unchanged,readPhoto,portable,mount};
});
