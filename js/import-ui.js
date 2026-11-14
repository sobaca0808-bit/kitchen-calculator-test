(function(root) {
  'use strict';
  const S=root.KitchenStorage, Photos=root.KitchenPhotos, Merge=root.KitchenJSONMerge;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={products:'Продукты',product:'Продукт',packaging:'Упаковка',folders:'Папки',folder:'Папка',prep:'Полуфабрикат',dish:'Блюдо',recipes:'Рецепты',extension:'Дополнительное поле'};
  function mount({getState,canStart,setBusy,onApplied,message,getDraftSource=()=>null}) {
    const $=selector=>document.querySelector(selector), service=root.KitchenImportTransaction.create();
    const panel=$('#import-panel');let preview=null,version=0,applying=false,planning=false;
    function source(){return localStorage.getItem(S.KEY);}
    function download(text,name) {
      const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    async function refreshBackups(quiet=false) {
      try {
        const items=await service.listBackups();
        $('#import-backups').hidden=!items.length;
        $('#import-backup-select').innerHTML=items.map(item=>`<option value="${esc(item.id)}">${esc(new Date(item.createdAt).toLocaleString('ru-RU'))} · ${item.mode==='replace'?'до замены':'до объединения'}</option>`).join('');
        $('#download-import-backup').disabled=!items.length;
        if(items.length)$('#import-backup-status').textContent='Копия содержит сохранённую базу и фотографии до применения. Здесь хранятся до трёх последних копий; скачайте нужную на устройство.';
      } catch(error) {if(!quiet)message('Не удалось открыть резервные копии: '+error.message,true);}
    }
    $('#download-import-backup').addEventListener('click',async()=>{
      if(applying)return;
      try {
        const backup=await service.getBackup($('#import-backup-select').value);
        if(!backup)throw Error('Копия не найдена.');
        download(backup.text || S.stringify(backup.data),'kitchen-test-before-import-'+new Date(backup.createdAt).toISOString().replace(/[:.]/g,'-')+'.json');
        message('Резервная копия до импорта подготовлена к скачиванию.');
      } catch(error) {message('Не удалось скачать копию: '+error.message,true);}
    });
    function close(text='Импорт отменён. Основная база не записана.') {
      if(applying)return;
      version++;preview=null;planning=false;panel.hidden=true;panel.setAttribute('aria-busy','false');
      $('#import-mode').disabled=false;setBusy(false);message(text);$('#import').focus();
    }
    $('#import-cancel').addEventListener('click',()=>close());
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!applying){event.preventDefault();close();}});
    function readable(value) {
      let nodes=0;
      function visit(item,depth=0) {
        if(++nodes>1500||depth>20)return '[Сокращённый просмотр большого поля]';
        if(typeof item==='string')return item.length>2000?item.slice(0,2000)+'… [всего '+item.length+' символов]':item;
        if(Array.isArray(item))return item.slice(0,60).map(value=>visit(value,depth+1)).concat(item.length>60?['… ещё '+(item.length-60)+' элементов']:[]);
        if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,value])=>[key,key==='dataUrl'?'[Данные фотографии, '+String(value).length+' символов]':visit(value,depth+1)]));
        return item;
      }
      return JSON.stringify(visit(value),null,2) ?? 'Отсутствует';
    }
    const choiceLabel=value=>({local:'Оставить текущую · пропустить импортированную',both:'Сохранить обе версии',incoming:'Взять значение из файла'}[value]||value);
    function render(plan) {
      const counts=plan.changes;
      $('#import-error').textContent=(plan.errors||[]).join(' ');
      $('#import-summary').innerHTML=[['added','Будет добавлено'],['updated','Будет обновлено'],['skipped','Будет пропущено'],['conflicts','Конфликтов'],['removed','Будет удалено']].map(([key,label])=>`<div><span>${label}</span><strong>${esc(counts[key]||0)}</strong></div>`).join('');
      $('#import-replace-warning').hidden=preview.mode!=='replace';
      $('#import-conflicts').innerHTML=(plan.conflicts||[]).map(conflict=>{
        const options=conflict.options||['local','both'];
        return `<section class="import-conflict" data-conflict-key="${esc(conflict.key)}"><h3>${esc(labels[conflict.kind]||conflict.kind)}: ${esc(conflict.name||conflict.id||conflict.key)}</h3><p>${esc(conflict.reason)}</p><label>Решение<select data-conflict-choice="${esc(conflict.key)}"><option value="">Выберите действие…</option>${options.map(value=>`<option value="${esc(value)}" ${conflict.choice===value?'selected':''}>${esc(choiceLabel(value))}</option>`).join('')}</select></label><details><summary>Сравнить содержимое</summary><p class="field-help">Большие поля показаны сокращённо, данные фото — без длинной строки изображения. Сам файл обрабатывается полностью.</p><div class="import-comparison"><div><h4>Текущая версия</h4><pre>${esc(readable(conflict.local))}</pre></div><div><h4>Из файла</h4><pre>${esc(readable(conflict.incoming))}</pre></div></div></details></section>`;
      }).join('');
      $('#import-warnings').innerHTML=(plan.warnings||[]).map(warning=>`<li>${esc(typeof warning==='string'?warning:warning.text)}</li>`).join('');
      $('#import-warnings').hidden=!(plan.warnings||[]).length;
      const rows=plan.rows||[];
      $('#import-details').innerHTML=rows.slice(0,200).map(row=>`<li>${esc(labels[row.kind]||row.kind)} · ${esc(row.name||row.id)} — ${esc({added:'добавить',updated:'обновить',skipped:'пропустить',removed:'удалить'}[row.action]||row.action)}${row.reason?' · '+esc(row.reason):''}</li>`).join('')+(rows.length>200?`<li>Ещё ${rows.length-200} позиций. Итоги выше учитывают весь файл.</li>`:'');
      panel.querySelectorAll('[data-conflict-choice]').forEach(select=>select.addEventListener('change',()=>{
        if(!preview||applying)return;
        preview.choices[select.dataset.conflictChoice]=select.value;draw();
      }));
      $('#import-apply').disabled=!plan.ready || !(counts.added||counts.updated||counts.removed||preview.mode==='replace');
      $('#import-progress').textContent=(plan.errors||[]).length?'Применение заблокировано. Измените решения по конфликтам или отмените просмотр.':!plan.ready?'Выберите решение для каждого конфликта.':$('#import-apply').disabled?'Новых изменений нет: файл уже есть в этой базе.':'Проверьте итог. Перед записью автоматически создастся резервная копия с фотографиями.';
    }
    async function draw() {
      if(!preview||applying)return;
      const current=preview,token=++version;planning=true;
      panel.setAttribute('aria-busy','true');$('#import-apply').disabled=true;$('#import-error').textContent='';
      $('#import-progress').textContent='Проверяем связи и считаем изменения…';
      try {
        const plan=await Merge.plan(current.portable,current.incoming,{mode:current.mode,choices:{...current.choices}});
        if(token!==version||preview!==current)return;
        current.plan=plan;render(plan);
      } catch(error) {
        if(token!==version||preview!==current)return;
        current.plan=null;$('#import-error').textContent='Предпросмотр не построен: '+error.message;$('#import-progress').textContent='Применение заблокировано. Основная база не записана.';
      } finally {if(token===version){planning=false;panel.setAttribute('aria-busy','false');}}
    }
    $('#import-mode').addEventListener('change',()=>{if(preview&&!applying){preview.mode=$('#import-mode').value;preview.choices={};draw();}});
    $('#import').addEventListener('click',()=>{$('#import-file').value='';$('#import-file').click();});
    $('#import-file').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file||preview||applying||!canStart())return;
      setBusy(true);panel.hidden=false;panel.setAttribute('aria-busy','true');planning=true;
      $('#import-apply').disabled=true;$('#import-mode').disabled=true;$('#import-mode').value='merge';$('#import-file-name').textContent=file.name;
      $('#import-conflicts').innerHTML='';$('#import-summary').innerHTML='';$('#import-details').innerHTML='';$('#import-warnings').hidden=true;$('#import-error').textContent='';$('#import-progress').textContent='Читаем файл и текущие фотографии…';$('#import-replace-warning').hidden=true;
      const token=++version;
      try {
        if(file.size>S.MAX_IMPORT_BYTES)throw Error('Файл больше 50 МБ.');
        const candidate=S.parseJSON(await file.text());
        const expectedSource=source(),current=S.validate(getState()),saved=S.load();
        if(saved.error||!saved.data||S.stringify(saved.data)!==S.stringify(current))throw Error('Текущая база изменилась или недоступна. Сохраните черновик и обновите страницу.');
        const portable=await Photos.exportData(current),incoming=await Photos.exportData(candidate);
        if(token!==version)return;
        if(source()!==expectedSource)throw Error('База изменилась в другой вкладке. Повторите просмотр после обновления страницы.');
        preview={source:expectedSource,current,portable,incoming,fileName:file.name,mode:'merge',choices:{},plan:null};
        $('#import-mode').disabled=false;
        await draw();
      } catch(error) {
        if(token!==version)return;
        preview=null;panel.hidden=true;$('#import-mode').disabled=false;setBusy(false);message('Импорт отменён: '+error.message+' Основная база не записана.',true);
      } finally {if(!preview&&token===version){planning=false;panel.setAttribute('aria-busy','false');}}
    });
    $('#import-apply').addEventListener('click',async()=>{
      const current=preview;
      if(!current?.plan?.ready||planning||applying||$('#import-apply').disabled)return;
      if(current.mode==='replace'&&!confirm('Заменить всю сохранённую базу данными из файла? Записи, которых нет в файле, исчезнут из основной базы. Перед записью обязательна резервная копия с фотографиями. Черновики останутся отдельно.'))return;
      applying=true;panel.setAttribute('aria-busy','true');$('#import-apply').disabled=true;$('#import-cancel').disabled=true;$('#import-mode').disabled=true;
      panel.querySelectorAll('[data-conflict-choice]').forEach(select=>select.disabled=true);
      $('#import-progress').textContent='Создаём резервную копию, затем применяем проверенные изменения…';
      let appliedResult=null;
      try {
        const result=await service.apply({candidate:current.plan.data,currentState:current.current,expectedSource:current.source,mode:current.mode,draftSource:getDraftSource()});
        appliedResult=result;
        onApplied(result.data);
        preview=null;panel.hidden=true;
        message(result.noOp?'Объединение выполнено: новых изменений нет, база не перезаписывалась.':current.mode==='replace'?'База заменена. Резервная копия до замены доступна ниже. Черновики сохранены отдельно.':'Объединение выполнено. Резервная копия до импорта доступна ниже. Черновики сохранены отдельно.');
      } catch(error) {
        $('#import-error').textContent=error.message;$('#import-progress').textContent='Применение отменено. Исходная база не перезаписана. Отмените просмотр и выберите файл заново.';
        current.plan=null;preview=null;panel.hidden=true;
        if(appliedResult)message((appliedResult.noOp?'Новых изменений нет, база не перезаписывалась.':'Данные уже сохранены; резервная копия до импорта осталась в браузере.')+' Не удалось обновить экран: '+error.message+' Обновите страницу, чтобы увидеть сохранённую базу.',true);
        else message('Импорт отменён: '+error.message+' Исходная база не перезаписана.',true);
      } finally {
        applying=false;panel.setAttribute('aria-busy','false');$('#import-cancel').disabled=false;$('#import-mode').disabled=false;
        if(!preview)setBusy(false);
        await refreshBackups(true);
      }
    });
    refreshBackups(true);
    return {close,refreshBackups};
  }
  root.KitchenImportUI={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
