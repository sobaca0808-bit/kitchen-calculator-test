(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./storage.js') : root.KitchenStorage,
    node ? require('node:crypto').webcrypto : root.crypto);
  if (node) module.exports = api;
  else root.KitchenJSONMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Storage, crypto) {
  'use strict';

  // This module only plans. It never reads storage, stores photos or applies data.
  const KINDS = ['folder', 'product', 'packaging', 'prep', 'dish'];
  const ROOT_FIELDS = new Set(['version', 'products', 'recipes', 'packaging', 'folders']);
  const FIELDS = {
    folder: new Set(['id', 'name']),
    product: new Set(['id', 'name', 'aliases', 'price', 'packQuantity', 'unit', 'massPerPiece', 'gramsPerMl', 'note']),
    packaging: new Set(['id', 'name', 'price', 'packQuantity', 'unit', 'note']),
    recipe: new Set(['id', 'type', 'name', 'note', 'folderId', 'portions', 'technology', 'sellingPrice', 'actualYield', 'photoId', 'photoIds', 'photo', 'photos', 'ingredients', 'packaging']),
    ingredient: new Set(['id', 'refId', 'quantity', 'unit', 'lossPercent', 'outputGrams', 'note']),
    material: new Set(['id', 'refId', 'ingredientRefId', 'quantity', 'unit', 'freeForGuest', 'costMode']),
    photo: new Set(['dataUrl', 'width', 'height', 'mime'])
  };
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const nameKey = value => String(value).normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru');
  const kindOf = recipe => recipe.type === 'prep' ? 'prep' : 'dish';
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  async function hash(value) {
    if (!crypto?.subtle) throw Error('Для безопасного сравнения данных требуется современный браузер с Web Crypto.');
    const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function entities(data) {
    return [
      ...(data.folders || []).map(value => ({kind: 'folder', value})),
      ...data.products.map(value => ({kind: 'product', value})),
      ...(data.packaging || []).map(value => ({kind: 'packaging', value})),
      ...data.recipes.map(value => ({kind: kindOf(value), value}))
    ];
  }
  function semantic(kind, value) {
    const {id, ...result} = value;
    if (kind === 'prep' || kind === 'dish') {
      result.ingredients = value.ingredients.map(({id: rowId, ...row}) => row);
      if (value.packaging !== undefined) result.packaging = value.packaging.map(({id: rowId, ...row}) => row);
      // A one-photo legacy record and the equivalent slot array denote the same photos.
      delete result.photo; delete result.photos;
      const slots = value.photos || (value.photo ? [value.photo] : []);
      if (slots.some(Boolean)) result.photos = [slots[0] || null, slots[1] || null];
    }
    return result;
  }
  function portable(data) {
    for (const recipe of data.recipes) {
      if (recipe.photoId !== undefined || recipe.photoIds !== undefined) {
        throw Error('Перед сравнением нужно прочитать фотографии с устройства. Используйте переносимый JSON со встроенными фотографиями.');
      }
    }
    return data;
  }
  function orderedRecipes(data) {
    const byId = new Map(data.recipes.filter(item => item.type === 'prep').map(item => [item.id, item]));
    const done = new Set(), result = [];
    function visit(recipe) {
      if (done.has(recipe.id)) return;
      done.add(recipe.id);
      for (const row of recipe.ingredients) if (byId.has(row.refId)) visit(byId.get(row.refId));
      result.push(recipe);
    }
    for (const recipe of byId.values()) visit(recipe);
    return result.concat(data.recipes.filter(item => item.type === 'dish'));
  }
  function unknownFields(data) {
    const values = [];
    function collect(value, known, prefix) {
      for (const [key, item] of Object.entries(value)) if (!known.has(key)) values.push({path: prefix + '.' + key, value: item});
    }
    collect(data, ROOT_FIELDS, 'data');
    for (const {kind, value} of entities(data)) {
      const path = kind + ':' + value.id;
      collect(value, kind === 'prep' || kind === 'dish' ? FIELDS.recipe : FIELDS[kind], path);
      for (const [key, known] of [['ingredients', FIELDS.ingredient], ['packaging', FIELDS.material]]) {
        if (kind === 'prep' || kind === 'dish') for (const row of value[key] || []) collect(row, known, path + '.' + key + ':' + row.id);
      }
      if (kind === 'prep' || kind === 'dish') {
        for (const [index, photo] of (value.photos || (value.photo ? [value.photo] : [])).entries()) {
          if (photo) collect(photo, FIELDS.photo, path + '.photos[' + index + ']');
        }
      }
    }
    return values;
  }
  async function plan(current, imported, options = {}) {
    const base = portable(Storage.validate(current)), incoming = portable(Storage.validate(imported));
    Storage.stringify(base); Storage.stringify(incoming);
    const mode = options.mode || 'merge';
    if (!['merge', 'replace'].includes(mode)) throw Error('Выберите «Объединить» или «Заменить базу».');
    const choices = options.choices || {};
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw Error('Некорректные решения конфликтов.');
    const rows = [], conflicts = [], warnings = [];
    const changes = {added: 0, updated: 0, skipped: 0, removed: 0, conflicts: 0};
    const byType = Object.fromEntries([...KINDS, 'extension'].map(kind => [kind, {added: 0, updated: 0, skipped: 0, removed: 0}]));
    function record(kind, value, action, reason, targetId = value.id) {
      changes[action]++; byType[kind][action]++;
      rows.push({kind, id: value.id || null, name: value.name || value.id || '', action, reason, targetId: targetId ?? null});
    }
    function conflict(kind, value, local, reason, allowed = ['local', 'both']) {
      const key = kind + ':' + value.id;
      const selected = has(choices, key) ? choices[key] : null;
      if (selected !== null && !allowed.includes(selected)) throw Error('Недопустимое решение конфликта «' + (value.name || value.id) + '».');
      conflicts.push({key, kind, id: value.id, name: value.name || value.id, local, incoming: value,
        reason, options: allowed, choice: selected, resolved: selected !== null});
      // The safe provisional copy exposes affected descendant conflicts in the same preview.
      return selected || (allowed.includes('both') ? 'both' : 'local');
    }
    if (mode === 'replace') {
      const before = new Map(entities(base).map(entry => [entry.kind + ':' + entry.value.id, entry]));
      const after = new Set();
      for (const entry of entities(incoming)) {
        const key = entry.kind + ':' + entry.value.id, previous = before.get(key); after.add(key);
        const action = !previous ? 'added' : canonical(previous.value) === canonical(entry.value) ? 'skipped' : 'updated';
        record(entry.kind, entry.value, action, action === 'skipped' ? 'Такая запись уже сохранена.' : 'Будет использована версия из выбранного файла.');
      }
      for (const [key, entry] of before) if (!after.has(key)) record(entry.kind, entry.value, 'removed', 'При замене базы запись отсутствует в выбранном файле.');
      for (const key of new Set([...Object.keys(base), ...Object.keys(incoming)])) if (!ROOT_FIELDS.has(key)) {
        const action = !has(incoming, key) ? 'removed' : !has(base, key) ? 'added'
          : canonical(base[key]) === canonical(incoming[key]) ? 'skipped' : 'updated';
        record('extension', {id: key, name: key}, action, action === 'removed'
          ? 'При замене базы дополнительное поле отсутствует в выбранном файле.'
          : 'Дополнительное поле будет взято из выбранного файла.');
      }
      return {mode, ready: true, unresolved: 0, data: incoming, conflicts, changes, byType, rows, warnings, errors: [], idMap: {}};
    }

    const data = {...base, products: [...base.products], recipes: [...base.recipes]};
    if (incoming.folders !== undefined || base.folders !== undefined) data.folders = [...(base.folders || [])];
    if (incoming.packaging !== undefined || base.packaging !== undefined) data.packaging = [...(base.packaging || [])];
    const ids = new Map(), idMap = new Map(), index = new Map(), byName = new Map(), copyAliases = new Map();
    for (const kind of KINDS) {index.set(kind, new Map()); byName.set(kind, new Map());}
    function list(kind) {
      if (kind === 'folder') return data.folders;
      if (kind === 'product') return data.products;
      if (kind === 'packaging') return data.packaging;
      return data.recipes;
    }
    async function addIndex(kind, value) {
      ids.set(value.id, {kind, value});
      const alias = value.id.match(/^(merge-(?:folder|product|packaging|prep|dish)-[a-f0-9]{32})(?:-(\d+))?$/);
      if (alias) {
        if (!copyAliases.has(alias[1])) copyAliases.set(alias[1], []);
        copyAliases.get(alias[1]).push({kind, value, attempt: Number(alias[2] || 0)});
      }
      if (kind === 'prep' || kind === 'dish') {
        for (const row of [...value.ingredients, ...(value.packaging || [])]) ids.set(row.id, {kind: 'row', value: row});
      }
      const key = await hash(semantic(kind, value));
      if (!index.get(kind).has(key)) index.get(kind).set(key, []);
      index.get(kind).get(key).push(value);
      const name = nameKey(value.name);
      if (!byName.get(kind).has(name)) byName.get(kind).set(name, []);
      byName.get(kind).get(name).push(value);
    }
    for (const {kind, value} of entities(base)) await addIndex(kind, value);
    async function equalSemantic(kind, left, right) {
      return canonical(semantic(kind, left)) === canonical(semantic(kind, right));
    }
    function mapRows(source, target) {
      if (!['prep', 'dish'].includes(source.type)) return;
      for (const key of ['ingredients', 'packaging']) if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        source[key].forEach((row, i) => {if (target[key][i]) idMap.set(row.id, target[key][i].id);});
      }
    }
    async function copyIdentity(kind, value, signature) {
      const fingerprint = await hash(['copy-v1', kind, value.id, signature]);
      const baseId = 'merge-' + kind + '-' + fingerprint.slice(0, 32);
      function candidate(attempt) {
        const id = baseId + (attempt ? '-' + attempt : '');
        const suffix = ' (импорт ' + fingerprint.slice(0, 6) + (attempt ? '-' + attempt : '') + ')';
        let prefix = value.name.slice(0, (kind === 'folder' ? 120 : 500) - suffix.length);
        if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
        const name = prefix + suffix;
        return {...value, id, name};
      }
      // Check every existing numbered alias before using a gap left by cleanup.
      // The original record may already have been removed; its previous copy still counts.
      for (const previous of (copyAliases.get(baseId) || []).slice().sort((a, b) => a.attempt - b.attempt)) {
        if (previous.kind === kind && await equalSemantic(kind, previous.value, candidate(previous.attempt))) return {value: previous.value, reused: true};
      }
      for (let attempt = 0; attempt < 10000; attempt++) {
        const next = candidate(attempt);
        if (ids.has(next.id) || byName.get(kind).has(nameKey(next.name))) continue;
        return {value: next, reused: false};
      }
      throw Error('Слишком много коллизий идентификаторов. Исходная база не изменена.');
    }
    async function assignRows(recipe) {
      const changed = {...recipe};
      for (const key of ['ingredients', 'packaging']) if (Array.isArray(recipe[key])) {
        changed[key] = [];
        for (let i = 0; i < recipe[key].length; i++) {
          const row = recipe[key][i]; let id = row.id;
          if (ids.has(id)) {
            const fingerprint = await hash(['row-v1', recipe.id, key, i, row.id]);
            let attempt = 0;
            do {id = 'merge-row-' + fingerprint.slice(0, 32) + (attempt ? '-' + attempt : '');attempt++;} while (ids.has(id));
          }
          const updated = {...row, id};ids.set(id, {kind: 'row', value: updated});idMap.set(row.id, id);changed[key].push(updated);
        }
      }
      return changed;
    }
    function transform(value) {
      const transformed = {...value}, missing = [];
      function reference(id) {
        if (id === null) return null;
        if (!idMap.has(id) || idMap.get(id) === null) {missing.push(id);return id;}
        return idMap.get(id);
      }
      if (value.folderId !== undefined) transformed.folderId = reference(value.folderId);
      if (value.ingredients) transformed.ingredients = value.ingredients.map(row => ({...row, refId: reference(row.refId)}));
      if (Array.isArray(value.packaging)) transformed.packaging = value.packaging.map(row => ({...row, refId: reference(row.refId),
        ...(row.ingredientRefId !== undefined && idMap.has(row.ingredientRefId) ? {ingredientRefId: idMap.get(row.ingredientRefId) ?? row.ingredientRefId} : {})}));
      return {value: transformed, missing: [...new Set(missing)]};
    }
    async function mergeOne(kind, original) {
      const transformed = kind === 'prep' || kind === 'dish' ? transform(original) : {value: {...original}, missing: []};
      const value = transformed.value;
      if (transformed.missing.length) {
        idMap.set(original.id, null);
        record(kind, original, 'skipped', 'Пропущена связанная импортируемая запись: недоступны ' + transformed.missing.join(', ') + '.', null);return;
      }
      const signature = await hash(semantic(kind, value));
      const sameId = ids.get(value.id);
      if (sameId?.kind === kind && await equalSemantic(kind, sameId.value, value)) {
        idMap.set(original.id, sameId.value.id);mapRows(original, sameId.value);record(kind, original, 'skipped', 'Такая запись уже сохранена.', sameId.value.id);return;
      }
      const sameContent = index.get(kind).get(signature) || [];
      for (const existing of sameContent) if (await equalSemantic(kind, existing, value)) {
        idMap.set(original.id, existing.id);mapRows(original, existing);record(kind, original, 'skipped', 'Полное содержимое уже сохранено под другим ID.', existing.id);return;
      }
      const sameName = byName.get(kind).get(nameKey(value.name))?.[0];
      const copy = await copyIdentity(kind, value, signature);
      if (copy.reused) {
        idMap.set(original.id, copy.value.id);mapRows(original, copy.value);record(kind, original, 'skipped', 'Эта импортированная версия уже сохранена.', copy.value.id);return;
      }
      if (sameId || sameName) {
        const local = sameId?.value || sameName;
        const reason = sameId ? sameId.kind !== kind
          ? 'ID занят записью другого типа. Для импортируемой версии нужен новый ID.'
          : 'Одинаковый ID, но различается содержимое или связанные компоненты.'
          : 'Одинаковое название не подтверждает совпадение: содержимое различается.';
        const decision = conflict(kind, value, local, reason);
        if (decision === 'local') {
          const target = sameId?.kind === kind ? sameId.value : !sameId ? sameName : null;
          idMap.set(original.id, target?.id || null);record(kind, original, 'skipped', 'По вашему выбору сохранена текущая версия.', target?.id || null);return;
        }
        let added = copy.value;
        if (kind === 'prep' || kind === 'dish') added = await assignRows(added);
        list(kind).push(added);await addIndex(kind, added);idMap.set(original.id, added.id);
        record(kind, original, 'added', 'Обе версии сохраняются; у импортируемой версии новые название и ID.', added.id);return;
      }
      let added = value;
      if (kind === 'prep' || kind === 'dish') added = await assignRows(value);
      list(kind).push(added);await addIndex(kind, added);idMap.set(original.id, added.id);
      record(kind, original, 'added', 'Новая запись из файла.', added.id);
    }
    for (const folder of incoming.folders || []) await mergeOne('folder', folder);
    for (const product of incoming.products) await mergeOne('product', product);
    for (const material of incoming.packaging || []) await mergeOne('packaging', material);
    for (const recipe of orderedRecipes(incoming)) await mergeOne(kindOf(recipe), recipe);
    for (const [key, value] of Object.entries(incoming)) if (!ROOT_FIELDS.has(key)) {
      if (!has(base, key)) {data[key] = value;record('extension', {id: key, name: key}, 'added', 'Дополнительное поле из файла сохранено.');}
      else if (canonical(base[key]) === canonical(value)) record('extension', {id: key, name: key}, 'skipped', 'Дополнительное поле уже сохранено.');
      else {
        const decision = conflict('extension', {id: key, name: key, value}, {value: base[key]}, 'Дополнительное поле различается. Выберите его версию.', ['local', 'incoming']);
        if (decision === 'incoming') {data[key] = value;record('extension', {id: key, name: key}, 'updated', 'Явно выбрана версия дополнительного поля из файла.');}
        else record('extension', {id: key, name: key}, 'skipped', 'Сохранено текущее дополнительное поле.');
      }
    }
    let opaqueCount = 0;
    function scan(value, path) {
      if (typeof value === 'string' && idMap.has(value) && idMap.get(value) !== value) {
        opaqueCount++;
        if (warnings.length < 50) warnings.push({kind: 'opaque-reference', path,
          text: 'Дополнительное поле ' + path + ' содержит прежний ID ' + value + '. Поле сохранено без изменения: назначение неизвестных ссылок нельзя определить автоматически.'});
      } else if (Array.isArray(value)) value.forEach((item, i) => scan(item, path + '[' + i + ']'));
      else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) scan(item, path + '.' + key);
    }
    for (const field of unknownFields(incoming)) scan(field.value, field.path);
    if (opaqueCount > 50) warnings.push({kind: 'opaque-reference', text: 'Ещё дополнительных полей со старыми ID: ' + (opaqueCount - 50) + '.'});
    changes.conflicts = conflicts.length;
    const unresolved = conflicts.filter(item => !item.resolved).length;
    let clean = null; const errors = [];
    // A complete prospective database is validated even for the preview; invalid combinations
    // never become a plan that could later be applied without checking all links again.
    try {
      const validated = Storage.validate(data); Storage.stringify(validated);
      if (!unresolved) clean = validated;
    } catch (error) {errors.push(error.message);}
    return {mode, ready: unresolved === 0 && errors.length === 0, unresolved, data: clean, conflicts, changes, byType, rows, warnings, errors,
      idMap: Object.fromEntries(idMap)};
  }
  return {plan, canonical};
});
