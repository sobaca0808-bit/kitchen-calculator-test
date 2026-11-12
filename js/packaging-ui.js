(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const num = (value, digits = 8) => value == null ? '' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,useGrouping:false}).format(value);
  const money = value => Number.isFinite(value) ? new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(value) : 'Значение слишком велико';
  const packaging = () => root.KitchenPackaging;
  const catalog = state => Array.isArray(state.packaging) ? state.packaging : [];
  const rows = recipe => Array.isArray(recipe.packaging) ? recipe.packaging : [];
  const portions = recipe => recipe.portions || 1;
  const unitLabel = unit => packaging().units[unit]?.label || unit || '';
  const mode = row => row.costMode || 'auto';
  function unitOptions(selected) {
    return Object.entries(packaging().units).map(([value,unit]) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(unit.label)}</option>`).join('');
  }
  function duplicateHint(row, result) {
    if (result.included) {
      return result.duplicate && mode(row) === 'auto'
        ? 'Позиция связана с пищевым ингредиентом блюда. Повторно в итог не добавляется. Для отдельной выдачи выберите «Дополнительно к ингредиентам».'
        : 'Отмечено как уже учтённое в ингредиентах. В этом разделе повторно не добавляется.';
    }
    return result.duplicate ? 'Связана с пищевым ингредиентом. Учтён дополнительный расход сверх состава блюда.' : '';
  }
  function mountEditor(host, options) {
    if (!host) throw Error('Не найден блок упаковки.');
    const {getState, recipe, onChange = () => {}, onError = () => {}, uid} = options;
    const invalid = new Map();
    const unitErrors = new Map();
    const find = selector => host.querySelector(selector);
    function error(key, message) {onError(key,message || null);}
    function currentResult() {return packaging().calculate(getState(),recipe,portions(recipe));}
    function selectedOptions(row) {
      const used = new Set(rows(recipe).filter(other => other.id !== row.id).map(other => other.refId).filter(Boolean));
      return '<option value="">Выберите позицию</option>' + catalog(getState()).map(item => `<option value="${esc(item.id)}" ${row.refId === item.id ? 'selected' : ''} ${used.has(item.id) ? 'disabled' : ''}>${esc(item.name)}${used.has(item.id) ? ' — уже добавлено' : ''}</option>`).join('');
    }
    function refreshChoices() {
      for (const row of rows(recipe)) {
        const used = new Set(rows(recipe).filter(other => other.id !== row.id).map(other => other.refId).filter(Boolean));
        const select = find('#pack-ref-'+row.id);
        for (const option of select?.options || []) if (option.value) option.disabled = used.has(option.value);
      }
    }
    function refreshSummary() {
      const result = currentResult();
      for (const [index,row] of rows(recipe).entries()) {
        const quantityLabel = find(`[data-packaging-row="${row.id}"] .packaging-row-total small`);
        if (quantityLabel) quantityLabel.textContent = 'На рецепт ('+num(portions(recipe))+' порц.)';
        const output = result.rows.find(item => item.id === row.id) || result.rows[index];
        if (!output) continue;
        const material = catalog(getState()).find(item => item.id === row.refId);
        const unit = find('#pack-unit-'+row.id);
        const unitMessage = material && packaging().convert(1,row.unit,material.unit) == null
          ? 'Единицы расхода и закупки несовместимы. Выберите совместимую единицу.' : '';
        if (unitMessage) unitErrors.set(row.id,unitMessage); else unitErrors.delete(row.id);
        error('pack-unit-'+row.id,unitMessage);
        if (unit) {
          unit.setCustomValidity(unitMessage);
          if (unitMessage) unit.setAttribute('aria-invalid','true'); else unit.removeAttribute('aria-invalid');
        }
        const cost = find('#pack-cost-'+row.id);
        if (cost) cost.textContent = invalid.has(row.id) ? 'Исправьте расход' : output.included ? 'Учтено в составе' : money(output.knownCost) + (output.complete ? '' : ' · неполно');
        const hint = duplicateHint(row,output);
        const issues = [...(output.issues || []),...(invalid.has(row.id) ? [invalid.get(row.id).message] : []),...(unitMessage ? [unitMessage] : [])];
        const note = find('#pack-hint-'+row.id);
        if (note) {
          note.innerHTML = [hint,...new Set(issues)].filter(Boolean).map(text => `<p>${esc(text)}</p>`).join('');
          note.hidden = !note.textContent;
        }
      }
      const incomplete = !result.complete || invalid.size > 0 || unitErrors.size > 0;
      const total = find('#packaging-subtotal');
      if (total) total.innerHTML = `<span>${incomplete ? 'Известная часть упаковки · расчёт неполный' : 'Упаковка на рецепт'}</span><strong>${esc(money(result.knownCost))}</strong><small>Количество порций: ${esc(num(portions(recipe)))}. Упаковка не входит в массу и выход еды.</small>`;
      const help = find('#packaging-catalog-help');
      if (help) help.hidden = catalog(getState()).length > 0;
      return result;
    }
    function notify() {refreshSummary();onChange();}
    function draw() {
      host.innerHTML = `<section class="packaging-panel" aria-labelledby="packaging-editor-title"><div class="section-heading"><h3 id="packaging-editor-title">Упаковка и фасовка</h3><button type="button" id="add-packaging-row">+ Добавить упаковку</button></div><p class="field-help">Расход укажите на одну порцию. Бесплатная выдача гостю также учитывается в себестоимости.</p><p id="packaging-catalog-help" class="field-help" ${catalog(getState()).length ? 'hidden' : ''}>Сначала добавьте позиции в справочник «Упаковка и фасовка». Здесь выбираются только его записи, отдельно от пищевых ингредиентов.</p><div class="packaging-rows">${rows(recipe).map(row => `<div class="packaging-row" data-packaging-row="${esc(row.id)}"><label class="packaging-material">Позиция из справочника<select id="pack-ref-${esc(row.id)}">${selectedOptions(row)}</select></label><div class="packaging-quantity-grid"><label>Расход на 1 порцию<input id="pack-qty-${esc(row.id)}" type="text" inputmode="decimal" autocomplete="off" value="${esc(invalid.has(row.id) ? invalid.get(row.id).raw : num(row.quantity))}" placeholder="Не задано"></label><label>Единица<select id="pack-unit-${esc(row.id)}">${unitOptions(row.unit)}</select></label></div><label class="packaging-checkbox"><input id="pack-free-${esc(row.id)}" type="checkbox" ${row.freeForGuest ? 'checked' : ''}>Бесплатно для гостя — закупочная стоимость учитывается</label><label>Как учитывать<select id="pack-mode-${esc(row.id)}"><option value="auto" ${mode(row) === 'auto' ? 'selected' : ''}>Авто: без двойного учёта</option><option value="additional" ${mode(row) === 'additional' ? 'selected' : ''}>Дополнительно к ингредиентам</option><option value="included" ${mode(row) === 'included' ? 'selected' : ''}>Уже учтено в ингредиентах</option></select></label><div class="packaging-row-total"><div><small>На рецепт (${esc(num(portions(recipe)))} порц.)</small><strong id="pack-cost-${esc(row.id)}" class="packaging-row-cost"></strong></div><button type="button" class="remove-packaging-row danger" aria-label="Удалить позицию упаковки">Удалить</button></div><div id="pack-hint-${esc(row.id)}" class="packaging-issues" role="status" hidden></div></div>`).join('')}</div><div id="packaging-subtotal" class="packaging-subtotal" aria-live="polite"></div></section>`;
      find('#add-packaging-row').addEventListener('click',() => {
        if (!Array.isArray(recipe.packaging)) recipe.packaging = [];
        const row = {id:uid('pack-row'),refId:null,quantity:null,unit:'pcs',freeForGuest:false,costMode:'auto'};
        recipe.packaging.push(row);draw();notify();find('#pack-ref-'+row.id)?.focus();
      });
      for (const row of rows(recipe)) {
        const container = find(`[data-packaging-row="${row.id}"]`);
        const quantity = find('#pack-qty-'+row.id);
        if (invalid.has(row.id)) {
          quantity.setAttribute('aria-invalid','true');quantity.setCustomValidity(invalid.get(row.id).message);
        }
        quantity.addEventListener('input',() => {
          try {
            const value = root.KitchenCalc.parseNumber(quantity.value);
            if (value !== null && value <= 0) throw Error('Расход должен быть больше нуля.');
            row.quantity = value;invalid.delete(row.id);quantity.removeAttribute('aria-invalid');quantity.setCustomValidity('');error(quantity.id,null);
          } catch(failure) {
            invalid.set(row.id,{raw:quantity.value,message:failure.message});quantity.setAttribute('aria-invalid','true');quantity.setCustomValidity(failure.message);error(quantity.id,failure.message);
          }
          notify();
        });
        find('#pack-ref-'+row.id).addEventListener('change',event => {
          row.refId = event.target.value || null;
          delete row.ingredientRefId;
          const material = catalog(getState()).find(item => item.id === row.refId);
          if (material) {row.unit = material.unit;find('#pack-unit-'+row.id).value = row.unit;}
          refreshChoices();notify();
        });
        find('#pack-unit-'+row.id).addEventListener('change',event => {row.unit = event.target.value;notify();});
        find('#pack-free-'+row.id).addEventListener('change',event => {row.freeForGuest = event.target.checked;notify();});
        find('#pack-mode-'+row.id).addEventListener('change',event => {row.costMode = event.target.value;notify();});
        container.querySelector('.remove-packaging-row').addEventListener('click',() => {
          recipe.packaging = rows(recipe).filter(item => item.id !== row.id);
          invalid.delete(row.id);unitErrors.delete(row.id);error('pack-qty-'+row.id,null);error('pack-unit-'+row.id,null);
          draw();notify();find('#add-packaging-row')?.focus();
        });
      }
      refreshSummary();
    }
    draw();
    return {refreshSummary};
  }
  function renderCard(state,recipe,count,showPrices) {
    if (!rows(recipe).length) return '';
    const result = packaging().calculate(state,recipe,count);
    const notes = (source,output) => [
      source.freeForGuest ? 'Бесплатно для гостя' : '',
      output.included ? 'Учтено в составе' : '',
      output.duplicate && !output.included ? 'Отдельная выдача сверх состава' : ''
    ].filter(Boolean).map(note => `<small class="packaging-card-note">${esc(note)}</small>`).join('');
    return `<section class="packaging-card" aria-label="Упаковка и фасовка"><h2>Упаковка и фасовка</h2><p class="field-help">Расход на ${esc(num(count))} порц. Упаковка не входит в выход еды.</p><table><thead><tr><th>Позиция</th><th>Количество</th>${showPrices ? '<th class="packaging-finance">Цена единицы</th><th class="packaging-finance">Сумма</th>' : ''}</tr></thead><tbody>${rows(recipe).map((source,index) => {
      const output = result.rows.find(item => item.id === source.id) || result.rows[index];
      if (!output) return '';
      const material = catalog(state).find(item => item.id === source.refId);
      const price = material ? packaging().basePrice(material) : {value:null,unit:null};
      return `<tr data-packaging-card-row="${esc(source.id)}"><td>${esc(output.name || material?.name || 'Позиция не выбрана')}${notes(source,output)}${showPrices && output.issues?.length ? `<div class="packaging-issues">${output.issues.map(issue=>esc(issue)).join('<br>')}</div>` : ''}</td><td>${output.quantity == null ? 'Не задано' : esc(num(output.quantity))+' '+esc(unitLabel(output.unit || source.unit))}</td>${showPrices ? `<td class="packaging-finance">${price.value == null ? 'Нет цены' : esc(money(price.value))+' / '+esc(unitLabel(price.unit))}</td><td class="packaging-finance">${output.included ? 'Учтено в составе' : esc(money(output.knownCost))+(output.complete ? '' : ' (неполно)')}</td>` : ''}</tr>`;
    }).join('')}</tbody></table>${showPrices ? `<p class="packaging-subtotal packaging-finance">${result.complete ? 'Итого упаковка и фасовка' : 'Известная часть упаковки (расчёт неполный)'}: <strong>${esc(money(result.knownCost))}</strong></p>` : ''}</section>`;
  }
  root.KitchenPackagingUI = {mountEditor,renderCard};
})(typeof globalThis !== 'undefined' ? globalThis : this);
