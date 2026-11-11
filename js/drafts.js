(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenDrafts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Drafts never share a key or a write operation with the saved recipe database.
  const KEY = 'kitchen-calculator-pr2-browser-drafts-v1';
  const MAX_DRAFT_BYTES = 1024 * 1024;
  const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
  const TYPES = ['dish', 'prep'];
  const fail = message => { throw new Error(message); };
  const bytes = value => typeof TextEncoder === 'function'
    ? new TextEncoder().encode(value).length : value.length * 2;
  const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

  // Copy JSON values without invoking toJSON or copying prototype setters. Unknown
  // recipe fields remain available for future editor versions and backup formats.
  function copyJSON(value) {
    let nodes = 0;
    function visit(item, depth) {
      if (++nodes > 100000 || depth > 100) fail('Черновик слишком сложный.');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (Array.isArray(item)) return item.map(entry => visit(entry, depth + 1));
      if (!plain(item)) fail('Черновик содержит данные, которые нельзя сохранить в JSON.');
      const result = {};
      for (const key of Reflect.ownKeys(item)) {
        if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) {
          fail('Черновик содержит недопустимое служебное поле.');
        }
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          fail('Черновик содержит неподдерживаемое поле.');
        }
        result[key] = visit(descriptor.value, depth + 1);
      }
      return result;
    }
    return visit(value, 0);
  }
  function validate(record) {
    if (!plain(record) || !identifier(record.id) || !TYPES.includes(record.type)) fail('Некорректный идентификатор или тип черновика.');
    if (typeof record.isNew !== 'boolean') fail('Некорректный признак нового рецепта.');
    const result = copyJSON(record);
    const recipe = result.data;
    if (!plain(recipe) || recipe.id !== result.id || recipe.type !== result.type || !Array.isArray(recipe.ingredients)) {
      fail('Черновик не соответствует своему рецепту.');
    }
    if (typeof recipe.name !== 'string') fail('В черновике отсутствует название рецепта.');
    for (const field of ['invalidValues', 'errors', 'formValues', 'details']) {
      if (result[field] === undefined) result[field] = [];
      if (!Array.isArray(result[field])) fail('Некорректный список полей черновика: ' + field + '.');
    }
    for (const field of ['invalidValues', 'errors']) {
      for (const entry of result[field]) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
          fail('Некорректное сохранённое значение поля черновика.');
        }
      }
    }
    for (const field of result.formValues) {
      if (!plain(field) || typeof field.id !== 'string' || typeof field.value !== 'string' ||
          (field.checked !== undefined && typeof field.checked !== 'boolean')) {
        fail('Некорректное содержимое формы черновика.');
      }
    }
    for (const detail of result.details) {
      if (!plain(detail) || !Number.isSafeInteger(detail.index) || detail.index < 0 || typeof detail.open !== 'boolean') {
        fail('Некорректное состояние раздела формы черновика.');
      }
    }
    if (result.updatedAt === undefined) result.updatedAt = Date.now();
    if (!Number.isSafeInteger(result.updatedAt) || result.updatedAt < 0) fail('Некорректная дата черновика.');
    if (bytes(JSON.stringify(result)) > MAX_DRAFT_BYTES) fail('Черновик больше 1 МБ. Уменьшите объём текста.');
    return result;
  }
  function getStorage(explicit) {
    if (explicit !== undefined) return explicit;
    if (typeof globalThis.localStorage === 'undefined') fail('Локальное хранилище недоступно.');
    return globalThis.localStorage;
  }
  function read(storage) {
    const source = storage.getItem(KEY);
    if (source === null) return [];
    if (typeof source !== 'string' || bytes(source) > MAX_TOTAL_BYTES) fail('Хранилище черновиков больше 5 МБ или повреждено.');
    let envelope;
    try { envelope = JSON.parse(source); }
    catch (_) { fail('Не удалось прочитать JSON черновиков.'); }
    if (!plain(envelope) || envelope.version !== 1 || !Array.isArray(envelope.items)) fail('Неизвестный формат черновиков.');
    const identities = new Set();
    return envelope.items.map(record => {
      const clean = validate(record), identity = clean.type + ':' + clean.id;
      if (identities.has(identity)) fail('Повторяющийся черновик рецепта.');
      identities.add(identity);
      return clean;
    });
  }
  function message(error) {
    return (error && typeof error.message === 'string' ? error.message : String(error)) +
      ' Сохранённая база рецептов не изменена.';
  }
  function load(storage) {
    try { return {items: read(getStorage(storage)), error: null}; }
    catch (error) { return {items: [], error: 'Не удалось загрузить черновики: ' + message(error)}; }
  }
  function write(items, storage) {
    const source = JSON.stringify({version: 1, items});
    if (bytes(source) > MAX_TOTAL_BYTES) fail('Для черновиков требуется больше 5 МБ. Удалите ненужные черновики.');
    // A single atomic setItem preserves the previous value on a quota failure.
    storage.setItem(KEY, source);
    return {ok: true, error: null};
  }
  function save(record, storage) {
    try {
      const clean = validate(record), target = getStorage(storage), items = read(target);
      const index = items.findIndex(item => item.id === clean.id && item.type === clean.type);
      if (index === -1) items.push(clean);
      else items[index] = clean;
      return write(items, target);
    } catch (error) { return {ok: false, error: 'Не удалось сохранить черновик: ' + message(error)}; }
  }
  function remove(id, type, storage) {
    try {
      if (!identifier(id) || !TYPES.includes(type)) fail('Укажите идентификатор и тип удаляемого черновика.');
      const target = getStorage(storage), items = read(target);
      const remaining = items.filter(item => item.id !== id || item.type !== type);
      if (remaining.length === items.length) return {ok: true, error: null};
      return write(remaining, target);
    } catch (error) { return {ok: false, error: 'Не удалось удалить черновик: ' + message(error)}; }
  }
  return {KEY, MAX_DRAFT_BYTES, MAX_TOTAL_BYTES, load, save, remove};
});
