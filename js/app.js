(function () {
  'use strict';
  const C = KitchenCalc, S = KitchenStorage, P = KitchenPackaging, D = KitchenDrafts, Photos = KitchenPhotos;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const money = n => !Number.isFinite(n) ? 'Значение слишком велико' : new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const num = (n, digits = 3) => n == null ? '' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,useGrouping:false}).format(n);
  const unitOptions = selected => Object.entries(C.units).map(([value,u]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${u.label}</option>`).join('');
  const loaded = S.load();
  let state = loaded.data || (loaded.error ? {version:1,products:[],recipes:[]} : KitchenSeed.create());
  let recoveryRequired = !!loaded.error;
  let section = 'dish', selectedId = state.recipes.find(r => r.type === 'dish')?.id || null;
  let viewing = true, viewPortions = 1, showPrices = true;
  let draft = null, dirty = false, isNew = false, errors = new Map(), invalidValues = new Map(), storageBlocked = !!loaded.error;
  const editor = $('#editor');
  let packagingEditor = null;
  let photoEditor = null, photoPreview = null, draftTimer = null, draftStatus = '', restoring = false, printPhoto = true;
  const unusedPhotos = new Set();
  const isCatalog = () => section === 'products' || section === 'packaging';
  const editingRecipe = () => draft && !isCatalog() && !(section === 'dish' && viewing);

  function message(text, error = false) {
    const el = $('#message'); el.textContent = text; el.className = error ? 'error' : ''; el.hidden = false;
  }
  function persist(candidate, success, restore = false) {
    if (recoveryRequired && !restore) {message('Сохранение заблокировано: исходное хранилище не удалось прочитать. Восстановите резервную копию через импорт JSON. Исходные данные не изменены.',true);return false;}
    let clean;
    try { clean = P.resolveLinks(S.validate(candidate)); } catch(e) { message(e.message, true); return false; }
    const result = S.save(clean);
    state = clean;
    if (!result.ok) {
      storageBlocked = true;
      message('Не удалось сохранить в браузере: ' + result.error + ' Изменения пока в памяти. Скачайте экспорт JSON до закрытия страницы.', true);
    } else { recoveryRequired = false; storageBlocked = false; message(success || 'Данные сохранены в этом браузере.'); }
    return true;
  }
  function collection() { return isCatalog() ? (state[section] || []) : state.recipes.filter(r => r.type === section); }
  function currentState() {
    const next = clone(state);
    if (draft) {
      const key = isCatalog() ? section : 'recipes';
      if (!next[key]) next[key] = [];
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
    if (storageBlocked) return;
    const savedDrafts = D.load();
    if (savedDrafts.error) return;
    for (const id of unusedPhotos) {
      if (state.recipes.some(r=>r.photoId===id) || savedDrafts.items.some(r=>r.data.photoId===id) || draft?.photoId===id) continue;
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
      formValues:[...editor.querySelectorAll('input[id],select[id],textarea[id]')].filter(el=>el.type!=='file' && !el.readOnly).map(el=>({id:el.id,value:el.value,checked:el.checked})),
      details:[...editor.querySelectorAll('details')].map((el,index)=>({index,open:el.open}))
    };
    const result = D.save(record);
    setDraftStatus(result.ok ? 'Черновик сохранён' : 'Черновик не сохранён: '+result.error,!result.ok);
    if (result.ok) releaseUnusedPhotos();
    renderDrafts();
    return result.ok;
  }
  function renderDrafts() {
    const host = $('#drafts-panel'), result = D.load();
    host.hidden = !result.error && !result.items.length;
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
    clearTimeout(draftTimer); section=type;selectedId=id;viewing=false;
    draft=clone(record.data);isNew=record.isNew || !state.recipes.some(r=>r.id===id);dirty=true;
    errors=new Map(record.errors);invalidValues=new Map(record.invalidValues);draftStatus='Черновик восстановлен · нажмите «Сохранить» для изменения карточки';
    $('#library-search').value='';restoring=true;renderLibrary();renderEditor();
    for (const field of record.formValues) {
      const el=document.getElementById(field.id);
      if (!el || !editor.contains(el) || el.type==='file' || el.readOnly) continue;
      el.value=field.value;if(el.type==='checkbox')el.checked=field.checked;
      // The packaging module keeps invalid raw values separately from its recipe data.
      if (field.id.startsWith('pack-qty-')) el.dispatchEvent(new Event('input',{bubbles:true}));
    }
    for (const item of record.details) {const el=editor.querySelectorAll('details')[item.index];if(el)el.open=item.open;}
    for (const [key,text] of errors) {const el=document.getElementById(key);if(el && el.setCustomValidity){el.setCustomValidity(text);el.setAttribute('aria-invalid','true');}}
    updateRecipeSummary();restoring=false;renderDrafts();$('#item-name').focus();
    message('Черновик восстановлен. Основная карточка изменится только после нажатия «Сохранить».');
  }
  function discardDraft(id,type) {
    if (!confirm('Удалить этот черновик? Незавершённые изменения будут потеряны. Сохранённая карточка останется.')) return;
    const result=D.load(), record=result.items.find(r=>r.id===id && r.type===type);
    const active=editingRecipe() && draft.id===id && section===type;
    if (active && photoEditor?.busy) {message('Дождитесь обработки фотографии.',true);return;}
    const removed=D.remove(id,type);
    if (!removed.ok) {message('Не удалось удалить черновик: '+removed.error,true);return;}
    if(record?.data.photoId)unusedPhotos.add(record.data.photoId);
    if(active) {clearTimeout(draftTimer);dirty=false;selectedId=state.recipes.some(r=>r.id===id)?id:null;openSelected();}
    renderDrafts();releaseUnusedPhotos();
  }
  function canLeave() {
    if (photoEditor?.busy) {message('Дождитесь обработки фотографии перед переходом.',true);return false;}
    if (!dirty) return true;
    if (editingRecipe() && flushDraft()) return true;
    return confirm('Есть несохранённые изменения. '+(editingRecipe()?'Не удалось сохранить черновик. ':'')+'Перейти и отменить их?');
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
  function renderLibrary() {
    const labels = {dish:['Мои рецепты','Новое блюдо'],prep:['Полуфабрикаты','Новый полуфабрикат'],products:['Продукты','Новый продукт'],packaging:['Упаковка и фасовка','Новая позиция']};
    $('.workspace').dataset.section = section;
    $('.workspace').classList.add('compact-library');
    const libraryList = $('#library-list');
    libraryList.classList.add('compact-list');
    libraryList.setAttribute('role','region');
    libraryList.setAttribute('aria-labelledby','section-title');
    libraryList.tabIndex = 0;
    $('#section-title').textContent = labels[section][0]; $('#create').textContent = '+ ' + labels[section][1];
    for (const key of ['dish','prep','products','packaging']) {
      $(`#count-${key}`).textContent = ['products','packaging'].includes(key) ? (state[key] || []).length : state.recipes.filter(r => r.type === key).length;
      $(`[data-tab="${key}"]`).setAttribute('aria-current',section === key ? 'page' : 'false');
    }
    const query = $('#library-search').value.toLocaleLowerCase('ru').trim();
    const list = collection().filter(item => (item.name+' '+(item.aliases || '')).toLocaleLowerCase('ru').includes(query));
    $('#library-list').innerHTML = list.length ? list.map(item => {
      let caption;
      if (isCatalog()) {
        const base = section === 'packaging' ? P.basePrice(item) : C.productBasePrice(item);
        const units = section === 'packaging' ? P.units : C.units;
        caption = base.value == null ? 'Нет цены' : money(base.value) + ' / ' + units[base.unit].label;
      } else {
        const result = C.calcRecipe(state,item.id);
        caption = section === 'dish' ? 'Техкарта' : result.complete ? money(result.knownCost) + (section === 'prep' ? ' / партия' : ' / порция') : 'Неполная калькуляция';
      }
      return `<button class="library-item library-row ${section === 'products' ? 'product-row' : ''} ${item.id === selectedId ? 'active' : ''}" data-open="${esc(item.id)}" aria-current="${item.id === selectedId ? 'true' : 'false'}"><strong>${esc(item.name)}</strong><small>${esc(caption)}</small></button>`;
    }).join('') : '<p class="field-help">Ничего не найдено. Создайте новую запись.</p>';
    $('#library-list').querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click',() => {
      if (!canLeave()) return;
      selectedId = btn.dataset.open; openSelected();
      $(`[data-open="${selectedId}"]`)?.focus({preventScroll:true});
    }));
  }
  function openSelected() {
    draft = clone(collection().find(item => item.id === selectedId) || null);
    viewing = section === 'dish'; viewPortions = draft?.portions || 1;
    dirty = false; isNew = false; errors.clear();invalidValues.clear(); renderLibrary(); renderEditor();
  }
  function switchSection(next) {
    if (next === section || !canLeave()) return;
    section = next; $('#library-search').value = ''; selectedId = collection()[0]?.id || null; openSelected();
  }
  function renderEditor() {
    packagingEditor = null;
    if (!draft) { editor.innerHTML = `<div class="empty-state"><h2>${section === 'dish' && collection().length ? 'Выберите рецепт из списка' : 'Начните с новой записи'}</h2><p>Откройте сохранённую запись или создайте новую<br>кнопкой в справочнике.</p></div>`; return; }
    if (section === 'dish' && viewing) renderCard();
    else if (section === 'products') renderProduct(); else if (section === 'packaging') renderPackaging(); else renderRecipe();
  }
  function renderCard() {
    editor.innerHTML = `<div class="card-controls"><button id="back-list">← К списку</button><button id="edit-recipe">Изменить</button><button id="print-recipe">Печать</button><label>Количество порций<input id="view-portions" type="text" inputmode="decimal" value="${esc(num(viewPortions,8))}"></label><label>ПОКАЗЫВАТЬ ЦЕНЫ<select id="show-prices"><option value="yes" ${showPrices ? 'selected' : ''}>ДА</option><option value="no" ${!showPrices ? 'selected' : ''}>НЕТ</option></select></label><p id="view-error" role="status"></p></div><article id="recipe-card" class="recipe-card"></article>`;
    function draw() {
      try {
        viewPortions = C.parseNumber($('#view-portions').value);
        const view = KitchenRecipeView.scale(state,draft.id,viewPortions);
        const result = view.result, recipe = view.recipe;
        const packaging = P.calculate(state,recipe,viewPortions);
        const total = result.knownCost + packaging.knownCost;
        if (!Number.isFinite(total)) throw Error('Слишком большая полная себестоимость. Уменьшите количество порций.');
        const complete = result.complete && packaging.complete;
        $('#recipe-card').innerHTML = `<p class="eyebrow">ТЕХНОЛОГИЧЕСКАЯ КАРТА</p><h1>${esc(recipe.name)}</h1><p>Количество порций: ${esc(num(viewPortions,8))}</p>
          <table class="food-ingredients"><thead><tr><th>Ингредиент</th><th>Кол-во</th><th>Выход, г</th>${showPrices ? '<th>Сумма</th>' : ''}</tr></thead><tbody>${recipe.ingredients.map((row,i) => `<tr><td>${esc(findRef(row.refId)?.name || 'Ингредиент не выбран')}${row.note ? `<div class="card-text">${esc(row.note)}</div>` : ''}</td><td>${row.quantity == null ? 'Не задано' : esc(num(row.quantity,8))+' '+esc(C.units[row.unit].label)}</td><td>${result.rows[i].massGrams == null ? 'Неизвестен' : esc(num(result.rows[i].massGrams))}</td>${showPrices ? `<td>${esc(money(result.rows[i].knownCost))}${result.rows[i].complete ? '' : ' (неполно)'}</td>` : ''}</tr>`).join('')}</tbody></table>
          ${KitchenPackagingUI.renderCard(state,recipe,viewPortions,showPrices)}
          <p>Общая масса ингредиентов: ${view.rawMass == null ? 'неизвестна — задайте коэффициенты массы' : esc(num(view.rawMass))+' г'}</p><p><strong>Выход готового блюда: ${view.yieldGrams == null ? 'неизвестен — уточните массу компонентов' : esc(num(view.yieldGrams))+' г'}</strong></p>
          ${showPrices ? `${(recipe.packaging || []).length ? `<p class="food-cost">Себестоимость ингредиентов: ${esc(money(result.knownCost))}${result.complete ? '' : ' (неполно)'}</p>` : ''}<p class="card-cost">${complete ? 'Общая себестоимость' : 'Известная часть стоимости (расчёт неполный)'}: ${esc(money(total))}</p>${(recipe.packaging || []).length ? `<p class="portion-cost">На одну порцию: ${esc(money(total/viewPortions))}${complete ? '' : ' (неполно)'}</p>` : ''}` : ''}
          ${recipe.technology?.trim() ? `<h2>Способ приготовления</h2><div class="card-text">${esc(recipe.technology)}</div>` : ''}${recipe.note?.trim() ? `<h2>Примечания</h2><div class="card-text">${esc(recipe.note)}</div>` : ''}`;
        $('#view-error').textContent = '';$('#print-recipe').disabled = false;
      } catch(e) {$('#view-error').textContent = e.message;$('#print-recipe').disabled = true;}
    }
    $('#view-portions').addEventListener('input',draw);
    $('#show-prices').addEventListener('change',e => {showPrices=e.target.value==='yes';draw();});
    $('#edit-recipe').addEventListener('click',() => {viewing=false;renderEditor();});
    $('#back-list').addEventListener('click',() => {selectedId=null;openSelected();$('#library-search').focus();});
    $('#print-recipe').addEventListener('click',() => window.print());
    draw();
  }
  function head(type, description) {
    return `<div class="editor-head"><div class="editor-topline"><span class="badge">${type}</span><span class="save-state" id="save-state">${dirty ? 'Не сохранено' : storageBlocked ? 'В памяти · скачайте JSON' : 'Сохранено в браузере'}</span></div><label><span class="sr-only">Название</span><input id="item-name" class="name-input" value="${esc(draft.name)}" placeholder="Введите название" maxlength="300"></label><p class="intro">${description}</p></div>`;
  }
  function actions(recipe) {
    return `<div class="form-actions">${recipe ? '<div id="mobile-summary" class="mobile-summary" aria-live="polite"></div>' : ''}${section === 'dish' ? '<button id="view-recipe">К карточке</button>' : ''}${recipe ? '<button id="add-row">+ Добавить продукт</button>' : ''}<button id="delete-item" class="danger">Удалить</button><button id="save-item" class="primary">Сохранить</button></div>`;
  }
  function bindCommon() {
    $('#item-name').addEventListener('input', e => { draft.name = e.target.value; markDirty(); });
    $('#save-item').addEventListener('click', saveDraft);
    $('#delete-item').addEventListener('click', deleteItem);
    $('#view-recipe')?.addEventListener('click', () => {if (!canLeave()) return; if(isNew) {selectedId = null;openSelected();return;} openSelected();});
  }
  function renderProduct() {
    editor.innerHTML = head('Справочник продуктов','Закупочная цена относится ко всей упаковке. Пустая цена означает «Нет цены».') + `<div class="editor-content"><div class="product-grid">
      <label class="full">Другие слова для поиска<input id="aliases" value="${esc(draft.aliases)}" placeholder="Например, картошка, картошечка"></label>
      <label>Закупочная цена, ₽${numericInput('price',draft.price,'Нет цены')}</label>
      <label>Количество в упаковке${numericInput('packQuantity',draft.packQuantity)}</label>
      <label>Единица упаковки<select id="product-unit">${unitOptions(draft.unit)}</select></label>
      </div><div id="base-price" class="base-price"></div>
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
    const price = C.productBasePrice(draft);
    const label = price.value == null ? 'Нет цены или количества упаковки' : `${money(price.value)} / ${C.units[price.unit].label}`;
    $('#base-price').innerHTML = `Цена за базовую единицу<strong>${esc(label)}</strong>${price.value !== null && price.unit === 'g' ? `<small>${money(price.value*1000)} / кг</small>` : ''}`;
    $('#form-error').textContent = [...errors.values()][0] || '';
  }
  function renderPackaging() {
    editor.innerHTML = head('Упаковка и фасовка','Введите любое название. Закупочная цена относится ко всему закупленному количеству. Этот справочник отделён от пищевых продуктов.') + `<div class="editor-content"><div class="product-grid">
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
    editor.innerHTML = head(section === 'prep' ? 'Полуфабрикат · партия' : 'Блюдо · рецептура',section === 'prep' ? 'Сырьё считается по закупочной стоимости. Себестоимость готового продукта зависит от фактического выхода партии.' : 'Выбирайте продукты и готовые полуфабрикаты. Их производственные потери уже учтены.') + `<div class="editor-content"><div class="section-heading"><h3>Ингредиенты</h3><small id="row-count"></small></div><div class="ingredient-head" aria-hidden="true"><span>Продукт / полуфабрикат</span><span>Количество</span><span>Ед.</span><span>Стоимость</span><span></span></div><div id="ingredients"></div>${section === 'dish' ? '<div id="packaging-editor"></div>' : ''}
      ${section === 'prep' ? `<div class="yield-panel"><div><h3>Фактический выход партии</h3><p>Взвесьте всю готовую партию. По этому значению рассчитывается себестоимость грамма и килограмма.</p></div><label>Выход готовой партии, г${numericInput('actualYield',draft.actualYield,'Обязательно')}</label></div>` : ''}
      ${section === 'dish' ? `<div class="product-grid recipe-note"><label>Количество порций в рецепте${numericInput('recipe-portions',draft.portions || 1)}</label><label>Фактический выход блюда, г (необязательно)${numericInput('dish-yield',draft.actualYield)}</label></div>` : ''}
      <label class="recipe-note">Способ приготовления<textarea id="technology" maxlength="10000">${esc(draft.technology)}</textarea></label>
      <details class="recipe-note" ${draft.note ? 'open' : ''}><summary>Заметка к рецепту</summary><textarea id="recipe-note" placeholder="Что нужно уточнить или учесть">${esc(draft.note)}</textarea></details><div id="summary" class="summary" aria-live="polite"></div><p id="form-error" class="inline-error" role="status"></p></div>` + actions(true);
    bindCommon(); renderRows();
    if (section === 'dish') packagingEditor = KitchenPackagingUI.mountEditor($('#packaging-editor'),{
      getState:()=>state,recipe:draft,uid,
      onChange:()=>{markDirty();updateRecipeSummary();},
      onError:(key,text)=>{if(text) errors.set(key,text);else errors.delete(key);}
    });
    $('#technology').addEventListener('input', e => {draft.technology = e.target.value;markDirty();});
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
  function findRef(id) { return state.products.find(p => p.id === id) || state.recipes.find(r => r.id === id); }
  function rawMass(row) {
    const product = state.products.find(p => p.id === row.refId);
    return product ? C.convertProductQuantity(product,row.quantity,row.unit,'g') : null;
  }
  function renderRows() {
    $('#row-count').textContent = draft.ingredients.length + ' поз.';
    $('#ingredients').innerHTML = draft.ingredients.map(row => {
      const ref = findRef(row.refId), prep = ref?.type === 'prep', processable = !prep && ['g','kg'].includes(row.unit);
      return `<div class="ingredient-row" data-row="${esc(row.id)}"><div class="autocomplete"><label><span class="sr-only">Продукт или полуфабрикат</span><input class="ingredient-search" id="search-${row.id}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="options-${row.id}" autocomplete="off" placeholder="Начните вводить название…" value="${esc(ref?.name || '')}"></label><div id="options-${row.id}" class="suggestions" role="listbox" hidden></div>${ref ? `<span class="ingredient-tag">${prep ? 'Полуфабрикат · готовая масса' : 'Продукт'}${ref.massPerPiece ? ' · '+esc(num(ref.massPerPiece))+' г/шт.' : ''}</span>` : ''}</div>
      <label><span>${prep ? 'Готовая масса' : 'Исходное кол-во'}</span>${numericInput('qty-'+row.id,row.quantity)}</label>
      <label><span>Ед.</span><select id="unit-${row.id}">${prep ? ['g','kg'].map(u => `<option value="${u}" ${row.unit === u ? 'selected' : ''}>${C.units[u].label}</option>`).join('') : unitOptions(row.unit)}</select></label>
      <div class="item-cost" id="cost-${row.id}"><span>Стоимость</span>—</div><button class="remove-row" aria-label="Удалить строку ${esc(ref?.name || 'ингредиента')}" title="Удалить строку">×</button>
      <details class="row-extra" ${row.note ? 'open' : ''}><summary>${prep ? 'Заметка' : 'Обработка и заметка'}${row.lossPercent != null ? ' · потери '+esc(num(row.lossPercent))+'%' : ''}</summary><div class="extra-grid">${processable ? `<label>Исходный вес, г<input id="raw-${row.id}" value="${esc(num(rawMass(row)))}" readonly tabindex="-1" placeholder="Масса неизвестна"></label><label>Потери, %${numericInput('loss-'+row.id,row.lossPercent,'Без потерь')}</label><label>Расчётный выход, г${numericInput('output-'+row.id,row.outputGrams,'По исходному весу')}</label>` : ''}<label class="note-field">Заметка<input id="note-${row.id}" value="${esc(row.note)}" placeholder="Например, уточнить количество"></label></div></details></div>`;
    }).join('');
    for (const row of draft.ingredients) bindRow(row);
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
      const combined = currentState();
      options = [...state.products,...state.recipes.filter(r => r.type === 'prep')].filter(item =>
        item.id !== draft.id && !C.wouldCreateCycle(combined,draft.id,item.id) &&
        (item.name+' '+(item.aliases || '')).toLocaleLowerCase('ru').includes(term));
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
    const result = C.calcRecipe(currentState(),draft.id);
    result.rows.forEach((r,i) => {
      const el = $('#cost-'+draft.ingredients[i].id);
      el.innerHTML = `<span>Стоимость</span>${r.complete ? esc(money(r.knownCost)) : r.knownCost > 0 ? esc(money(r.knownCost))+'*' : '—'}${!r.complete ? '<small>Неполно</small>' : ''}`;
    });
    const packaging = section === 'dish' ? P.calculate(currentState(),draft,draft.portions || 1) : {knownCost:0,complete:true,issues:[]};
    const total = result.knownCost + packaging.knownCost;
    const incomplete = !result.complete || !packaging.complete || errors.size > 0 || !Number.isFinite(total);
    packagingEditor?.refreshSummary();
    $('#mobile-summary').innerHTML = `<span>${incomplete ? 'Известная часть · неполно' : section === 'prep' ? 'Стоимость партии' : 'Себестоимость рецепта'}</span><strong>${esc(money(total))}</strong>`;
    const allIssues = [...errors.values(),...result.issues,...packaging.issues,...(!Number.isFinite(total) ? ['Слишком большая полная себестоимость.'] : [])];
    const summary = $('#summary');summary.className = 'summary'+(incomplete ? ' incomplete' : '');
    summary.innerHTML = `<div class="summary-top"><div><div class="summary-label">${incomplete ? 'Известная часть стоимости' : section === 'prep' ? 'Стоимость всей партии' : (draft.packaging || []).length ? 'Полная себестоимость рецепта' : 'Продуктовая себестоимость рецепта'}</div><div class="summary-value">${esc(money(total))}</div>${(draft.packaging || []).length ? `<p class="summary-breakdown">Ингредиенты: ${esc(money(result.knownCost))} · Упаковка: ${esc(money(packaging.knownCost))}<br>На одну порцию: ${esc(money(total/(draft.portions || 1)))}</p>` : ''}<div class="summary-meta">${section === 'prep' ? 'Фактический выход' : 'Расчётный выход рецепта'}: ${result.massGrams == null ? 'неизвестен — нужна масса всех компонентов' : esc(num(result.massGrams))+' г'}${section === 'prep' && !incomplete && result.costPerGram != null ? `<br>${esc(money(result.costPerGram))} / г · ${esc(money(result.costPerGram*1000))} / кг` : ''}</div></div><span class="summary-status">${incomplete ? 'Расчёт неполный' : 'Рассчитано'}</span></div>${incomplete ? `<ul class="issues">${[...new Set(allIssues)].map(s => `<li>${esc(s)}</li>`).join('')}</ul><p class="draft-note">Известная часть суммы не является полной продуктовой себестоимостью.</p>` : ''}`;
    $('#form-error').textContent = errors.size ? 'Исправьте ввод: '+[...errors.values()][0] : '';
  }
  function saveDraft() {
    if (!draft.name.trim()) {message('Введите название.',true);$('#item-name').focus();return false;}
    if (errors.size) {message('Исправьте ошибки в числовых полях перед сохранением.',true);editor.querySelector('[aria-invalid="true"]')?.focus();return false;}
    draft.name = draft.name.trim();
    const candidate = currentState();
    if(!persist(candidate,'Сохранено ✓. Связанные калькуляции пересчитаны.')) return false;
    selectedId = draft.id;dirty = false;isNew = false;
    $('#save-state').textContent = storageBlocked ? 'В памяти · скачайте JSON' : 'Сохранено в браузере';
    $('#save-item').textContent = storageBlocked ? 'Повторить сохранение' : 'Сохранено ✓';
    $('#save-item').classList.toggle('saved', !storageBlocked);
    renderLibrary();return true;
  }
  function deleteItem() {
    if(isNew) {selectedId = collection()[0]?.id || null;openSelected();return;}
    const uses = state.recipes.filter(r => (section === 'packaging' ? (r.packaging || []) : r.ingredients).some(row => row.refId === draft.id));
    if(uses.length) {message('Удаление невозможно: используется в рецептах «'+uses.map(r => r.name).join('», «')+'». Сначала замените '+(section === 'packaging' ? 'позицию упаковки' : 'ингредиент')+' в этих рецептах.',true);return;}
    if(!confirm('Удалить «'+draft.name+'»?')) return;
    const candidate = clone(state), key = isCatalog() ? section : 'recipes';
    candidate[key] = candidate[key].filter(item => item.id !== draft.id);
    if(persist(candidate,'Запись удалена.')) {selectedId = collection()[0]?.id || null;openSelected();}
  }
  $('#create').addEventListener('click',() => {
    if(!canLeave()) return;
    draft = section === 'products' ? {id:uid('product'),name:'',aliases:'',price:null,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''} : section === 'packaging' ? {id:uid('packaging'),name:'',price:null,packQuantity:1,unit:'pcs',note:''} : {id:uid(section),type:section,name:'',note:'',actualYield:null,ingredients:[]};
    viewing = false;selectedId = draft.id;dirty = true;isNew = true;errors.clear();invalidValues.clear();renderLibrary();renderEditor();$('#item-name').focus();
  });
  $('.brand').addEventListener('click', e => {e.preventDefault();if(canLeave()) {section = 'dish';selectedId = null;openSelected();}});
  $('[data-tab="dish"]').addEventListener('click',() => switchSection('dish'));
  $('[data-tab="prep"]').addEventListener('click',() => switchSection('prep'));
  $('[data-tab="products"]').addEventListener('click',() => switchSection('products'));
  $('[data-tab="packaging"]').addEventListener('click',() => switchSection('packaging'));
  $('#library-search').addEventListener('input',renderLibrary);
  $('#export').addEventListener('click',() => {
    if(dirty && !saveDraft()) return;
    try {
      const text = S.stringify(state), url = URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
      const link = document.createElement('a');link.href = url;link.download = 'kitchen-calculator-PR2-TEST-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
      message('JSON подготовлен к скачиванию. Сохраните файл для резервной копии.');
    } catch(e) {message('Экспорт не выполнен: '+e.message,true);}
  });
  $('#import').addEventListener('click',() => {$('#import-file').value = '';$('#import-file').click();});
  $('#import-file').addEventListener('change',async e => {
    const file = e.target.files[0];if(!file) return;
    try {
      if(file.size > 10*1024*1024) throw Error('Файл больше 10 МБ.');
      const candidate = S.parseJSON(await file.text());
      if(!confirm(`Заменить все текущие данные данными из файла? Продуктов: ${candidate.products.length}, рецептов: ${candidate.recipes.length}, позиций упаковки: ${(candidate.packaging || []).length}. Несохранённые изменения также будут заменены. Рекомендуем сначала сделать экспорт.`)) return;
      if(persist(candidate,'Данные импортированы. Все текущие записи заменены.',true)) {
        selectedId = collection()[0]?.id || null;openSelected();
      }
    } catch(e) {message('Импорт отменён: '+e.message+' Текущие данные не изменены.',true);}
  });
  window.addEventListener('beforeunload',e => {if(dirty || storageBlocked) {e.preventDefault();e.returnValue = '';}});
  openSelected();
  if(loaded.error) message('Не удалось прочитать сохранённые данные: '+loaded.error+' Исходная запись не перезаписана. Автоматическая запись заблокирована; восстановите данные через импорт резервной копии JSON.',true);
  else if(!loaded.data) {
    const saved = S.save(state);
    if(!saved.ok) {storageBlocked = true;if($('#save-state')) $('#save-state').textContent = 'В памяти · скачайте JSON';message('Браузер не разрешил сохранение: '+saved.error+' Скачивайте JSON перед закрытием страницы.',true);}
  }
})();
