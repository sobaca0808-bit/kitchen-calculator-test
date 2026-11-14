(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./storage.js') : root.KitchenStorage,
    typeof module === 'object' && module.exports ? require('./photos.js') : root.KitchenPhotos);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenImportTransaction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, defaultPhotos) {
  'use strict';

  const DB_NAME = 'kitchen-calculator-test-import-backups-v1';
  const LOCK_NAME = S.KEY + ':import';
  const KEEP_BACKUPS = 3;
  const MAX_DRAFT_BYTES = 5 * 1024 * 1024;
  const PHOTO_FIELDS = ['photo', 'photos', 'photoId', 'photoIds'];
  const PHOTO_KEYS = new Set(['dataUrl', 'width', 'height', 'mime']);
  const bytes = value => new TextEncoder().encode(value).length;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw Error(message); };
  const uid = () => 'backup-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function metadata(record) {
    return {id: record.id, createdAt: record.createdAt, mode: record.mode, bytes: record.bytes,
      products: record.products, recipes: record.recipes, folders: record.folders};
  }
  function backupStore(indexedDB = globalThis.indexedDB) {
    let connection;
    function open() {
      if (connection) return connection;
      connection = new Promise((resolve, reject) => {
        if (!indexedDB) {reject(Error('Хранилище резервных копий IndexedDB недоступно. Импорт не выполнен.'));return;}
        let request, settled = false;
        try {request = indexedDB.open(DB_NAME, 1);} catch (error) {reject(error);return;}
        const timer = setTimeout(()=>{settled=true;reject(Error('Не удалось открыть резервные копии. Закройте другие вкладки калькулятора и повторите.'));},8000);
        request.onupgradeneeded = () => {
          for (const name of ['backups', 'metadata']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name,{keyPath:'id'});
        };
        request.onerror = () => {clearTimeout(timer);if(settled)return;settled=true;reject(request.error || Error('Не удалось открыть резервные копии.'));};
        request.onblocked = () => {clearTimeout(timer);if(settled)return;settled=true;reject(Error('Хранилище резервных копий занято другой вкладкой.'));};
        request.onsuccess = () => {
          clearTimeout(timer);const db = request.result;
          if (settled) {db.close();return;}
          settled=true;db.onversionchange=()=>{db.close();connection=null;};resolve(db);
        };
      }).catch(error=>{connection=null;throw error;});
      return connection;
    }
    async function operation(stores, mode, action) {
      const db = await open();
      return new Promise((resolve,reject)=>{
        let tx, request;
        try {tx=db.transaction(stores,mode);request=action(tx);} catch(error){
          // A synchronous failure on the metadata write must also abort the
          // already queued full-record write in this same transaction.
          try {tx?.abort();} catch (_) {}
          reject(error);return;
        }
        tx.oncomplete=()=>resolve(request?.result);
        tx.onerror=tx.onabort=()=>reject(tx.error || request?.error || Error('Не удалось сохранить резервную копию. Возможно, в браузере недостаточно места.'));
      });
    }
    return {
      put: record=>operation(['backups','metadata'],'readwrite',tx=>{
        tx.objectStore('backups').add(record);
        return tx.objectStore('metadata').add(metadata(record));
      }),
      get: id=>operation(['backups'],'readonly',tx=>tx.objectStore('backups').get(id)),
      list: ()=>operation(['metadata'],'readonly',tx=>tx.objectStore('metadata').getAll()),
      remove: id=>operation(['backups','metadata'],'readwrite',tx=>{
        tx.objectStore('backups').delete(id);
        return tx.objectStore('metadata').delete(id);
      })
    };
  }
  // Photos have their own binary format. Unknown metadata would be discarded by
  // its existing importer, so refuse it explicitly rather than silently losing it.
  function checkPhotoExtensions(data) {
    for (const recipe of data.recipes) {
      const photos = recipe.photo ? [recipe.photo] : recipe.photos || [];
      for (const photo of photos) if (photo) {
        const unknown = Object.keys(photo).filter(key=>!PHOTO_KEYS.has(key));
        if (unknown.length) fail('У фотографии «'+recipe.name+'» есть неподдерживаемые поля ('+unknown.join(', ')+'). Импорт отменён без потери этих данных.');
      }
    }
  }
  function photoSlots(recipe) {
    const slots = recipe.photo ? [recipe.photo] : recipe.photos || [];
    return [slots[0] || null, slots[1] || null];
  }
  function localSlots(recipe) {
    const slots = recipe.photoId ? [recipe.photoId] : recipe.photoIds || [];
    return [slots[0] || null, slots[1] || null];
  }
  function comparablePortable(data) {
    const copy = clone(data);
    for (const recipe of copy.recipes) {
      const slots = photoSlots(recipe);
      for (const field of PHOTO_FIELDS) delete recipe[field];
      if (slots.some(Boolean)) recipe.photos = slots;
    }
    return canonical(copy);
  }
  function create(options = {}) {
    // A privacy setting can make the localStorage getter itself throw. Creating
    // the backup service or listing independent IDB backups must stay available.
    const storageTarget = () => options.storage !== undefined ? options.storage : globalThis.localStorage;
    const photos = options.photos || defaultPhotos;
    const backups = options.backups || backupStore(options.indexedDB);
    const locks = options.locks !== undefined ? options.locks : globalThis.navigator?.locks;
    const now = options.now || Date.now;
    const newId = options.uid || uid;
    function locked(action) {
      return locks?.request ? locks.request(LOCK_NAME,{mode:'exclusive'},action) : action();
    }
    function currentSnapshot(currentState, expectedSource) {
      if (expectedSource !== null && typeof expectedSource !== 'string') fail('Не указан исходный снимок базы. Откройте предварительный просмотр заново.');
      const storage = storageTarget();
      if (!storage || storage.getItem(S.KEY) !== expectedSource) fail('База изменилась в другой вкладке. Импорт отменён. Откройте предварительный просмотр заново.');
      const clean = S.validate(currentState);
      if (expectedSource !== null && canonical(S.parseJSON(expectedSource)) !== canonical(clean)) {
        fail('В памяти есть несохранённые изменения. Сначала сохраните их или восстановите базу, затем повторите импорт.');
      }
      // Validate limits before any write to the backup store.
      S.stringify(clean);checkPhotoExtensions(clean);
      return clean;
    }
    function validateRecord(record) {
      if (!record || typeof record.id !== 'string' || !/^backup-[A-Za-z0-9_-]{1,200}$/.test(record.id) ||
          !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 || !['merge','replace'].includes(record.mode) ||
          typeof record.text !== 'string' || (record.source !== null && typeof record.source !== 'string') ||
          (record.draftSource !== undefined && (record.draftSource !== null && typeof record.draftSource !== 'string'))) {
        fail('Резервная копия повреждена. Основная база не изменена.');
      }
      if ((record.source && bytes(record.source)>S.MAX_IMPORT_BYTES) ||
          (record.draftSource && bytes(record.draftSource)>MAX_DRAFT_BYTES)) fail('Резервная копия превышает допустимый размер.');
      const data = S.parseJSON(record.text);checkPhotoExtensions(data);
      return {...record,data};
    }
    async function listBackups() {
      return (await backups.list()).map(item=>metadata(item)).sort((a,b)=>b.createdAt-a.createdAt || b.id.localeCompare(a.id));
    }
    async function getBackup(id) {
      if (typeof id !== 'string' || !/^backup-[A-Za-z0-9_-]{1,200}$/.test(id)) fail('Некорректный идентификатор резервной копии.');
      const record = await backups.get(id);
      if (!record) fail('Резервная копия не найдена. Основная база не изменена.');
      return validateRecord(record);
    }
    async function portableCurrent(currentState, expectedSource) {
      const current = currentSnapshot(currentState,expectedSource);
      const portable = await photos.exportData(current);
      checkPhotoExtensions(portable);S.stringify(portable);
      currentSnapshot(currentState,expectedSource);
      return {current,portable};
    }
    async function saveBackup(currentState, {expectedSource,mode='merge',draftSource}, snapshot) {
      if (!['merge','replace'].includes(mode)) fail('Выберите режим объединения или замены базы.');
      if (draftSource !== undefined && draftSource !== null && (typeof draftSource !== 'string' || bytes(draftSource)>MAX_DRAFT_BYTES)) {
        fail('Не удалось включить снимок черновиков в резервную копию. Основная база не изменена.');
      }
      const {portable} = snapshot || await portableCurrent(currentState,expectedSource);
      currentSnapshot(currentState,expectedSource);
      const text = S.stringify(portable);
      const record = {id:newId(),createdAt:now(),mode,text,source:expectedSource,
        ...(draftSource !== undefined ? {draftSource} : {}),bytes:bytes(text),
        products:portable.products.length,recipes:portable.recipes.length,folders:(portable.folders || []).length};
      validateRecord(record);
      await backups.put(record);
      // Do not call the backup durable until its transaction completed and the
      // same exact snapshot can be read back. Older copies are still untouched.
      const readBack = await backups.get(record.id);
      if (!readBack || Object.keys(readBack).length !== Object.keys(record).length || Object.keys(record).some(key=>readBack[key]!==record[key])) {
        fail('Не удалось проверить сохранённую резервную копию. Импорт не выполнен.');
      }
      currentSnapshot(currentState,expectedSource);
      const warnings = [];
      try {
        const items = await listBackups();
        for (const old of items.filter(item=>item.id!==record.id).slice(KEEP_BACKUPS-1)) await backups.remove(old.id);
      } catch (_) {warnings.push('Новая резервная копия сохранена, но не удалось удалить лишние старые копии.');}
      return {...record,data:portable,...(warnings.length ? {warnings} : {})};
    }
    async function prepareBackup(currentState, settings = {}) {
      return locked(()=>saveBackup(currentState,settings));
    }
    async function localCandidate(candidate, current, portable, createdIds) {
      const data = S.validate(candidate);
      checkPhotoExtensions(data);
      const currentRecipes = new Map(current.recipes.map(recipe=>[recipe.id,recipe]));
      const portableRecipes = new Map(portable.recipes.map(recipe=>[recipe.id,recipe]));
      const knownPhotos = new Map();
      for (const recipe of current.recipes) {
        const values = localSlots(recipe), images = photoSlots(portableRecipes.get(recipe.id) || {});
        values.forEach((id,index)=>{if(id && images[index]) knownPhotos.set(canonical(images[index]),id);});
      }
      async function stage(photo) {
        const fingerprint = canonical(photo);
        if (knownPhotos.has(fingerprint)) return knownPhotos.get(fingerprint);
        const prepared = await photos.prepareImport({version:1,products:[],recipes:[{
          id:'import-photo-staging',type:'dish',name:'Фотография переноса',note:'',actualYield:null,ingredients:[],photo
        }]});
        createdIds.push(...prepared.createdIds);
        const id = prepared.data.recipes[0].photoId;
        if (!id) fail('Не удалось подготовить фотографию. Основная база не изменена.');
        knownPhotos.set(fingerprint,id);return id;
      }
      for (const recipe of data.recipes) {
        const previous = currentRecipes.get(recipe.id), previousPortable = portableRecipes.get(recipe.id);
        if ((recipe.photo !== undefined || recipe.photos !== undefined) && previous && previousPortable &&
            canonical(photoSlots(recipe)) === canonical(photoSlots(previousPortable)) && !previous.photo && !previous.photos) {
          const single = recipe.photo !== undefined, length = recipe.photos?.length;
          const references = localSlots(previous);
          for (const field of PHOTO_FIELDS) delete recipe[field];
          if(single) recipe.photoId=references[0];
          else recipe.photoIds=references.slice(0,length);
        } else if (recipe.photo !== undefined) {
          recipe.photoId=await stage(recipe.photo);delete recipe.photo;
        } else if (recipe.photos !== undefined) {
          const ids=[];
          for (const photo of recipe.photos) ids.push(photo ? await stage(photo) : null);
          recipe.photoIds=ids;delete recipe.photos;
        }
      }
      // Local references are verified by the original photo importer, including
      // old single-photo snapshots. This pass creates no binary records.
      const checked = await photos.prepareImport(data);
      createdIds.push(...checked.createdIds);
      return S.validate(checked.data);
    }
    async function apply({candidate,currentState,expectedSource,backupId,mode='merge',draftSource} = {}) {
      return locked(async()=>{
        if (!['merge','replace'].includes(mode)) fail('Выберите режим объединения или замены базы.');
        const snapshot = await portableCurrent(currentState,expectedSource);
        const validated = S.validate(candidate);checkPhotoExtensions(validated);
        // Resolve local snapshots only on the device that actually owns them.
        const incomingPortable = await photos.exportData(validated);
        checkPhotoExtensions(incomingPortable);S.stringify(incomingPortable);
        currentSnapshot(currentState,expectedSource);
        if (comparablePortable(incomingPortable) === comparablePortable(snapshot.portable)) {
          return {data:snapshot.current,backup:null,noOp:true};
        }
        let backup;
        if (backupId) {
          backup=await getBackup(backupId);
          if (backup.source!==expectedSource || comparablePortable(backup.data)!==comparablePortable(snapshot.portable)) {
            fail('Резервная копия относится к другой базе. Создайте новую копию перед импортом.');
          }
        } else backup=await saveBackup(currentState,{expectedSource,mode,draftSource},snapshot);
        currentSnapshot(currentState,expectedSource);
        const createdIds=[];
        try {
          const data=await localCandidate(incomingPortable,snapshot.current,snapshot.portable,createdIds);
          currentSnapshot(currentState,expectedSource);
          const result=S.save(data,storageTarget());
          if (!result.ok) fail('Импорт не сохранён: '+result.error+' Исходная база осталась без изменений.');
          // Commit point: no async work, cleanup or fallible reads after this.
          // Existing image IDs stay available for independent saved drafts.
          return {data,backup,noOp:false};
        } catch(error) {
          let cleanupError;
          try {await photos.rollback([...new Set(createdIds)]);} catch(rollbackError){cleanupError=rollbackError;}
          if (cleanupError) throw Error(error.message+' Не удалось удалить временные фото; исходные фотографии и база не удалялись.');
          throw error;
        }
      });
    }
    return {prepareBackup,apply,listBackups,getBackup};
  }
  let service;
  const shared = () => service || (service=create());
  return {DB_NAME,LOCK_NAME,KEEP_BACKUPS,create,backupStore,checkPhotoExtensions,
    prepareBackup:(...args)=>shared().prepareBackup(...args),apply:(...args)=>shared().apply(...args),
    listBackups:(...args)=>shared().listBackups(...args),getBackup:(...args)=>shared().getBackup(...args)};
});
