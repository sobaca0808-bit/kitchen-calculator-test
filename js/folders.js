(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./storage.js'));
  else root.KitchenFolders = factory(root.KitchenStorage);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Storage) {
  'use strict';
  const folderName = Storage.folderName;
  const nameKey = name => folderName(name).toLocaleLowerCase('ru');
  const fail = message => { throw new Error(message); };
  function list(state) {
    if (!state || !Array.isArray(state.recipes) || (state.folders !== undefined && !Array.isArray(state.folders))) {
      fail('Не удалось прочитать библиотеку. Исходная база не изменена.');
    }
    return state.folders || [];
  }
  function find(state, id) {
    const folder = list(state).find(item => item.id === id);
    if (!folder) fail('Папка больше не существует. Выберите другую папку.');
    return folder;
  }
  function uniqueName(state, name, exceptId) {
    const normalized = folderName(name), key = nameKey(normalized);
    if (list(state).some(item => item.id !== exceptId && nameKey(item.name) === key)) {
      fail('Папка с названием «' + normalized + '» уже существует.');
    }
    return normalized;
  }
  function allIds(state) {
    return new Set([
      ...list(state), ...(state.products || []), ...(state.packaging || []), ...state.recipes,
      ...state.recipes.flatMap(recipe => [...(recipe.ingredients || []), ...(recipe.packaging || [])])
    ].map(item => item.id));
  }
  function create(state, id, name) {
    if (typeof id !== 'string' || id.length > 200 || !/^[A-Za-z0-9_-]+$/.test(id)) {
      fail('Некорректный идентификатор папки.');
    }
    if (allIds(state).has(id)) fail('Повторяющийся идентификатор: ' + id + '.');
    const normalized = uniqueName(state, name);
    return {...state, folders: [...list(state), {id, name: normalized}]};
  }
  function rename(state, id, name) {
    find(state, id);
    const normalized = uniqueName(state, name, id);
    return {...state, folders: list(state).map(item => item.id === id ? {...item, name: normalized} : item)};
  }
  function remove(state, id) {
    find(state, id);
    return {...state,
      folders: list(state).filter(item => item.id !== id),
      recipes: state.recipes.map(recipe => {
        if (recipe.type !== 'dish' || recipe.folderId !== id) return recipe;
        const {folderId, ...withoutFolder} = recipe;
        return withoutFolder;
      })
    };
  }
  function move(state, recipeId, folderId) {
    list(state);
    const recipe = state.recipes.find(item => item.id === recipeId && item.type === 'dish');
    if (!recipe) fail('Блюдо больше не существует. Откройте актуальную библиотеку.');
    if (folderId !== null && folderId !== '') find(state, folderId);
    const {folderId: previousFolder, ...withoutFolder} = recipe;
    const updated = folderId === null || folderId === '' ? withoutFolder : {...withoutFolder, folderId};
    return {...state, recipes: state.recipes.map(item => item.id === recipeId ? updated : item)};
  }
  return {folderName, nameKey, create, rename, remove, move};
});
