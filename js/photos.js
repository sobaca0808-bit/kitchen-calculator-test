(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./storage.js') : root.KitchenStorage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenPhotos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';
  const DB_NAME = 'kitchen-calculator-test-photos-v1';
  const STORE = 'photos';
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024, MAX_PIXELS = 40 * 1000 * 1000;
  const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
  const uid = () => 'photo-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve,reject) => {
      if (!globalThis.indexedDB) {reject(Error('Хранилище фотографий недоступно в этом браузере.'));return;}
      let request,settled=false;
      try {request = indexedDB.open(DB_NAME,1);} catch (error) {reject(error);return;}
      const timer=setTimeout(()=>{settled=true;reject(Error('Не удалось открыть хранилище фотографий. Закройте другие вкладки калькулятора и повторите.'));},8000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
      request.onerror=()=>{clearTimeout(timer);if(settled)return;settled=true;reject(request.error || Error('Не удалось открыть хранилище фотографий.'));};
      request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
    }).catch(error=>{connection=null;throw error;});
    return connection;
  }
  async function operation(mode, action) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx, request;
      try {tx=db.transaction(STORE,mode);request=action(tx.objectStore(STORE));}
      catch(error){reject(error);return;}
      tx.oncomplete=()=>resolve(request?.result);
      tx.onerror=tx.onabort=()=>reject(tx.error || request?.error || Error('Ошибка хранилища фотографий. Возможно, в браузере недостаточно места.'));
    });
  }
  async function get(id) {
    if(!validId(id))throw Error('Некорректная ссылка на фотографию.');
    const record=await operation('readonly',store=>store.get(id));
    if(!record || !(record.blob instanceof Blob))throw Error('Фотография не найдена в этом браузере. Восстановите резервную копию JSON с фотографиями.');
    return record;
  }
  async function remove(id) {
    if(!validId(id))throw Error('Некорректная ссылка на фотографию.');
    await operation('readwrite',store=>store.delete(id));
  }
  async function put(blob,width,height) {
    const id=uid();
    await operation('readwrite',store=>store.add({id,blob,width,height,mime:blob.type}));
    return id;
  }
  function decode(blob) {
    return new Promise((resolve,reject)=>{
      const image=new Image(), url=URL.createObjectURL(blob);
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Не удалось прочитать изображение. Выберите обычную фотографию JPEG, PNG или WebP.'));};
      image.src=url;
    });
  }
  async function actualMime(blob) {
    const b=new Uint8Array(await blob.slice(0,12).arrayBuffer());
    if(b.length>=3 && b[0]===255 && b[1]===216 && b[2]===255)return 'image/jpeg';
    if(b.length>=8 && [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return 'image/png';
    if(b.length>=12 && String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
    throw Error('Файл не является фотографией JPEG, PNG или WebP.');
  }
  async function compress(file) {
    if(!file || !MIME_TYPES.includes(file.type))throw Error('Выберите фотографию JPEG, PNG или WebP.');
    if(!file.size || file.size>MAX_SOURCE_BYTES)throw Error('Фотография должна быть не больше 10 МБ.');
    if(await actualMime(file)!==file.type)throw Error('Тип файла не соответствует изображению.');
    const image=await decode(file), originalWidth=image.naturalWidth, originalHeight=image.naturalHeight;
    if(!originalWidth || !originalHeight || originalWidth*originalHeight>MAX_PIXELS)throw Error('Изображение слишком большое: допустимо до 40 мегапикселей.');
    const ratio=Math.min(1,S.MAX_PHOTO_SIDE/Math.max(originalWidth,originalHeight));
    let width=Math.max(1,Math.round(originalWidth*ratio)),height=Math.max(1,Math.round(originalHeight*ratio));
    const canvas=document.createElement('canvas');
    for(let sizePass=0;sizePass<6;sizePass++) {
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');
      if(!context)throw Error('Браузер не поддерживает обработку фотографии.');
      context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
      for(const quality of [.84,.72,.6,.48]) {
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob && blob.size<=S.MAX_PHOTO_BYTES && blob.size>0)return {blob,width,height,mime:'image/jpeg'};
      }
      width=Math.max(1,Math.round(width*.78));height=Math.max(1,Math.round(height*.78));
    }
    throw Error('Не удалось уменьшить фотографию до безопасного размера. Выберите другое изображение.');
  }
  function readDataURL(blob) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось включить фотографию в резервную копию.'));reader.readAsDataURL(blob);});
  }
  function fromDataURL(photo) {
    const encoded=photo.dataUrl.slice(photo.dataUrl.indexOf(',')+1), binary=atob(encoded), bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:photo.mime});
  }
  async function validateBlob(record) {
    if(!MIME_TYPES.includes(record.mime) || record.blob.type!==record.mime || record.blob.size>S.MAX_PHOTO_BYTES || !record.blob.size)throw Error('Данные фотографии повреждены.');
    if(await actualMime(record.blob)!==record.mime)throw Error('Тип фотографии не соответствует её данным.');
    const image=await decode(record.blob);
    if(image.naturalWidth!==record.width || image.naturalHeight!==record.height || Math.max(record.width,record.height)>S.MAX_PHOTO_SIDE)throw Error('Размер фотографии не соответствует данным резервной копии.');
  }
  async function exportData(state) {
    const data=S.validate(state);
    for(const recipe of data.recipes) {
      if(!recipe.photoId)continue;
      const record=await get(recipe.photoId);await validateBlob(record);
      recipe.photo={dataUrl:await readDataURL(record.blob),width:record.width,height:record.height,mime:record.mime};
      delete recipe.photoId;
    }
    // Apply the same portable-file budget as import, so every export can be restored.
    S.stringify(data);
    return data;
  }
  async function rollback(ids) {
    const results=await Promise.allSettled(ids.map(remove));
    const failure=results.find(result=>result.status==='rejected');
    if(failure)throw failure.reason;
  }
  async function prepareImport(candidate) {
    const data=S.validate(candidate),createdIds=[];
    try {
      for(const recipe of data.recipes) {
        if(recipe.photo) {
          const record={...recipe.photo,blob:fromDataURL(recipe.photo)};await validateBlob(record);
          const id=await put(record.blob,record.width,record.height);createdIds.push(id);
          recipe.photoId=id;delete recipe.photo;
        } else if(recipe.photoId) {
          // Old local snapshots can be recovered only on the device owning that photo.
          await validateBlob(await get(recipe.photoId));
        }
      }
      return {data,createdIds};
    } catch(error) {
      try {await rollback(createdIds);} catch(_) { /* Never delete existing photos to recover staging space. */ }
      throw error;
    }
  }
  function mountPreview(host,id) {
    host.classList.add('recipe-photo');host.replaceChildren();
    let disposed=false,url;
    const ready=(async()=>{
      try {
        const record=await get(id);
        if(disposed)return;
        const image=document.createElement('img');image.alt='Фотография готового блюда';
        url=URL.createObjectURL(record.blob);image.src=url;host.append(image);
        await image.decode();
      } catch(error) {
        if(!disposed){host.replaceChildren();const text=document.createElement('p');text.className='inline-error';text.textContent='Фотография недоступна: '+error.message;host.append(text);}
        throw error;
      }
    })();
    return {ready,dispose(){disposed=true;if(url)URL.revokeObjectURL(url);}};
  }
  function mountEditor(host,{recipe,onChange=()=>{},onStatus=()=>{}}) {
    host.classList.add('photo-editor');
    host.innerHTML='<h3>Фотография готового блюда</h3><label>Добавить или заменить фотографию<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="field-help">JPEG, PNG или WebP до 10 МБ. Фотография уменьшится до 1280 пикселей и 180 КБ и останется только в этом браузере. Для переноса используйте экспорт JSON.</p><div class="photo-editor-preview"></div><button id="remove-photo" type="button">Удалить фотографию</button><p class="photo-status" role="status" aria-live="polite"></p>';
    const input=host.querySelector('#photo-file'),removeButton=host.querySelector('#remove-photo'),preview=host.querySelector('.photo-editor-preview'),status=host.querySelector('.photo-status');
    let disposed=false,busy=false,url,drawVersion=0;
    function say(text,error=false){if(disposed)return;status.textContent=text;status.classList.toggle('inline-error',error);if(error)onStatus(text,error);}
    function updateControls(){input.disabled=busy;removeButton.disabled=busy;removeButton.hidden=!recipe.photoId;}
    async function draw() {
      const version=++drawVersion;
      if(url){URL.revokeObjectURL(url);url=null;}preview.replaceChildren();updateControls();
      if(!recipe.photoId)return;
      try {const record=await get(recipe.photoId);if(disposed || version!==drawVersion)return;const image=document.createElement('img');image.alt='Предварительный просмотр фотографии блюда';url=URL.createObjectURL(record.blob);image.src=url;preview.append(image);await image.decode();}
      catch(error){say('Не удалось показать фотографию: '+error.message,true);}
    }
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file || busy)return;
      busy=true;updateControls();say('Обрабатываем фотографию…');let staged;
      try {
        const image=await compress(file);if(disposed)return;
        staged=await put(image.blob,image.width,image.height);
        if(disposed){await remove(staged);return;}
        const previousPhotoId=recipe.photoId;recipe.photoId=staged;delete recipe.photo;
        onChange({previousPhotoId});await draw();say('Фотография сохранена в браузере. Нажмите «Сохранить», чтобы обновить карточку.');
      } catch(error){say('Фотография не добавлена: '+error.message+' Основная база не изменена.',true);}
      finally{busy=false;if(!disposed){input.value='';updateControls();}}
    });
    removeButton.addEventListener('click',()=>{
      if(busy || !recipe.photoId)return;
      const previousPhotoId=recipe.photoId;delete recipe.photoId;delete recipe.photo;
      onChange({previousPhotoId});draw();say('Фотография убрана из формы. Сохраните рецепт для изменения карточки.');
    });
    const ready=draw();
    return {get busy(){return busy;},ready,dispose(){disposed=true;if(url)URL.revokeObjectURL(url);}};
  }
  return {DB_NAME,MAX_SOURCE_BYTES,MAX_PIXELS,get,remove,exportData,prepareImport,rollback,mountEditor,mountPreview};
});
