(function () {
  'use strict';
  const C = KitchenCalc, S = KitchenStorage, F = KitchenFolders, P = KitchenPackaging, D = KitchenDrafts, Photos = KitchenPhotos;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const rubles = new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2});
  const money = n => !Number.isFinite(n) ? 'Значение слишком велико' : rubles.format(n);
  const formatters = new Map();
  function num(n, digits = 3) {
    if (n == null) return '';
    if (!formatters.has(digits)) formatters.set(digits,new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,useGrouping:false}));
    return formatters.get(digits).format(n);
  }
  const unitOptions = selected => Object.entries(C.units).map(([value,u]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${u.label}</option>`).join('');
  const loaded = S.snapshot();
  let persistedSource=loaded.source;
  // An absent record must remain absent until an explicit save or confirmed import.
  let state = loaded.data || S.empty();
  let recoveryRequired = !!loaded.error;
  let section = 'dish', selectedId = state.recipes.find(r => r.type === 'dish')?.id || null;
  let viewing = true, viewPortions = 1, cardMode = 'calculation';
  let expenseEditor=null, expensePrintDetail='summary';
  const ExpensePreferences=KitchenRecipeExpensePreferences;
  const Home=globalThis.KitchenWorkspacePolicy;
  const unified=document.documentElement.hasAttribute('data-sintez-unified');
  let workspaceMode=unified?Home.initial(location.href):null;
  const isHomeMode=()=>workspaceMode==='home';
  const isBusinessMode=()=>!unified||Home.business(workspaceMode);
  const hideMoney=()=>unified&&!isBusinessMode();
  const isProfessionalMode=()=>!unified||Home.professional(workspaceMode);
  if(unified)document.documentElement.dataset.sintezWorkspaceMode=workspaceMode;
  let folderFilter = 'all', folderFormId = null,favoritesOnly=false;
  const selectedFolderId = () => folderFilter.startsWith('folder:') ? folderFilter.slice(7) : null;
  const printPhotoChoices = {chef:'both',calculation:'both',home:'both'};
  let draft = null, dirty = false, isNew = false, errors = new Map(), invalidValues = new Map(), storageBlocked = !!loaded.error;
  const editor = $('#editor');
  KitchenEditorActions.mount(editor);
  let packagingEditor = null;
  let photoEditor = null, photoPreview = null, draftTimer = null, draftStatus = '', restoring = false;
  const unusedPhotos = new Set();
  const isCatalog = () => section === 'products' || section === 'packaging';
  const editingRecipe = () => draft && !isCatalog() && !(section === 'dish' && viewing);

  function message(text, error = false) {
    const el = $('#message'); el.textContent = text; el.className = error ? 'error' : ''; el.hidden = false;
  }
  function clearMissingStorageHelp(){
    const help=$('#storage-help');if(help&&location.hash!=='#storage-diagnostics')help.hidden=true;
  }
  function persist(candidate, success, restore = false, syncPackaging=true) {
    if (recoveryRequired && !restore) {message('Сохранение заблокировано: исходное хранилище не удалось прочитать. Восстановите резервную копию через импорт JSON. Исходные данные не изменены.',true);return false;}
    let prepared;
    try {
      prepared = S.prepareSave(candidate);
      if(section!=='expenses' && syncPackaging) {
        const linked=P.resolveLinks(prepared.data);
        if(linked!==prepared.data) prepared=S.prepareSave(linked);
      }
    } catch(e) { message(e.message, true); return false; }
    const result = prepared.commit(undefined,persistedSource);
    if (!result.ok) {
      storageBlocked = true;
      message(result.commitUncertain?result.error+' Поля остаются на экране. После экспорта проверьте базу при повторном открытии.':'Не удалось сохранить в браузере: ' + result.error + ' Изменения пока в памяти. Скачайте экспорт JSON до закрытия страницы.', true);
      return false;
    } else { state=prepared.data;persistedSource=prepared.source;recoveryRequired = false; storageBlocked = false;clearMissingStorageHelp();message(success || 'Данные сохранены в этом браузере.'); }
    return true;
  }
  const vueLibrary = globalThis.KitchenVueLibrary;
  let indexState, index;
  function libraryIndex() {
    if (state !== indexState) {
      index = vueLibrary.index(state);
      indexState = state;
    }
    return index;
  }
  function collection() {
    if (vueLibrary) return libraryIndex().sections[section] || [];
    return isCatalog() ? (state[section] || []) : state.recipes.filter(r => r.type === section);
  }
  function folderOptions(selected = '') {
    return '<option value="">Без папки</option>' + (state.folders || []).map(folder=>`<option value="${esc(folder.id)}" ${folder.id === selected ? 'selected' : ''}>${esc(folder.name)}</option>`).join('');
  }
  function folderActionAllowed() {
    if(backupBusy || photoEditor?.busy) {message('Дождитесь завершения обработки фотографии или резервной копии.',true);return false;}
    if(recoveryRequired || storageBlocked) {message('Операция с папкой недоступна: основная база не сохранена в браузере. Сначала сохраните данные или восстановите их через импорт JSON.',true);return false;}
    return true;
  }
  function persistFolders(candidate, success) {
    if(!folderActionAllowed()) return false;
    let prepared;
    try {
      const latest = S.snapshot();
      if(latest.error || latest.source!==persistedSource || S.stringify(latest.data||S.empty()) !== S.stringify(state)) {
        message('База в браузере изменилась или недоступна. Операция с папкой отменена, чтобы не перезаписать другие изменения. Сохраните текущую работу в черновик и обновите страницу.',true);return false;
      }
      prepared = S.prepareSave(candidate);
    } catch(error) {message(error.message,true);return false;}
    const result = prepared.commit(undefined,persistedSource);
    if(!result.ok) {
      if(result.commitUncertain){storageBlocked=true;message(result.error+' Результат изменения папки нужно проверить после повторного открытия.',true);}
      else message('Изменения папок не сохранены: '+result.error+' Прежняя база и рецепты не изменены.',true);
      return false;
    }
    state = prepared.data;persistedSource=prepared.source;clearMissingStorageHelp();message(success);return true;
  }
  // Update just the folder fields: raw input, photo work and other draft fields stay intact.
  function refreshFolderFields() {
    const detached = draft?.type === 'dish' && draft.folderId && !(state.folders || []).some(folder=>folder.id === draft.folderId);
    if(detached) delete draft.folderId;
    const field = $('#recipe-folder');
    if(field) {field.innerHTML = folderOptions(draft?.folderId);field.value = draft?.folderId || '';}
    const move = $('#move-folder');
    if(move) {move.innerHTML = folderOptions(draft?.folderId);move.value = draft?.folderId || '';$('#move-recipe').disabled = true;}
    if(detached && editingRecipe()) markDirty();
  }
  function renderFolders(query) {
    const host = $('#folder-tools');host.hidden = section !== 'dish';
    $('#library-search').placeholder = section === 'dish' ? 'Найти во всех блюдах…' : 'Найти в разделе…';
    if(section !== 'dish') {$('#folder-form').hidden = true;folderFormId = null;return;}
    const folders = state.folders || [];
    let total = 0, unfiled = 0, counts;
    if (vueLibrary) {
      const book = libraryIndex();
      counts = book.folderCounts; total = book.sections.dish.length; unfiled = book.unfiled;
    } else {
      counts = new Map();
      for (const recipe of state.recipes) if (recipe.type === 'dish') {
        total++; if (recipe.folderId) counts.set(recipe.folderId,(counts.get(recipe.folderId) || 0)+1); else unfiled++;
      }
    }
    if(!['all','unfiled'].includes(folderFilter) && !folders.some(folder=>folder.id === selectedFolderId())) folderFilter = 'all';
    if (vueLibrary) vueLibrary.folders($('#folder-filter'), folders, counts, total, unfiled);
    else $('#folder-filter').innerHTML = `<option value="all">Все блюда (${total})</option><option value="unfiled">Без папки (${unfiled})</option>` + folders.map(folder=>`<option value="folder:${esc(folder.id)}">${esc(folder.name)} (${counts.get(folder.id) || 0})</option>`).join('');
    $('#folder-filter').value = folderFilter;
    const selected = folders.some(folder=>folder.id === selectedFolderId());
    $('#folder-rename').disabled = !selected;$('#folder-delete').disabled = !selected;
    const hint = $('#folder-search-status');hint.hidden = !query;
    hint.textContent = query ? 'Поиск по всем блюдам. Очистите поиск, чтобы вернуться к выбранной папке.' : '';
  }
  function showFolderForm(id = null) {
    if(!folderActionAllowed()) return;
    folderFormId = id;
    $('#folder-form').hidden = false;$('#folder-error').hidden = true;
    $('#folder-name').value = id ? (state.folders || []).find(folder=>folder.id === id)?.name || '' : '';
    $('#folder-submit').textContent = id ? 'Сохранить имя' : 'Создать';$('#folder-name').focus();
  }
  function currentState() {
    const next = {...state};
    if(section==='expenses'&&expenseEditor)Object.assign(next,expenseEditor.candidate(next));
    if (draft) {
      const key = isCatalog() ? section : 'recipes';
      next[key] = [...(state[key] || [])];
      const index = next[key].findIndex(item => item.id === draft.id);
      if (index < 0) next[key].push(draft); else next[key][index] = draft;
    }
    return next;
  }
  function setDraftStatus(text, failed = false) {
    draftStatus = text;
    const el = $('#draft-status');
    if (el) { el.textContent = text; el.classList.toggle('inline-error',failed); }
  }
  function releaseUnusedPhotos() {
    if (storageBlocked || !unusedPhotos.size) return;
    const savedDrafts = D.load(), savedDatabase=S.load();
    if (savedDrafts.error || savedDatabase.error) return;
    for (const id of unusedPhotos) {
      if (state.recipes.some(r=>Photos.ids(r).includes(id)) || savedDatabase.data?.recipes.some(r=>Photos.ids(r).includes(id)) || savedDrafts.items.some(r=>Photos.ids(r.data).includes(id)) || Photos.ids(draft).includes(id)) continue;
      unusedPhotos.delete(id);
      Photos.remove(id).catch(()=>message('Не удалось удалить прежнюю фотографию из браузера. Основная база сохранена.',true));
    }
  }
  function flushDraft() {
    clearTimeout(draftTimer); draftTimer = null;
    if (!editingRecipe() || !dirty) return true;
    const record = {
      id:draft.id,type:section,isNew,data:clone(draft),updatedAt:Date.now(),
      invalidValues:[...invalidValues],errors:[...errors],
      formValues:[...editor.querySelectorAll('input[id],select[id],textarea[id]')].filter(el=>el.type!=='file' && !el.readOnly).map(el=>({id:el.id,value:el.value,...(el.type==='checkbox'?{checked:el.checked}:{})})),
      details:[...editor.querySelectorAll('details')].map((el,index)=>({index,open:el.open}))
    };
    const result = D.save(record);
    setDraftStatus(result.ok ? 'Черновик сохранён' : 'Черновик не сохранён: '+result.error,!result.ok);
    if (result.ok) releaseUnusedPhotos();
    renderDrafts();
    return result.ok;
  }
  $('#back-drafts').addEventListener('click',()=>{
    const panel=$('#drafts-disclosure');panel.open=false;panel.querySelector('summary').focus();
  });
  function renderDrafts() {
    const host = $('#drafts-panel'), result = D.load();
    $('#drafts-disclosure .classic-disclosure-count').textContent=String(result.items.length);
    host.hidden = false;
    if (vueLibrary) {
      vueLibrary.drafts(host, result.items.sort((a,b)=>b.updatedAt-a.updatedAt), result.error,
        editingRecipe() ? draft.id : null, section, restoreDraft, discardDraft);
      return;
    }
    if (result.error) { host.innerHTML = '<p class="inline-error">Не удалось прочитать черновики: '+esc(result.error)+' Исходная запись не изменена.</p>';return; }
    host.innerHTML = '<h2>Незавершённые рецепты</h2><p>Восстановите работу или удалите ненужный черновик. Сохранённые карточки не изменены.</p><div class="draft-list">'+result.items.sort((a,b)=>b.updatedAt-a.updatedAt).map(record=>{
      const active = editingRecipe() && draft.id===record.id && section===record.type;
      return `<div class="draft-entry"><div><strong>${esc(record.data.name || 'Без названия')}</strong><small>${record.type==='prep'?'Полуфабрикат':'Блюдо'} · ${esc(new Date(record.updatedAt).toLocaleString('ru-RU'))}</small></div><button data-restore-draft="${esc(record.id)}" data-type="${record.type}" ${active?'disabled':''}>${active?'Открыт':'Восстановить'}</button><button class="danger" data-delete-draft="${esc(record.id)}" data-type="${record.type}">Удалить черновик</button></div>`;
    }).join('')+'</div>';
    host.querySelectorAll('[data-restore-draft]').forEach(btn=>btn.addEventListener('click',()=>restoreDraft(btn.dataset.restoreDraft,btn.dataset.type)));
    host.querySelectorAll('[data-delete-draft]').forEach(btn=>btn.addEventListener('click',()=>discardDraft(btn.dataset.deleteDraft,btn.dataset.type)));
  }
  function restoreDraft(id,type) {
    if (!canLeave()) return;
    const result = D.load(), record = result.items.find(r=>r.id===id && r.type===type);
    if (result.error || !record) { message('Черновик недоступен. '+(result.error||''),true);return; }
    const owner=[...state.products,...(state.packaging||[]),...(state.folders||[]),...state.recipes,...state.recipes.flatMap(recipe=>[...recipe.ingredients,...(recipe.packaging||[])])].find(item=>item.id===id);
    if(owner && (!state.recipes.includes(owner) || owner.type!==type)) {
      message('Черновик не открыт: после переноса его ID занят записью другого типа. Черновик и сохранённая база не изменены. Для восстановления используйте копию базы до импорта.',true);return;
    }
    if(owner && record.isNew && !confirm('Этот черновик создавался как новый рецепт, но в базе уже есть запись с тем же ID. Восстановить для редактирования? Последующее нажатие «Сохранить» заменит её содержимое.'))return;
    try {
      clearTimeout(draftTimer); section=type;selectedId=id;viewing=false;
      draft=ExpensePreferences.restorePreference(clone(record.data),state.recipes.find(r=>r.id===id));isNew=record.isNew || !state.recipes.some(r=>r.id===id);dirty=true;
      const missingFolder = type === 'dish' && draft.folderId && !(state.folders || []).some(folder=>folder.id === draft.folderId);
      if(missingFolder) delete draft.folderId;
      errors=new Map(record.errors);invalidValues=new Map(record.invalidValues);draftStatus='Черновик восстановлен · нажмите «Сохранить» для изменения карточки';
      $('#library-search').value='';restoring=true;renderLibrary();renderEditor();
      for (const field of record.formValues) {
        const el=document.getElementById(field.id);
        if (!el || !editor.contains(el) || el.type==='file' || el.readOnly) continue;
        if(field.id === 'recipe-folder') continue; // The recipe data is authoritative, including deleted-folder recovery.
        el.value=field.value;if(el.type==='checkbox')el.checked=field.checked;
        // The packaging module keeps invalid raw values separately from its recipe data.
        if (field.id.startsWith('pack-qty-')) el.dispatchEvent(new Event('input',{bubbles:true}));
      }
      for (const item of record.details) {const el=editor.querySelectorAll('details')[item.index];if(el)el.open=item.open;}
      for (const [key,text] of errors) {const el=document.getElementById(key);if(el && el.setCustomValidity){el.setCustomValidity(text);el.setAttribute('aria-invalid','true');}}
      updateRecipeSummary();restoring=false;renderDrafts();$('#drafts-disclosure').open=false;$('#item-name').focus();
      message('Черновик восстановлен. '+(missingFolder ? 'Прежняя папка больше не существует: выбран раздел «Без папки». ' : '')+'Основная карточка изменится только после нажатия «Сохранить».');
    } catch(error) {
      restoring=false;dirty=false;selectedId=state.recipes.some(r=>r.id===id)?id:null;openSelected();
      message('Не удалось открыть черновик: '+error.message+' Черновик и сохранённая база не изменены.',true);
    }
  }
  function discardDraft(id,type) {
    if(backupBusy) {message('Дождитесь завершения работы с резервной копией.',true);return;}
    if (!confirm('Удалить этот черновик? Незавершённые изменения будут потеряны. Сохранённая карточка останется.')) return;
    const result=D.load(), record=result.items.find(r=>r.id===id && r.type===type);
    const active=editingRecipe() && draft.id===id && section===type;
    if (active && photoEditor?.busy) {message('Дождитесь обработки фотографии.',true);return;}
    const removed=D.remove(id,type);
    if (!removed.ok) {message('Не удалось удалить черновик: '+removed.error,true);return;}
    Photos.ids(record?.data).filter(Boolean).forEach(id=>unusedPhotos.add(id));
    if(active) {clearTimeout(draftTimer);dirty=false;selectedId=state.recipes.some(r=>r.id===id)?id:null;openSelected();}
    renderDrafts();releaseUnusedPhotos();
  }
  function canLeave() {
    if(backupBusy) {message('Дождитесь завершения работы с резервной копией.',true);return false;}
    if (photoEditor?.busy) {message('Дождитесь обработки фотографии перед переходом.',true);return false;}
    if (!dirty) return true;
    if (editingRecipe() && flushDraft()) return true;
    return confirm('Есть несохранённые изменения. '+(editingRecipe()?'Не удалось сохранить черновик. ':'')+'Перейти и отменить их?');
  }
  function leaveEditorSafely() {
    if(backupBusy||photoEditor?.busy)return canLeave();
    return editingRecipe()&&dirty ? flushDraft() : canLeave();
  }
  function markDirty() {
    dirty = true; const button = $('#save-item'); if(button) {button.textContent = 'Сохранить';button.classList.remove('saved');} const el = $('#save-state'); if (el) el.textContent = 'Не сохранено';
    if(editingRecipe() && !restoring) {setDraftStatus('Сохраняем черновик…');clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,400);}
  }
  function numeric(input, options = {}) {
    try {
      const value = C.parseNumber(input.value);
      if (value !== null && options.positive && value <= 0) throw Error('Значение должно быть больше нуля.');
      if (value !== null && options.max != null && value > options.max) throw Error('Значение должно быть не больше ' + options.max + '.');
      input.setCustomValidity(''); input.removeAttribute('aria-invalid'); errors.delete(input.id); invalidValues.delete(input.id);
      return {ok:true,value};
    } catch(e) {
      input.setCustomValidity(e.message); input.setAttribute('aria-invalid','true'); errors.set(input.id,e.message); invalidValues.set(input.id,input.value);
      return {ok:false,value:null};
    }
  }
  function numericInput(id, value, placeholder = 'Не задано') {
    return `<input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${esc(invalidValues.has(id) ? invalidValues.get(id) : num(value,8))}" placeholder="${placeholder}">`;
  }
  let renderedList, preparedState, preparedCosts=new Map(), preparedLookup;
  function selectLibraryRow(list) {
    if (vueLibrary) {
      vueLibrary.rows(list, renderedList.model, selectedId);
      return;
    }
    const previous=list.querySelector('[aria-current=true]');
    const current=selectedId ? list.querySelector('[data-open="'+CSS.escape(selectedId)+'"]') : null;
    if(previous===current)return;
    if(previous){previous.classList.remove('active');previous.setAttribute('aria-current','false');}
    if(current){current.classList.add('active');current.setAttribute('aria-current','true');}
  }
  function renderLibrary() {
    const labels = {dish:['Мои рецепты','Новое блюдо'],prep:['Полуфабрикаты','Новый полуфабрикат'],products:['Продукты','Новый продукт'],packaging:['Упаковка и фасовка','Новая позиция']};
    $('.workspace').dataset.section = section;
    $('.workspace').classList.add('compact-library');
    const libraryList = $('#library-list');
    libraryList.classList.add('compact-list');
    libraryList.setAttribute('role','region');
    libraryList.setAttribute('aria-labelledby','section-title');
    libraryList.tabIndex = 0;
    $('.workspace-library').hidden=section==='expenses';
    $('#drafts-disclosure').hidden=section!=='dish'&&section!=='prep';
    if(!renderedList||renderedList.state!==state||renderedList.section!==section){
      const counts={dish:0,prep:0,products:state.products.length,packaging:(state.packaging||[]).length};
      if (vueLibrary) {
        counts.dish=libraryIndex().sections.dish.length;
        counts.prep=libraryIndex().sections.prep.length;
      } else for(const recipe of state.recipes) counts[recipe.type]++;
      for(const key of Object.keys(counts)){
        $(`#count-${key}`).textContent=counts[key];
        $(`[data-tab="${key}"]`).setAttribute('aria-current',section===key?'page':'false');
      }
      $('[data-tab="expenses"]')?.setAttribute('aria-current',section==='expenses'?'page':'false');
    }
    if(section==='expenses')return;
    $('#section-title').textContent = labels[section][0]; $('#create').textContent = '+ ' + labels[section][1];
    const query = $('#library-search').value.toLocaleLowerCase('ru').trim();
    const signature=JSON.stringify([section,query,folderFilter,favoritesOnly,workspaceMode]);
    if(renderedList?.state===state&&renderedList.signature===signature){selectLibraryRow(libraryList);return;}
    renderFolders(query);
    renderedList={state,section,signature:JSON.stringify([section,query,folderFilter,favoritesOnly,workspaceMode])};
    if(preparedState!==state){preparedState=state;preparedLookup=null;preparedCosts.clear();}
    const source = vueLibrary ? libraryIndex().search(section, query) : collection().filter(item =>
      (item.name+' '+(item.aliases || '')).toLocaleLowerCase('ru').includes(query));
    const favoriteFilter = favoritesOnly && section === 'dish';
    const filterFolder = section === 'dish' && !query && folderFilter !== 'all';
    const folderId = selectedFolderId();
    const list = favoriteFilter || filterFolder ? source.filter(item =>
      (!favoriteFilter || Home.favorite(item)) && (!filterFolder || (folderFilter === 'unfiled' ? !item.folderId : item.folderId === folderId))) : source;
    const folderNames = new Map((state.folders || []).map(folder=>[folder.id,folder.name]));
    function captionFor(item) {
      let caption;
      if (hideMoney()) {
        caption=section==='products'?(C.units[item.unit]?.label||'Продукт'):section==='prep'?(item.actualYield==null?'Выход не задан':'Выход: '+num(item.actualYield)+' г'):(query&&folderNames.size?folderNames.get(item.folderId)||'Без папки':'Рецепт');
      } else if (isCatalog()) {
        const base = section === 'packaging' ? P.basePrice(item) : C.productBasePrice(item);
        const units = section === 'packaging' ? P.units : C.units;
        caption = base.value == null ? 'Нет цены' : money(base.value) + ' / ' + units[base.unit].label;
      } else if(section === 'dish') {
        caption = query && folderNames.size ? folderNames.get(item.folderId) || 'Без папки' : isHomeMode()?'Рецепт':'Техкарта';
      } else {
        if(!preparedCosts.has(item.id)){
          const result=C.calcRecipe(state,item.id,preparedLookup??=C.createRecipeLookup(state));
          preparedCosts.set(item.id,result.complete?money(result.knownCost)+' / партия':'Неполная калькуляция');
        }
        caption=preparedCosts.get(item.id);
      }
      return caption;
    }
    if (vueLibrary) {
      renderedList.model = {items:list, section, caption:captionFor};
      vueLibrary.rows(libraryList, renderedList.model, selectedId);
      return;
    }
    libraryList.innerHTML = list.length ? list.map(item => {
      const caption = captionFor(item);
      return `<button title="${esc(item.name)}" class="library-item library-row ${section === 'products' ? 'product-row' : ''} ${item.id === selectedId ? 'active' : ''}" data-open="${esc(item.id)}" aria-current="${item.id === selectedId ? 'true' : 'false'}"><strong>${esc(item.name)}</strong><small>${esc(caption)}</small></button>`;
    }).join('') : '<p class="field-help">Ничего не найдено. Создайте новую запись.</p>';
  }
  $('#library-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-open]');
    if(!button||!canLeave())return;
    selectedId=button.dataset.open;openSelected();
    $('#library-list [data-open="'+CSS.escape(selectedId)+'"]')?.focus({preventScroll:true});
  });
  function openSelected() {
    clearTimeout(draftTimer); draftTimer=null;draftStatus='';
    draft = clone((vueLibrary ? libraryIndex().byId.get(selectedId) : collection().find(item => item.id === selectedId)) || null);
    viewing = section === 'dish'; viewPortions = draft?.portions || 1;
    dirty = false; isNew = false; errors.clear();invalidValues.clear(); renderLibrary(); renderEditor();renderDrafts();releaseUnusedPhotos();
  }
  function switchSection(next) {
    if(unified&&!Home.allowed(next,workspaceMode))return false;
    if (next === section) return true;
    if (!canLeave()) return false;
    section = next; $('#library-search').value = ''; selectedId = collection()[0]?.id || null; openSelected();return true;
  }
  const vueEditors=globalThis.KitchenVueEditors;
  function editorContext(badge,description){
    return {badge,description,draft,catalog:isCatalog(),dish:section==='dish',unified,hideMoney:hideMoney(),
      stateText:dirty?'Не сохранено':storageBlocked?'В памяти · скачайте JSON':'Сохранено в браузере',
      draftStatus,folders:state.folders||[],units:section==='packaging'?P.units:C.units,cookingMinutes:Home?.minutes(draft),
      numericText:(id,value)=>invalidValues.has(id)?invalidValues.get(id):num(value,8)};
  }
  function renderEditor() {
    expenseEditor?.dispose?.();
    if(vueEditors){
      for(const child of editor.querySelectorAll('#recipe-card,#ingredients'))vueEditors.dispose(child);
      vueEditors.dispose(editor);
      editor.replaceChildren();
    }
    photoEditor?.dispose();photoEditor=null;photoPreview?.dispose();photoPreview=null;
    packagingEditor = null;
    expenseEditor=null;
    if(section==='expenses'){
      expenseEditor=KitchenExpensesUI.mount(editor,{config:state.establishmentExpenses,getConfig:()=>state.establishmentExpenses,getJournal:()=>state.financialJournal,onChange:markDirty,onSave:saveDraft,onReset:()=>{dirty=false;},onSwitch:()=>{if(!canLeave())return false;dirty=false;return true;}});return;
    }
    if (!draft && vueEditors) {
      vueEditors.empty(editor,section==='dish'&&collection().length?'Выберите рецепт из списка':'Начните с новой записи');return;
    }
    if (!draft) { editor.innerHTML = `<div class="empty-state"><h2>${section === 'dish' && collection().length ? 'Выберите рецепт из списка' : 'Начните с новой записи'}</h2><p>Откройте сохранённую запись или создайте новую<br>кнопкой в справочнике.</p></div>`; return; }
    if (section === 'dish' && viewing) renderCard();
    else if (section === 'products') renderProduct(); else if (section === 'packaging') renderPackaging(); else renderRecipe();
  }
  function renderCard() {
    editor.innerHTML = `<div class="card-controls"><button id="back-list">← Назад</button><div class="review-card-actions"><button id="edit-recipe" class="green-action">Изменить</button><button id="portions-recipe" class="green-action" aria-controls="recipe-options" aria-expanded="false">Порции</button><button id="print-recipe" class="green-action">Печать</button></div><label data-finance-only>Форма карты<select id="card-mode"><option value="calculation" ${cardMode==='calculation'?'selected':''}>Калькуляционная карта</option><option value="chef" ${cardMode==='chef'?'selected':''}>Карта повара</option></select></label><label>Количество порций<input id="view-portions" type="text" inputmode="decimal" value="${esc(num(viewPortions,8))}"></label><label>Фотографии при печати<select id="print-photos"><option value="none">Без фотографий</option><option value="first">Только первая</option><option value="second">Только вторая</option><option value="both">Обе фотографии</option></select></label><p id="view-error" role="status"></p></div><article id="recipe-card" class="recipe-card"></article>`;
    const card=$('#recipe-card');
    const expensePrintControl=document.createElement('label');expensePrintControl.className='expense-print-control';expensePrintControl.setAttribute('data-professional-only','');
    expensePrintControl.innerHTML=`Статьи расходов при печати<select id="print-expense-detail"><option value="summary">Только итоги</option><option value="full">С детализацией</option></select><small>Без цен — форма «Карта повара».</small>`;
    $('.card-controls',editor).append(expensePrintControl);
    $('#print-expense-detail').value=expensePrintDetail;
    $('#print-expense-detail').addEventListener('change',event=>{expensePrintDetail=event.target.value;card.dataset.printExpenseDetail=expensePrintDetail;});
    const moveControls = document.createElement('div');moveControls.className = 'recipe-folder-move';
    moveControls.innerHTML = `<label>Папка блюда<select id="move-folder">${folderOptions(draft.folderId)}</select></label><button id="move-recipe" disabled>Переместить</button>`;
    $('.card-controls',editor).append(moveControls);$('#move-folder').value = draft.folderId || '';
    $('#move-folder').addEventListener('change',()=>{$('#move-recipe').disabled = $('#move-folder').value === (draft.folderId || '');});
    $('#move-recipe').addEventListener('click',()=>{
      try {
        const target = $('#move-folder').value;
        if(!persistFolders(F.move(state,draft.id,target),'Блюдо перемещено. Рецепт и фотографии сохранены.')) {refreshFolderFields();return;}
        draft = clone(state.recipes.find(recipe=>recipe.id === draft.id));
        refreshFolderFields();renderLibrary();
      } catch(error) {message(error.message,true);}
    });
    if(unified){
      const options=document.createElement('details');options.id='recipe-options';options.className='unified-card-options';options.innerHTML='<summary hidden>Порции и печать</summary><div class="unified-card-option-fields"><button class="review-options-back" type="button">← Назад</button></div>';
      const fields=options.lastElementChild;for(const label of [...$('.card-controls',editor).children])if(label.tagName==='LABEL'||label.classList.contains('recipe-folder-move'))fields.append(label);
      $('.card-controls',editor).append(options);
      const portions=$('#portions-recipe');
      function toggleOptions(open){
        options.open=open;
        if(open)$('#view-portions').focus();else portions.focus();
      }
      portions.onclick=()=>toggleOptions(!options.open);
      options.querySelector('.review-options-back').onclick=()=>toggleOptions(false);
      options.addEventListener('toggle',()=>portions.setAttribute('aria-expanded',String(options.open)));
      const caption=document.createElement('span');caption.className='unified-card-caption';caption.textContent='Рецепт';$('.card-controls',editor).prepend(caption);
    }
    let cardValid=false, readinessVersion=0;
    function updatePrintReadiness() {
      const version=++readinessVersion, selection=printPhotoChoices[hideMoney()?'home':cardMode];
      const selected=Photos.printSlots(selection), photoIds=Photos.ids(draft);
      card.dataset.printPhotos=selection;
      card.dataset.printHasPhotos=selected.some(index=>photoIds[index])?'yes':'no';
      $('#print-photos').value=selection;
      $('#print-recipe').disabled=true;
      if(!cardValid || !photoPreview)return;
      const gallery=photoPreview;
      $('#view-error').textContent='';
      gallery.readyFor(selection).then(()=>{
        if(version===readinessVersion && $('#recipe-card')===card && cardValid && photoPreview===gallery) $('#print-recipe').disabled=false;
      }).catch(error=>{
        if(version!==readinessVersion || $('#recipe-card')!==card || !cardValid)return;
        $('#view-error').textContent='Не удалось подготовить выбранные фотографии: '+error.message+' Выберите другой снимок или печать без фотографий.';
        $('#print-recipe').disabled=true;
      });
    }
    function draw() {
      readinessVersion++;cardValid=false;$('#print-recipe').disabled=true;
      try {
        viewPortions=C.parseNumber($('#view-portions').value);
        const model=KitchenRecipeCardModel.create(state,draft.id,viewPortions,hideMoney()?'chef':cardMode);
        // Both forms share the saved recipe and the same gallery. Presentation changes
        // neither recreate photo records nor alter their order or bytes.
        const galleryElement=$('#card-photos',card);
        const includeExpenses=isBusinessMode()&&ExpensePreferences.enabled(draft),expenseResult=cardMode==='calculation'&&includeExpenses?KitchenExpenses.calculate(state,draft.id,viewPortions):undefined;
        const options={expenseResult,includeExpenses,showcase:!unified&&document.documentElement.hasAttribute('data-sintez-showcase'),unified,home:isHomeMode(),showBusiness:isBusinessMode()};
        if(vueEditors&&unified)vueEditors.card(card,{state,model,options});
        else card.innerHTML=KitchenRecipeCardTemplates.render(state,model,options);
        card.querySelector('[data-showcase-edit]')?.addEventListener('click',()=>$('#edit-recipe').click());
        const photoEdit=card.querySelector('.unified-photo-edit');if(photoEdit)photoEdit.onclick=()=>{$('#edit-recipe').click();$('#photo-editor')?.scrollIntoView({block:'center'});};
        const favorite=card.querySelector('.favorite-recipe');if(favorite)favorite.onclick=()=>{const candidate=clone(state),recipe=candidate.recipes.find(r=>r.id===draft.id);if(Home.favorite(recipe))delete recipe.favorite;else recipe.favorite=true;if(persist(candidate,'Избранное сохранено.',false,false)){draft=clone(state.recipes.find(r=>r.id===draft.id));renderLibrary();draw();}};
        expensePrintControl.hidden=!isBusinessMode()||cardMode!=='calculation'||!includeExpenses;
        card.dataset.printExpenseDetail=expensePrintDetail;
        if(cardMode==='calculation'&&isBusinessMode()){
          $('#recipe-expense-control',card).innerHTML=KitchenExpensesUI.renderControl(state,draft.id,viewPortions,{enabled:includeExpenses,result:expenseResult});
          $('#include-establishment-expenses',card).addEventListener('change',event=>{
            const checked=event.target.checked;
            try{
              const candidate=ExpensePreferences.update(state,draft.id,checked);
              if(!persist(candidate,checked?'Расходы включены для этого блюда. Выбор сохранён.':'Расходы отключены для этого блюда. План расходов сохранён.',false,false)){event.target.checked=includeExpenses;return;}
              draft=clone(state.recipes.find(r=>r.id===draft.id));draw();$('#include-establishment-expenses',card).focus({preventScroll:true});
            }catch(error){event.target.checked=includeExpenses;message(error.message,true);}
          });
        }
        if(cardMode==='calculation'&&includeExpenses&&!(vueEditors&&unified)){
          const financial=card.querySelector('.profitability-card');
          (financial||card).insertAdjacentHTML(financial?'afterend':'beforeend',KitchenExpensesUI.renderCard(state,draft.id,viewPortions,{result:expenseResult,showBreakdown:false}));
        }
        card.querySelectorAll('.expenses-open').forEach(button=>button.onclick=()=>switchSection('expenses'));
        card.dataset.mode=model.mode;
        if(galleryElement && photoPreview) {const next=$('#card-photos',card);if(next!==galleryElement)next.replaceWith(galleryElement);}
        else {
          photoPreview=Photos.mountGallery($('#card-photos',card),model.view.recipe);
          photoPreview.ready.catch(()=>{}); // Each slot shows its own error; printing checks only selected slots.
        }
        card.hidden=false;cardValid=true;updatePrintReadiness();
      } catch(error) {card.hidden=true;$('#view-error').textContent=error.message;$('#print-recipe').disabled=true;}
    }
    $('#view-portions').addEventListener('input',draw);
    $('#card-mode').addEventListener('change',event=>{cardMode=event.target.value;draw();});
    $('#print-photos').addEventListener('change',event=>{printPhotoChoices[hideMoney()?'home':cardMode]=event.target.value;updatePrintReadiness();});
    $('#edit-recipe').addEventListener('click',()=>{viewing=false;renderEditor();});
    $('#back-list').addEventListener('click',()=>{selectedId=null;openSelected();$('#library-search').focus({preventScroll:true});});
    $('#print-recipe').addEventListener('click',()=>window.print());
    draw();
  }
  function head(type, description) {
    return `<div class="editor-head"><div class="editor-topline"><span class="badge">${type}</span><span class="save-state" id="save-state">${dirty ? 'Не сохранено' : storageBlocked ? 'В памяти · скачайте JSON' : 'Сохранено в браузере'}</span></div><label><span class="sr-only">Название</span><input id="item-name" class="name-input" value="${esc(draft.name)}" placeholder="Введите название" maxlength="300"></label><p class="intro">${description}</p>${!isCatalog()?`<p id="draft-status" class="draft-status" role="status" aria-live="polite">${esc(draftStatus || 'Черновик сохраняется автоматически. Карточка — по кнопке «Сохранить».')}</p>`:''}</div>`;
  }
  function actions(recipe) {
    return `<div class="form-actions">${recipe ? '<div id="mobile-summary" class="mobile-summary" aria-live="polite"></div>' : ''}<button id="view-recipe">← Назад</button>${recipe ? '<button id="add-row">+ Добавить продукт</button>' : ''}<button id="delete-item" class="danger">Удалить</button><button id="save-item" class="primary">Сохранить</button></div>`;
  }
  function bindCommon() {
    $('#item-name').addEventListener('input', e => { draft.name = e.target.value; markDirty(); });
    $('#save-item').addEventListener('click', saveDraft);
    $('#delete-item').addEventListener('click', deleteItem);
    $('#view-recipe')?.addEventListener('click', () => {
      if(!leaveEditorSafely())return;
      if(isNew||section!=='dish'){selectedId=null;openSelected();$('#library-search').focus({preventScroll:true});return;}
      openSelected();$('#edit-recipe')?.focus({preventScroll:true});
    });
  }
  function renderProduct() {
    const context=editorContext('Справочник продуктов',(hideMoney()?'Название, единица измерения и заметки для ваших рецептов.':'Закупочная цена относится ко всей упаковке. Пустая цена означает «Нет цены».'));
    if(vueEditors)vueEditors.form(editor,"product",context);
    else editor.innerHTML = head(context.badge,context.description) + `<div class="editor-content"><div class="product-grid">
      <label class="full">Другие слова для поиска<input id="aliases" value="${esc(draft.aliases)}" placeholder="Например, картошка, картошечка"></label>
      <label data-finance-only>Закупочная цена, ₽${numericInput('price',draft.price,'Нет цены')}</label>
      <label data-finance-only>Количество в упаковке${numericInput('packQuantity',draft.packQuantity)}</label>
      <label>${hideMoney()?'Единица продукта':'Единица упаковки'}<select id="product-unit">${unitOptions(draft.unit)}</select></label>
      </div><div id="base-price" class="base-price" data-finance-only></div>
      <details class="recipe-note"><summary>Масса штуки, коэффициент объёма и заметка</summary><div class="product-grid" style="margin-top:14px">
      <label>Масса одной штуки, г${numericInput('massPerPiece',draft.massPerPiece)}</label>
      <label>Коэффициент массы, г на 1 мл${numericInput('gramsPerMl',draft.gramsPerMl)}</label>
      <label class="full">Заметка<textarea id="product-note">${esc(draft.note)}</textarea></label></div><p class="field-help">Объём не переводится в массу без вашего коэффициента. Масса штуки нужна для подсчёта веса, например, булочки.</p></details><p id="form-error" class="inline-error" role="status"></p></div>` + actions(false);
    bindCommon();
    $('#aliases').addEventListener('input',e => {draft.aliases = e.target.value;markDirty();});
    $('#product-note').addEventListener('input',e => {draft.note = e.target.value;markDirty();});
    $('#product-unit').addEventListener('change',e => {draft.unit = e.target.value;markDirty();updateProductSummary();});
    for (const key of ['price','packQuantity','massPerPiece','gramsPerMl']) {
      $('#'+key).addEventListener('input',e => {
        const parsed = numeric(e.target,{positive:key !== 'price'}); if (parsed.ok) draft[key] = parsed.value;
        markDirty(); updateProductSummary();
      });
    }
    updateProductSummary();
  }
  function updateProductSummary() {
    if(hideMoney()){$('#base-price').replaceChildren();$('#form-error').textContent=errors.size?'Проверьте заполнение записи. Незавершённые профессиональные настройки доступны в профессиональном режиме.':'';return;}
    const price = C.productBasePrice(draft);
    const label = price.value == null ? 'Нет цены или количества упаковки' : `${money(price.value)} / ${C.units[price.unit].label}`;
    $('#base-price').innerHTML = `Цена за базовую единицу<strong>${esc(label)}</strong>${price.value !== null && price.unit === 'g' ? `<small>${money(price.value*1000)} / кг</small>` : ''}`;
    $('#form-error').textContent = [...errors.values()][0] || '';
  }
  function renderPackaging() {
    const context=editorContext('Упаковка и фасовка','Введите любое название. Закупочная цена относится ко всему закупленному количеству. Этот справочник отделён от пищевых продуктов.');
    if(vueEditors)vueEditors.form(editor,"packaging",context);
    else editor.innerHTML = head(context.badge,context.description) + `<div class="editor-content"><div class="product-grid">
      <label>Закупочная цена, ₽${numericInput('price',draft.price,'Нет цены')}</label>
      <label>Закупленное количество${numericInput('packQuantity',draft.packQuantity)}</label>
      <label>Единица закупки<select id="packaging-unit">${Object.entries(P.units).map(([value,u])=>`<option value="${value}" ${draft.unit===value?'selected':''}>${u.label}</option>`).join('')}</select></label>
      <label class="full">Примечание<textarea id="packaging-note" maxlength="10000">${esc(draft.note)}</textarea></label>
      </div><div id="base-price" class="base-price"></div><p class="field-help">Метры пересчитываются в сантиметры, килограммы — в граммы, литры — в миллилитры. Разные виды единиц между собой не смешиваются.</p><p id="form-error" class="inline-error" role="status"></p></div>` + actions(false);
    bindCommon();
    function summary() {
      const base = P.basePrice(draft);
      $('#base-price').innerHTML = `Цена за базовую единицу<strong>${base.value == null ? 'Нет цены или закупленного количества' : esc(money(base.value))+' / '+esc(P.units[base.unit].label)}</strong>`;
      $('#form-error').textContent = [...errors.values()][0] || '';
    }
    for (const key of ['price','packQuantity']) $('#'+key).addEventListener('input',e=>{
      const parsed=numeric(e.target,{positive:key==='packQuantity'});if(parsed.ok) draft[key]=parsed.value;
      markDirty();summary();
    });
    $('#packaging-unit').addEventListener('change',e=>{draft.unit=e.target.value;markDirty();summary();});
    $('#packaging-note').addEventListener('input',e=>{draft.note=e.target.value;markDirty();});
    summary();
  }
  function renderRecipe() {
    const context=editorContext(section === 'prep' ? 'Полуфабрикат · партия' : 'Блюдо · рецептура',hideMoney()?'Добавьте продукты или готовые полуфабрикаты, укажите количество и способ приготовления.':section === 'prep' ? 'Сырьё считается по закупочной стоимости. Себестоимость готового продукта зависит от фактического выхода партии.' : 'Выбирайте продукты и готовые полуфабрикаты. Их производственные потери уже учтены.');
    if(vueEditors)vueEditors.form(editor,"recipe",context);
    else editor.innerHTML = head(context.badge,context.description) + (section === 'dish' ? `<div class="recipe-folder-editor"><label>Папка блюда<select id="recipe-folder">${folderOptions(draft.folderId)}</select></label></div>` : '') + `<div id="photo-editor" class="recipe-photo-editor"></div><div class="editor-content"><div class="section-heading"><h3>Ингредиенты</h3><small id="row-count"></small></div><div class="ingredient-head" aria-hidden="true"><span>Продукт / полуфабрикат</span><span>Количество</span><span>Ед.</span><span data-finance-only>Стоимость</span><span></span></div><div id="ingredients"></div>${section === 'dish' ? '<div id="packaging-editor"></div>' : ''}
      ${section === 'prep' ? `<div class="yield-panel"><div><h3>Фактический выход партии</h3><p>${hideMoney()?"Взвесьте всю готовую партию и укажите её выход.":"Взвесьте всю готовую партию. По этому значению рассчитывается себестоимость грамма и килограмма."}</p></div><label>Выход готовой партии, г${numericInput('actualYield',draft.actualYield,'Обязательно')}</label></div>` : ''}
      ${section === 'dish' ? `<div class="product-grid recipe-note"><label>Количество порций в рецепте${numericInput('recipe-portions',draft.portions || 1)}</label><label>Фактический выход блюда, г (необязательно)${numericInput('dish-yield',draft.actualYield)}</label></div>` : ''}
      <label class="recipe-note">Способ приготовления<textarea id="technology" maxlength="10000">${esc(draft.technology)}</textarea></label>
      <details class="recipe-note" ${draft.note ? 'open' : ''}><summary>Заметка к рецепту</summary><textarea id="recipe-note" placeholder="Что нужно уточнить или учесть">${esc(draft.note)}</textarea></details><div id="summary" class="summary" aria-live="polite"></div>${section === 'dish' ? `<div class="selling-price-editor recipe-note"><label>Цена продажи блюда, ₽${numericInput('selling-price',draft.sellingPrice,'Не задана')}</label><p class="field-help">Цена за одну порцию. Показатели ниже рассчитаны только по продуктовой себестоимости, без упаковки.</p></div><div id="profitability-preview" aria-live="polite"></div>` : ''}<p id="form-error" class="inline-error" role="status"></p></div>` + actions(true);
    if(unified){
      if(!vueEditors){const timing=document.createElement('label');timing.className='recipe-note cooking-time-editor';timing.innerHTML='Время приготовления, мин'+numericInput('cooking-minutes',Home.minutes(draft),'Не задано');
      $('#technology').closest('label').before(timing);}
      $('#cooking-minutes').addEventListener('input',event=>{const parsed=numeric(event.target);if(parsed.ok){try{const value=Home.timing(parsed.value);if(value===null)delete draft.cookingMinutes;else draft.cookingMinutes=value;}catch(error){errors.set('cooking-minutes',error.message);invalidValues.set('cooking-minutes',event.target.value);event.target.setAttribute('aria-invalid','true');}}markDirty();updateRecipeSummary();});
    }
    bindCommon(); renderRows();
    if(section==='dish'&&!vueEditors){
      const preview=document.createElement('div');preview.id='expenses-preview';
      $('#profitability-preview').after(preview);
    }
    $('#recipe-folder')?.addEventListener('change',event=>{
      if(event.target.value) draft.folderId = event.target.value;else delete draft.folderId;
      markDirty();
    });
    photoEditor=Photos.mountEditor($('#photo-editor'),{recipe:draft,primarySelection:section==='dish'&&document.documentElement.hasAttribute('data-sintez-showcase'),
      onChange:({previousPhotoId,previousPhotoIds=[]})=>{[previousPhotoId,...previousPhotoIds].filter(Boolean).forEach(id=>unusedPhotos.add(id));markDirty();flushDraft();},
      onStatus:(text)=>{if(text)message(text,true);}
    });
    photoEditor.ready?.catch(()=>{});
    if (section === 'dish') packagingEditor = KitchenPackagingUI.mountEditor($('#packaging-editor'),{
      getState:()=>state,recipe:draft,uid,
      onChange:()=>{markDirty();updateRecipeSummary();},
      onError:(key,text)=>{if(text) errors.set(key,text);else errors.delete(key);}
    });
    $('#technology').addEventListener('input', e => {draft.technology = e.target.value;markDirty();});
    $('#selling-price')?.addEventListener('input',event=>{
      const parsed=numeric(event.target);
      if(parsed.ok)draft.sellingPrice=parsed.value;
      markDirty();updateRecipeSummary();
    });
    for (const [id,key] of [['recipe-portions','portions'],['dish-yield','actualYield']]) {
      $('#'+id)?.addEventListener('input', e => {const parsed = numeric(e.target,{positive:true}); if(parsed.ok) {if(key === 'portions' && parsed.value == null) {errors.set(id,'Укажите количество порций.');e.target.setAttribute('aria-invalid','true');e.target.setCustomValidity('Укажите количество порций.');} else draft[key] = parsed.value;} markDirty();updateRecipeSummary();});
    }
    $('#add-row').addEventListener('click',() => {
      draft.ingredients.push({id:uid('row'),refId:null,quantity:null,unit:'g',lossPercent:null,outputGrams:null,note:''});
      markDirty();renderRows();updateRecipeSummary();
      const input = $('#ingredients').lastElementChild.querySelector('.ingredient-search');
      input.focus(); input.scrollIntoView({block:'center',behavior:'smooth'});
    });
    $('#recipe-note').addEventListener('input',e => {draft.note = e.target.value;markDirty();});
    if ($('#actualYield')) $('#actualYield').addEventListener('input',e => {
      const parsed = numeric(e.target,{positive:true}); if(parsed.ok) draft.actualYield = parsed.value;
      markDirty();updateRecipeSummary();
    });
    updateRecipeSummary();
  }
  function findRef(id) { if (vueLibrary) return libraryIndex().byId.get(id); return state.products.find(p => p.id === id) || state.recipes.find(r => r.id === id); }
  function rawMass(row) {
    const product = state.products.find(p => p.id === row.refId);
    return product ? C.convertProductQuantity(product,row.quantity,row.unit,'g') : null;
  }
  function renderRows() {
    // Keep unfinished search text and expanded processing fields when another row changes.
    const rawSearch=new Map([...editor.querySelectorAll('.ingredient-search')].map(el=>[el.id,el.value]));
    const expanded=new Map([...editor.querySelectorAll('[data-row]')].map(el=>[el.dataset.row,el.querySelector('details')?.open]));
    $('#row-count').textContent = draft.ingredients.length + ' поз.';
    if(vueEditors){
      vueEditors.rows($('#ingredients'),draft.ingredients.map(row=>({row,reference:findRef(row.refId),rawMass:rawMass(row),
        home:isHomeMode(),units:C.units,format:num,numericText:(id,value)=>invalidValues.has(id)?invalidValues.get(id):num(value,8),bind:()=>bindRow(row)})));
    }else $('#ingredients').innerHTML = draft.ingredients.map(row => {
      const ref = findRef(row.refId), prep = ref?.type === 'prep', processable = !prep && ['g','kg'].includes(row.unit);
      return `<div class="ingredient-row" data-row="${esc(row.id)}"><div class="autocomplete"><label><span class="sr-only">Продукт или полуфабрикат</span><input class="ingredient-search" id="search-${row.id}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="options-${row.id}" autocomplete="off" placeholder="Начните вводить название…" value="${esc(ref?.name || '')}"></label><div id="options-${row.id}" class="suggestions" role="listbox" hidden></div>${ref ? `<span class="ingredient-tag">${prep ? 'Полуфабрикат · готовая масса' : 'Продукт'}${ref.massPerPiece ? ' · '+esc(num(ref.massPerPiece))+' г/шт.' : ''}</span>` : ''}</div>
      <label><span>${prep ? 'Готовая масса' : 'Исходное кол-во'}</span>${numericInput('qty-'+row.id,row.quantity)}</label>
      <label><span>Ед.</span><select id="unit-${row.id}">${prep ? ['g','kg'].map(u => `<option value="${u}" ${row.unit === u ? 'selected' : ''}>${C.units[u].label}</option>`).join('') : unitOptions(row.unit)}</select></label>
      <div class="item-cost" data-finance-only id="cost-${row.id}"><span>Стоимость</span>—</div><button class="remove-row" aria-label="Удалить строку ${esc(ref?.name || 'ингредиента')}" title="Удалить строку">×</button>
      <details class="row-extra" ${row.note ? 'open' : ''}><summary>${prep||isHomeMode() ? 'Заметка' : 'Обработка и заметка'}${!isHomeMode()&&row.lossPercent != null ? ' · потери '+esc(num(row.lossPercent))+'%' : ''}</summary><div class="extra-grid">${processable ? `<label class="processing-option">Исходный вес, г<input id="raw-${row.id}" value="${esc(num(rawMass(row)))}" readonly tabindex="-1" placeholder="Масса неизвестна"></label><label class="processing-option">Потери, %${numericInput('loss-'+row.id,row.lossPercent,'Без потерь')}</label><label class="processing-option">Расчётный выход, г${numericInput('output-'+row.id,row.outputGrams,'По исходному весу')}</label>` : ''}<label class="note-field">Заметка<input id="note-${row.id}" value="${esc(row.note)}" placeholder="Например, уточнить количество"></label></div></details></div>`;
    }).join('');
    for(const row of draft.ingredients) {
      const search=$('#search-'+row.id);
      if(!row.refId && rawSearch.has(search.id)) search.value=rawSearch.get(search.id);
      if(expanded.has(row.id)) $(`[data-row="${row.id}"] details`).open=expanded.get(row.id);
    }
    if(!vueEditors)for (const row of draft.ingredients) bindRow(row);
    for (const [id, text] of errors) { const field = document.getElementById(id.startsWith('processing-') ? id.replace('processing-','output-') : id); if(field) {field.setAttribute('aria-invalid','true');field.setCustomValidity(text);} }
  }
  function bindRow(row) {
    const el = $(`[data-row="${row.id}"]`);
    const quantity = $('#qty-'+row.id), unit = $('#unit-'+row.id), loss = $('#loss-'+row.id), output = $('#output-'+row.id);
    quantity.setAttribute('aria-label','Количество ингредиента');unit.setAttribute('aria-label','Единица ингредиента');
    function derived(field, value) {field.value = num(value,8);errors.delete(field.id);invalidValues.delete(field.id);field.removeAttribute('aria-invalid');field.setCustomValidity('');}
    function syncProcessing(source) {
      const raw = rawMass(row);
      if ($('#raw-'+row.id)) $('#raw-'+row.id).value = num(raw);
      if (!loss || !output) return;
      try {
        if (source === 'output') {
          row.lossPercent = row.outputGrams == null ? null : C.lossFromOutput(raw,row.outputGrams);
          derived(loss,row.lossPercent);
        } else if (source === 'loss' || row.lossPercent != null) {
          row.outputGrams = C.syncLoss(raw,row.lossPercent); derived(output,row.outputGrams);
        } else if (row.outputGrams != null && raw != null) {
          row.lossPercent = C.lossFromOutput(raw,row.outputGrams); derived(loss,row.lossPercent);
        }
        errors.delete('processing-'+row.id); output.removeAttribute('aria-invalid');output.setCustomValidity('');
      } catch(e) { errors.set('processing-'+row.id,e.message);output.setAttribute('aria-invalid','true');output.setCustomValidity(e.message); }
    }
    quantity.addEventListener('input',e => {
      const parsed = numeric(e.target); if(parsed.ok) {row.quantity = parsed.value;syncProcessing('quantity');}
      markDirty();updateRecipeSummary();
    });
    unit.addEventListener('change',e => {row.unit = e.target.value; if(!['g','kg'].includes(row.unit)) {row.lossPercent = null;row.outputGrams = null;for(const key of ['loss-','output-','processing-']) {errors.delete(key+row.id);invalidValues.delete(key+row.id);}} else syncProcessing('unit');markDirty();renderRows();updateRecipeSummary();});
    if(loss) loss.addEventListener('input',e => {
      const parsed = numeric(e.target,{max:100}); if(parsed.ok) {row.lossPercent = parsed.value;syncProcessing('loss');}
      markDirty();updateRecipeSummary();
    });
    if(output) output.addEventListener('input',e => {
      const parsed = numeric(e.target); if(parsed.ok) {row.outputGrams = parsed.value;syncProcessing('output');}
      markDirty();updateRecipeSummary();
    });
    $('#note-'+row.id).addEventListener('input',e => {row.note = e.target.value;markDirty();});
    $('.remove-row',el).addEventListener('click',() => {
      draft.ingredients = draft.ingredients.filter(r => r.id !== row.id);
      for(const key of errors.keys()) if(key.endsWith(row.id)) {errors.delete(key);invalidValues.delete(key);}
      markDirty();renderRows();updateRecipeSummary();
    });
    setupSearch(row,el);
  }
  function setupSearch(row, container) {
    const input = $('.ingredient-search',container), list = $('.suggestions',container);
    let options = [], active = -1;
    function close() {list.hidden = true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    function draw() {
      const term = input.value.trim().toLocaleLowerCase('ru');
      const matches = item => item.id !== draft.id &&
        (item.name+' '+(item.aliases || '')).toLocaleLowerCase('ru').includes(term);
      // Products cannot form recipe cycles. Check the graph only for matching
      // preparations, retaining the original product-first suggestion order.
      const products = vueLibrary ? libraryIndex().search('products',term) : state.products.filter(matches);
      const preparations = vueLibrary ? libraryIndex().search('prep',term) : state.recipes.filter(r => r.type === 'prep' && matches(r));
      // A preparation that already reaches this draft would close a cycle. On a broad
      // search compute those ancestors once instead of rebuilding the graph per option.
      if (vueLibrary && preparations.length > 16) {
        const forbidden = libraryIndex().ancestors(draft.id);
        options = [...products,...preparations.filter(item => !forbidden.has(item.id))];
      } else {
        const combined = preparations.length ? currentState() : null;
        options = [...products,...preparations.filter(item => item.id !== draft.id && !C.wouldCreateCycle(combined,draft.id,item.id))];
      }
      active = -1;
      list.innerHTML = options.length ? options.map((item,i) => `<button type="button" role="option" aria-selected="false" id="option-${row.id}-${i}" class="suggestion" data-index="${i}">${esc(item.name)}<small>${item.type === 'prep' ? 'Полуфабрикат · готовая масса' : 'Продукт'}</small></button>`).join('') : '<div class="no-results">Ничего не найдено. Создайте запись в справочнике. Циклические ссылки исключены.</div>';
      list.hidden = false;input.setAttribute('aria-expanded','true');
      list.querySelectorAll('[data-index]').forEach(btn => {
        btn.addEventListener('pointerdown',e => e.preventDefault());
        btn.addEventListener('click',() => choose(Number(btn.dataset.index)));
      });
    }
    function choose(index) {
      const ref = options[index]; if(!ref) return;
      row.refId = ref.id; row.lossPercent = null;row.outputGrams = null;
      if(ref.type === 'prep') { if(!['g','kg'].includes(row.unit)) row.unit = 'g'; }
      else if(C.convertProductQuantity(ref,1,row.unit,C.units[ref.unit].base) == null) row.unit = ref.unit;
      for(const key of errors.keys()) if(key.endsWith(row.id)) {errors.delete(key);invalidValues.delete(key);}
      markDirty();renderRows();updateRecipeSummary();$('#qty-'+row.id).focus();
    }
    input.addEventListener('focus',draw);
    input.addEventListener('input',() => { row.refId = null; row.lossPercent = null;row.outputGrams = null;markDirty();draw();updateRecipeSummary(); });
    input.addEventListener('blur',() => setTimeout(close,140));
    input.addEventListener('keydown',e => {
      if(e.key === 'Escape') {close();e.stopPropagation();}
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();if(list.hidden) draw();
        if(!options.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        list.querySelectorAll('[role="option"]').forEach((el,i) => el.setAttribute('aria-selected',i === active ? 'true' : 'false'));
        input.setAttribute('aria-activedescendant',`option-${row.id}-${active}`);
        $('#'+`option-${row.id}-${active}`).scrollIntoView({block:'nearest'});
      }
      if(e.key === 'Enter' && !list.hidden) {e.preventDefault();choose(active >= 0 ? active : 0);}
    });
  }
  function updateRecipeSummary() {
    const projected = currentState();
    const result = C.calcRecipe(projected,draft.id);
    if(hideMoney()){
      const value=section==='prep'?draft.actualYield:(draft.actualYield??result.massGrams);
      const output=value==null?'не задан — уточните массу компонентов':num(value)+' г';
      $('#mobile-summary').innerHTML='<span>Выход</span><strong>'+esc(output)+'</strong>';
      $('#summary').className='summary';$('#summary').innerHTML='<div class="summary-meta">Выход готового '+(section==='prep'?'полуфабриката':'блюда')+': <strong>'+esc(output)+'</strong></div>';
      $('#form-error').textContent=errors.size?'Проверьте заполнение рецепта. Незавершённые профессиональные настройки доступны в профессиональном режиме.':'';
      return;
    }
    result.rows.forEach((r,i) => {
      const el = $('#cost-'+draft.ingredients[i].id);
      el.innerHTML = `<span>Стоимость</span>${r.complete ? esc(money(r.knownCost)) : r.knownCost > 0 ? esc(money(r.knownCost))+'*' : '—'}${!r.complete ? '<small>Неполно</small>' : ''}`;
    });
    const packaging = isBusinessMode()&&section === 'dish' ? P.calculate(projected,draft,draft.portions || 1) : {knownCost:0,complete:true,issues:[]};
    const displayPackaging=isBusinessMode()&&(draft.packaging || []).length;
    const summaryYield=isHomeMode()?(section==='prep'?draft.actualYield:(draft.actualYield??result.massGrams)):result.massGrams;
    const total = result.knownCost + packaging.knownCost;
    const incomplete = !result.complete || !packaging.complete || errors.size > 0 || !Number.isFinite(total);
    packagingEditor?.refreshSummary();
    $('#mobile-summary').innerHTML = `<span>${incomplete ? 'Известная часть · неполно' : section === 'prep' ? 'Стоимость партии' : isHomeMode()?'Стоимость ингредиентов':'Себестоимость рецепта'}</span><strong>${esc(money(total))}</strong>`;
    const allIssues = [...errors.values(),...result.issues,...packaging.issues,...(!Number.isFinite(total) ? ['Слишком большая полная себестоимость.'] : [])];
    const summary = $('#summary');summary.className = 'summary'+(incomplete ? ' incomplete' : '');
    summary.innerHTML = `<div class="summary-top"><div><div class="summary-label">${incomplete ? 'Известная часть стоимости' : section === 'prep' ? 'Стоимость всей партии' : displayPackaging ? 'Полная себестоимость рецепта' : 'Продуктовая себестоимость рецепта'}</div><div class="summary-value">${esc(money(total))}</div>${displayPackaging ? `<p class="summary-breakdown">Ингредиенты: ${esc(money(result.knownCost))} · Упаковка: ${esc(money(packaging.knownCost))}<br>На одну порцию: ${esc(money(total/(draft.portions || 1)))}</p>` : ''}<div class="summary-meta">${section === 'prep' ? 'Фактический выход' : 'Расчётный выход рецепта'}: ${summaryYield == null ? (isHomeMode()?'неизвестен — уточните выход и массу компонентов':'неизвестен — нужна масса всех компонентов') : esc(num(summaryYield))+' г'}${section === 'prep' && !incomplete && result.costPerGram != null ? `<br>${esc(money(result.costPerGram))} / г · ${esc(money(result.costPerGram*1000))} / кг` : ''}</div></div><span class="summary-status">${incomplete ? 'Расчёт неполный' : 'Рассчитано'}</span></div>${incomplete ? `<ul class="issues">${[...new Set(allIssues)].map(s => `<li>${esc(s)}</li>`).join('')}</ul><p class="draft-note">Известная часть суммы не является полной продуктовой себестоимостью.</p>` : ''}`;
    if(section==='dish'&&isBusinessMode()) $('#profitability-preview').innerHTML=KitchenProfitabilityView.render(projected,draft.id,{
      invalid:errors.has('selling-price'),
      foodInvalid:[...errors.keys()].some(key=>key!=='selling-price' && !key.startsWith('pack-'))
    });
    if(section==='dish'&&isBusinessMode()&&$('#expenses-preview')){
      $('#expenses-preview').innerHTML=ExpensePreferences.enabled(draft)?KitchenExpensesUI.renderCard(projected,draft.id,draft.portions||1,{invalid:errors.size>0}):'';
      $('#expenses-preview .expenses-open')?.addEventListener('click',()=>switchSection('expenses'));
    }
    $('#form-error').textContent = errors.size ? (isHomeMode()&&[...errors.keys()].some(key=>key==='selling-price'||key.startsWith('pack-'))?'В черновике есть ошибки расширенных полей. Исправьте их в режиме «Для повара» или «Для бизнеса». Черновик сохранён отдельно.':'Исправьте ввод: '+[...errors.values()][0]) : '';
  }
  function saveDraft() {
    if(backupBusy) {message('Дождитесь завершения работы с резервной копией.',true);return false;}
    if(section==='expenses'){
      let candidate;try{candidate=currentState();}catch(error){message(error.message,true);editor.querySelector('[aria-invalid=true]')?.focus();return false;}
      if(!persist(candidate,expenseEditor.journalActive?'Финансовый журнал сохранён ✓.':'Расходы сохранены ✓. Калькуляции блюд пересчитываются автоматически.')){
        $('#save-state').textContent='В памяти · скачайте JSON';$('#save-item').textContent='Повторить сохранение';return false;
      }
      dirty=false;expenseEditor.committed(state);$('#save-state').textContent='Сохранено в браузере';$('#save-item').textContent='Сохранено ✓';$('#save-item').classList.add('saved');return true;
    }
    if(photoEditor?.busy) {message('Дождитесь обработки фотографии перед сохранением.',true);return false;}
    if (!draft.name.trim()) {message('Введите название.',true);$('#item-name').focus();return false;}
    if (errors.size) {message('Исправьте ошибки в числовых полях перед сохранением.',true);editor.querySelector('[aria-invalid="true"]')?.focus();return false;}
    draft.name = draft.name.trim();
    const candidate = currentState();
    if(!persist(candidate,isHomeMode()?'Сохранено ✓.':'Сохранено ✓. Связанные калькуляции пересчитаны.')) {
      $('#save-state').textContent='В памяти · скачайте JSON';$('#save-item').textContent='Повторить сохранение';$('#save-item').classList.remove('saved');
      if(editingRecipe()){dirty=true;flushDraft();}return false;
    }
    selectedId = draft.id;
    if(!storageBlocked) {
      clearTimeout(draftTimer);draftTimer=null;dirty=false;isNew=false;
      if(!isCatalog()) {
        const removed=D.remove(draft.id,section);
        setDraftStatus(removed.ok?'Карточка сохранена · черновик очищен':'Карточка сохранена, но черновик не удалён: '+removed.error,!removed.ok);
      }
      releaseUnusedPhotos();
    } else if(editingRecipe()) {dirty=true;flushDraft();}
    $('#save-state').textContent = storageBlocked ? 'В памяти · скачайте JSON' : 'Сохранено в браузере';
    $('#save-item').textContent = storageBlocked ? 'Повторить сохранение' : 'Сохранено ✓';
    $('#save-item').classList.toggle('saved', !storageBlocked);
    renderLibrary();renderDrafts();return true;
  }
  function deleteItem() {
    if(backupBusy) {message('Дождитесь завершения работы с резервной копией.',true);return;}
    if(photoEditor?.busy) {message('Дождитесь обработки фотографии.',true);return;}
    if(isNew) {
      if(editingRecipe()) {flushDraft();discardDraft(draft.id,section);} else {selectedId = collection()[0]?.id || null;openSelected();}
      return;
    }
    const uses = state.recipes.filter(r => (section === 'packaging' ? (r.packaging || []) : r.ingredients).some(row => row.refId === draft.id));
    if(uses.length) {message('Удаление невозможно: используется в рецептах «'+uses.map(r => r.name).join('», «')+'». Сначала замените '+(section === 'packaging' ? 'позицию упаковки' : 'ингредиент')+' в этих рецептах.',true);return;}
    if(!confirm('Удалить «'+draft.name+'»?')) return;
    const candidate = clone(state), key = isCatalog() ? section : 'recipes';
    candidate[key] = candidate[key].filter(item => item.id !== draft.id);
    if(persist(candidate,'Запись удалена.')) {
      if(!storageBlocked && !isCatalog()) {
        Photos.ids(draft).filter(Boolean).forEach(id=>unusedPhotos.add(id));
        const removed=D.remove(draft.id,section);
        if(!removed.ok)message('Запись удалена, но её черновик остался: '+removed.error,true);
      }
      selectedId = collection()[0]?.id || null;openSelected();
    }
  }
  function createItem() {
    if(!canLeave()) return false;
    draft = section === 'products' ? {id:uid('product'),name:'',aliases:'',price:null,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''} : section === 'packaging' ? {id:uid('packaging'),name:'',price:null,packQuantity:1,unit:'pcs',note:''} : {id:uid(section),type:section,name:'',note:'',actualYield:null,ingredients:[]};
    if(section === 'dish' && selectedFolderId()) draft.folderId = selectedFolderId();
    clearTimeout(draftTimer);draftStatus='';
    viewing = false;selectedId = draft.id;dirty = true;isNew = true;errors.clear();invalidValues.clear();renderLibrary();renderEditor();markDirty();renderDrafts();$('#item-name').focus();return true;
  }
  $('#create').addEventListener('click',createItem);
  $('.brand').addEventListener('click', e => {e.preventDefault();if(canLeave()) {section = 'dish';selectedId = null;openSelected();}});
  $('[data-tab="dish"]').addEventListener('click',() => switchSection('dish'));
  $('[data-tab="prep"]').addEventListener('click',() => switchSection('prep'));
  $('[data-tab="products"]').addEventListener('click',() => switchSection('products'));
  $('[data-tab="packaging"]').addEventListener('click',() => switchSection('packaging'));
  $('[data-tab="expenses"]')?.addEventListener('click',() => switchSection('expenses'));
  $('#library-search').addEventListener('input',renderLibrary);
  $('#folder-filter').addEventListener('change',event=>{
    const next = event.target.value;
    if(!canLeave()) {event.target.value = folderFilter;return;}
    $('#folder-form').hidden = true;folderFormId = null;
    folderFilter = next;selectedId = null;openSelected();
  });
  $('#folder-create').addEventListener('click',()=>showFolderForm());
  $('#folder-rename').addEventListener('click',()=>showFolderForm(selectedFolderId()));
  function closeFolderForm() {
    $('#folder-form').hidden = true;$('#folder-error').hidden = true;
    $(folderFormId ? '#folder-rename' : '#folder-create').focus();folderFormId = null;
  }
  $('#folder-cancel').addEventListener('click',closeFolderForm);
  $('#folder-form').addEventListener('keydown',event=>{if(event.key === 'Escape') {event.preventDefault();closeFolderForm();}});
  $('#folder-form').addEventListener('submit',event=>{
    event.preventDefault();
    try {
      const name = $('#folder-name').value;
      const candidate = folderFormId ? F.rename(state,folderFormId,name) : F.create(state,uid('folder'),name);
      if(!persistFolders(candidate,folderFormId ? 'Название папки сохранено.' : 'Папка создана.')) return;
      closeFolderForm();refreshFolderFields();renderLibrary();
    } catch(error) {const el = $('#folder-error');el.textContent = error.message;el.hidden = false;$('#folder-name').focus();}
  });
  $('#folder-delete').addEventListener('click',()=>{
    if(!folderActionAllowed()) return;
    const folder = (state.folders || []).find(item=>item.id === selectedFolderId());
    if(!folder) return;
    const count = state.recipes.filter(recipe=>recipe.type === 'dish' && recipe.folderId === folder.id).length;
    if(!confirm(`Удалить папку «${folder.name}»? Блюда (${count}) не удалятся и перейдут в «Без папки». Черновики сохранятся отдельно.`)) return;
    try {
      if(!persistFolders(F.remove(state,folder.id),'Папка удалена. Все блюда сохранены в разделе «Без папки».')) return;
      folderFilter = 'unfiled';$('#folder-form').hidden = true;folderFormId = null;
      refreshFolderFields();renderLibrary();
    } catch(error) {message(error.message,true);}
  });
  let backupBusy=false;
  $('#export').addEventListener('click',async () => {
    if(backupBusy)return;
    if(photoEditor?.busy) {message('Дождитесь обработки фотографии перед экспортом.',true);return;}
    const hasUnfinishedRecipe=editingRecipe() && dirty;
    const emergency=dirty&&(storageBlocked||recoveryRequired);
    if(emergency&&section!=='expenses'&&(!draft?.name?.trim()||errors.size)){message('Исправьте название и числа перед экспортом введённой записи.',true);return;}
    if(emergency&&section==='expenses'){try{expenseEditor.value();}catch(error){message(error.message,true);return;}}
    if(emergency&&hasUnfinishedRecipe)flushDraft();
    if(!emergency&&dirty && (hasUnfinishedRecipe ? !flushDraft() : !saveDraft())) return;
    backupBusy=true;$('#export').disabled=true;
    try {
      const portable=await Photos.exportData(emergency?P.resolveLinks(S.validate(currentState())):state);
      const text = S.stringify(portable), url = URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
      const link = document.createElement('a');link.href = url;link.download = 'kitchen-calculator-PR2-TEST-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
      message('JSON с сохранёнными карточками и фотографиями подготовлен к скачиванию.'+(hasUnfinishedRecipe?' Незавершённый черновик хранится отдельно: сначала нажмите «Сохранить», чтобы включить изменения в резервную копию.':''));
      if(emergency)message('Введённые изменения включены в скачиваемый JSON. Экспорт не выполняет новую запись в базу браузера.');
    } catch(e) {message('Экспорт не выполнен: '+e.message,true);}
    finally {backupBusy=false;$('#export').disabled=false;}
  });
  const importController=KitchenImportUI.mount({
    getState:()=>state,
    getDraftSource:()=>localStorage.getItem(D.KEY),
    canStart:()=>{
      if(backupBusy || photoEditor?.busy) {message('Дождитесь завершения обработки фотографии или резервной копии.',true);return false;}
      if(recoveryRequired || storageBlocked) {message('Импорт заблокирован: текущую базу не удалось прочитать или сохранить. Скачайте исходные данные или экспорт и сохраните черновик перед восстановлением.',true);return false;}
      if(dirty && !editingRecipe()) {message('Сначала сохраните изменения справочника или выйдите из редактора с подтверждением. Введённые поля сохранены на экране.',true);return false;}
      if(editingRecipe() && dirty && !flushDraft()) {message('Не удалось сохранить черновик перед импортом. Основная база не изменена.',true);return false;}
      return true;
    },
    setBusy:value=>{
      backupBusy=value;$('#import').disabled=value;$('#export').disabled=value;
      $('.workspace').inert=value;$('#drafts-panel').inert=value;$('.tabs').inert=value;
    },
    onApplied:(data,source)=>{
      state=data;persistedSource=source;storageBlocked=false;recoveryRequired=false;clearMissingStorageHelp();
      $('#folder-form').hidden=true;folderFormId=null;
      selectedId=collection()[0]?.id || null;openSelected();
    },onWriteUncertain:()=>{storageBlocked=true;},message
  });
  $('#damaged-source').hidden=!recoveryRequired;
  $('#download-damaged-source').addEventListener('click',()=>{
    try {
      const original=localStorage.getItem(S.KEY);
      if(original===null)throw Error('Исходная запись отсутствует.');
      const url=URL.createObjectURL(new Blob([original],{type:'application/json;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='kitchen-test-original-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      message('Исходная запись подготовлена к скачиванию без изменений. Фотографии и черновики не удалены.');
    } catch(error) {message('Не удалось скачать исходную запись: '+error.message,true);}
  });
  window.addEventListener('beforeunload',e => {
    const safe=editingRecipe() && dirty ? flushDraft() : !dirty;
    if(!safe || storageBlocked || photoEditor?.busy || backupBusy) {e.preventDefault();e.returnValue = '';}
  });
  window.addEventListener('pagehide',()=>flushDraft());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDraft();});
  window.addEventListener('storage',event=>{
    if(event.key===S.KEY&&event.newValue!==persistedSource){storageBlocked=true;message('База изменилась в другой вкладке. Сохранение старой версии заблокировано. Введённые поля остаются на экране: скачайте JSON с изменениями перед обновлением страницы.',true);}
  });
  // UI-only navigation boundary. All edits, checks and saves use existing handlers.
  globalThis.KitchenNavigation = Object.freeze({
    favorites(value){if(favoritesOnly!==!!value){favoritesOnly=!!value;renderLibrary();}return true;},
    setMode(mode){
      if(![null,'home','chef','business'].includes(mode))return false;
      if(backupBusy||photoEditor?.busy){message('Дождитесь обработки фотографии или резервной копии.',true);return false;}
      if(!Home.allowed(section,mode)&&!switchSection('dish'))return false;
      const changed=workspaceMode!==mode;workspaceMode=mode;
      if(changed&&isHomeMode()&&!$('#message').classList.contains('error')){$('#message').textContent='';$('#message').hidden=true;}
      if(mode)document.documentElement.dataset.sintezWorkspaceMode=mode;else delete document.documentElement.dataset.sintezWorkspaceMode;
      if(changed&&draft){
        if(section==='dish'&&viewing)renderEditor();
        else if(!isCatalog()){renderRows();updateRecipeSummary();}
        else if(section==='products')updateProductSummary();
      }
      renderLibrary();return true;
    },
    start(mode){
      if(!leaveEditorSafely())return false;
      workspaceMode=mode;section='dish';selectedId=null;favoritesOnly=false;folderFilter='all';
      $('#library-search').value='';$('#library-list').scrollTop=0;
      document.documentElement.dataset.sintezWorkspaceMode=mode;openSelected();return true;
    },
    open(next, create = false) {
      if(!['dish','prep','products','packaging','expenses'].includes(next))return false;
      if(!switchSection(next))return false;
      return create && next==='dish' ? createItem() : true;
    },
    park() {
      if(backupBusy || photoEditor?.busy){message('Дождитесь обработки фотографии или резервной копии.',true);return false;}
      if(editingRecipe() && dirty && !flushDraft())return false;
      return true; // The editor DOM stays mounted, including unsaved catalog fields.
    },
    current: () => ({section,dirty})
  });
  openSelected();
  if(loaded.error) message('Не удалось прочитать сохранённые данные: '+loaded.error+' Исходная запись не перезаписана. Автоматическая запись и импорт заблокированы. Скачайте исходную запись для восстановления; фотографии и черновики остаются в браузере.',true);
  else if(!loaded.data) {
    message('По этому адресу в данном браузере сохранённая база отсутствует. Можно импортировать свой JSON. Если вы уже работали здесь, проверьте сохранение и другие локальные источники. Демо-данные не записаны.');
  }
  globalThis.KitchenPersistenceDiagnostics?.mount({missing:loaded.source===null,failed:!!loaded.error,openImport:importController.openCandidate,message});
})();
