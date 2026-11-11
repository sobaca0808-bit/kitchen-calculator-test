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
  // Decode one source at a time even when both slots were selected together.
  // A camera source can be 40 MP; two simultaneous decoded bitmaps are costly on phones.
  let compressionQueue=Promise.resolve();
  let connection;
  function ids(recipe) {
    const values=Array.isArray(recipe?.photoIds) ? recipe.photoIds : recipe?.photoId ? [recipe.photoId] : [];
    return [values[0] || null,values[1] || null];
  }
  function setIds(recipe,values) {
    delete recipe.photoId;delete recipe.photo;delete recipe.photos;
    if(values.some(Boolean))recipe.photoIds=[values[0] || null,values[1] || null];
    else delete recipe.photoIds;
  }
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
  async function sourceDimensions(blob,mime) {
    const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
    let width,height;
    if(mime==='image/png' && bytes.length>=24) {
      width=view.getUint32(16);height=view.getUint32(20);
    } else if(mime==='image/jpeg') {
      let offset=2;
      while(offset<bytes.length) {
        if(bytes[offset]!==255)break;
        while(bytes[offset]===255)offset++;
        const marker=bytes[offset++];
        if(marker===0xda || marker===0xd9)break;
        if(marker===0xd8 || marker===1 || (marker>=0xd0 && marker<=0xd7))continue;
        if(offset+2>bytes.length)break;
        const length=view.getUint16(offset);
        if(length<2 || offset+length>bytes.length)break;
        if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length>=7) {
          height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;
        }
        offset+=length;
      }
    } else if(mime==='image/webp') {
      let offset=12;
      while(offset+8<=bytes.length) {
        const type=String.fromCharCode(...bytes.slice(offset,offset+4)),size=view.getUint32(offset+4,true),start=offset+8;
        if(start+size>bytes.length)break;
        if(type==='VP8X' && size>=10) {
          width=1+bytes[start+4]+bytes[start+5]*256+bytes[start+6]*65536;
          height=1+bytes[start+7]+bytes[start+8]*256+bytes[start+9]*65536;break;
        }
        if(type==='VP8L' && size>=5 && bytes[start]===0x2f) {
          const bits=view.getUint32(start+1,true);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);break;
        }
        if(type==='VP8 ' && size>=10 && bytes[start+3]===0x9d && bytes[start+4]===1 && bytes[start+5]===0x2a) {
          width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;break;
        }
        offset=start+size+(size%2);
      }
    }
    if(!width || !height)throw Error('Не удалось проверить размеры изображения. Выберите другую фотографию.');
    if(width*height>MAX_PIXELS)throw Error('Изображение слишком большое: допустимо до 40 мегапикселей.');
    return {width,height};
  }
  function compress(file) {
    const task=compressionQueue.then(()=>compressOne(file));
    compressionQueue=task.then(()=>{},()=>{});
    return task;
  }
  async function compressOne(file) {
    if(!file || (file.type && !MIME_TYPES.includes(file.type)))throw Error('Выберите фотографию JPEG, PNG или WebP.');
    if(!file.size || file.size>MAX_SOURCE_BYTES)throw Error('Фотография должна быть не больше 10 МБ.');
    const mime=await actualMime(file);
    if(file.type && mime!==file.type)throw Error('Тип файла не соответствует изображению.');
    await sourceDimensions(file,mime);
    // Modern Image decoding applies the JPEG EXIF orientation before canvas copying.
    const image=await decode(file), originalWidth=image.naturalWidth, originalHeight=image.naturalHeight;
    const canvas=document.createElement('canvas');
    try {
      if(!originalWidth || !originalHeight || originalWidth*originalHeight>MAX_PIXELS)throw Error('Изображение слишком большое: допустимо до 40 мегапикселей.');
      const ratio=Math.min(1,S.MAX_PHOTO_SIDE/Math.max(originalWidth,originalHeight));
      let width=Math.max(1,Math.round(originalWidth*ratio)),height=Math.max(1,Math.round(originalHeight*ratio));
      for(let sizePass=0;sizePass<10;sizePass++) {
        canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');
        if(!context)throw Error('Браузер не поддерживает обработку фотографии.');
        context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
        // Preserve useful plate details; reduce dimensions before using low JPEG quality.
        for(const quality of [.9,.86,.82,.78]) {
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(blob && blob.type==='image/jpeg' && blob.size<=S.MAX_PHOTO_BYTES && blob.size>0)return {blob,width,height,mime:'image/jpeg'};
        }
        width=Math.max(1,Math.round(width*.9));height=Math.max(1,Math.round(height*.9));
      }
      throw Error('Не удалось уменьшить фотографию до безопасного размера. Выберите другое изображение.');
    } finally {
      canvas.width=1;canvas.height=1;image.src='';
    }
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
    const source=await sourceDimensions(record.blob,record.mime);
    if(Math.max(source.width,source.height)>S.MAX_PHOTO_SIDE)throw Error('Размер фотографии превышает допустимый.');
    const image=await decode(record.blob);
    try {
      if(image.naturalWidth!==record.width || image.naturalHeight!==record.height || Math.max(record.width,record.height)>S.MAX_PHOTO_SIDE)throw Error('Размер фотографии не соответствует данным резервной копии.');
    } finally {image.src='';}
  }
  async function portablePhoto(id) {
    const record=await get(id);await validateBlob(record);
    return {dataUrl:await readDataURL(record.blob),width:record.width,height:record.height,mime:record.mime};
  }
  async function exportData(state) {
    const data=S.validate(state);
    for(const recipe of data.recipes) {
      if(recipe.photoIds !== undefined) {
        recipe.photos=[];
        for(const id of recipe.photoIds)recipe.photos.push(id ? await portablePhoto(id) : null);
        delete recipe.photoIds;
      } else if(recipe.photoId) {
        recipe.photo=await portablePhoto(recipe.photoId);delete recipe.photoId;
      }
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
      async function stage(photo) {
        const record={...photo,blob:fromDataURL(photo)};await validateBlob(record);
        const id=await put(record.blob,record.width,record.height);createdIds.push(id);return id;
      }
      for(const recipe of data.recipes) {
        if(recipe.photos !== undefined) {
          const references=[];
          for(const photo of recipe.photos)references.push(photo ? await stage(photo) : null);
          recipe.photoIds=references;delete recipe.photos;
        } else if(recipe.photo) {
          recipe.photoId=await stage(recipe.photo);delete recipe.photo;
        } else {
          // Local-reference snapshots work only on the device which still owns the photos.
          for(const id of ids(recipe))if(id)await validateBlob(await get(id));
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
    let disposed=false,url,viewer;
    const ready=(async()=>{
      try {
        const record=await get(id);
        if(disposed)return;
        const button=document.createElement('button');button.type='button';button.className='photo-open';button.setAttribute('aria-label','Открыть фотографию крупно');
        const image=document.createElement('img');image.alt='Фотография готового блюда';
        url=URL.createObjectURL(record.blob);image.src=url;button.append(image);host.append(button);
        await image.decode();
        button.addEventListener('click',()=>{
          if(disposed)return;
          viewer=globalThis.KitchenPhotoViewer?.open({url,alt:image.alt,trigger:button});
        });
      } catch(error) {
        if(!disposed){host.replaceChildren();const text=document.createElement('p');text.className='inline-error';text.textContent='Фотография недоступна: '+error.message;host.append(text);}
        throw error;
      }
    })();
    return {ready,dispose(){disposed=true;viewer?.close();if(url)URL.revokeObjectURL(url);}};
  }
  function mountGallery(host,recipe) {
    host.classList.add('recipe-photos');host.replaceChildren();
    const previews=[];
    ids(recipe).forEach((id,index)=>{
      const slot=document.createElement('div');slot.className='photo-slot';slot.dataset.photoSlot=String(index);slot.dataset.empty=id?'false':'true';
      if(id) {const preview=document.createElement('div');slot.append(preview);previews.push(mountPreview(preview,id));}
      else {const empty=document.createElement('span');empty.className='photo-empty';empty.textContent='Фотография '+(index+1);slot.append(empty);}
      host.append(slot);
    });
    const ready=Promise.allSettled(previews.map(preview=>preview.ready)).then(results=>{
      const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    });
    return {ready,dispose(){previews.forEach(preview=>preview.dispose());}};
  }
  function mountEditor(host,{recipe,onChange=()=>{},onStatus=()=>{}}) {
    host.classList.add('photo-editor');
    const suffix=index=>index===0?'':'-2';
    host.innerHTML='<h3>Фотографии блюда</h3><div class="photo-editor-grid">'+[0,1].map(index=>`<div class="photo-editor-slot" data-photo-slot="${index}" role="group" aria-label="Фотография ${index+1}"><strong>Фото ${index+1}</strong><button type="button" class="photo-frame-button" aria-label="Добавить или заменить фотографию ${index+1}"><span class="photo-empty">Нажмите, чтобы добавить</span></button><div class="photo-slot-actions"><button type="button" class="photo-pick">Галерея</button><button type="button" class="photo-camera-pick">Камера</button><button id="remove-photo${suffix(index)}" type="button" class="danger">Удалить фото</button></div><input id="photo-file${suffix(index)}" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="photo-camera${suffix(index)}" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><p class="photo-status" role="status" aria-live="polite"></p></div>`).join('')+'</div><button id="swap-photos" type="button">Поменять фотографии местами</button><p class="field-help">До двух фотографий JPEG, PNG или WebP до 10 МБ каждая. Снимки уменьшаются до 1920 пикселей и 500 КБ и хранятся в этом браузере. Для переноса используйте экспорт JSON. Камера доступна, если её поддерживает устройство и браузер.</p>';
    const slots=[...host.querySelectorAll('[data-photo-slot]')].map(node=>({node,frame:node.querySelector('.photo-frame-button'),file:node.querySelector('input:not([capture])'),camera:node.querySelector('input[capture]'),pick:node.querySelector('.photo-pick'),cameraPick:node.querySelector('.photo-camera-pick'),remove:node.querySelector('[id^="remove-photo"]'),status:node.querySelector('.photo-status'),busy:false,url:null,version:0}));
    const swap=host.querySelector('#swap-photos');let disposed=false;
    const anyBusy=()=>slots.some(slot=>slot.busy);
    function say(index,text,error=false) {if(disposed)return;const el=slots[index].status;el.textContent=text;el.classList.toggle('inline-error',error);if(error)onStatus(text,error);}
    function controls() {
      const values=ids(recipe);
      slots.forEach((slot,index)=>{
        for(const control of [slot.frame,slot.file,slot.camera,slot.pick,slot.cameraPick,slot.remove])control.disabled=slot.busy;
        slot.remove.hidden=!values[index];slot.pick.textContent=values[index]?'Заменить':'Галерея';
        slot.frame.setAttribute('aria-label',(values[index]?'Заменить':'Добавить')+' фотографию '+(index+1));
      });
      swap.disabled=anyBusy() || !values.some(Boolean);
    }
    async function draw(index) {
      const slot=slots[index],version=++slot.version,id=ids(recipe)[index];
      if(slot.url){URL.revokeObjectURL(slot.url);slot.url=null;}
      slot.frame.replaceChildren();controls();
      if(!id) {const empty=document.createElement('span');empty.className='photo-empty';empty.textContent='Нажмите, чтобы добавить';slot.frame.append(empty);return;}
      try {
        const record=await get(id);if(disposed || version!==slot.version)return;
        const image=document.createElement('img');image.alt='Предварительный просмотр фотографии '+(index+1);slot.url=URL.createObjectURL(record.blob);image.src=slot.url;slot.frame.append(image);await image.decode();
      } catch(error) {if(!disposed && version===slot.version)say(index,'Не удалось показать фотографию: '+error.message,true);}
    }
    function changed(previousPhotoIds) {onChange({previousPhotoIds:previousPhotoIds.filter(Boolean),previousPhotoId:previousPhotoIds.find(Boolean)});}
    async function upload(index,input) {
      const slot=slots[index],file=input.files?.[0];if(!file || slot.busy || disposed)return;
      slot.busy=true;controls();say(index,'Обрабатываем фотографию…');let staged;
      try {
        const image=await compress(file);if(disposed)return;
        staged=await put(image.blob,image.width,image.height);
        if(disposed){await remove(staged);return;}
        const values=ids(recipe),previousPhotoId=values[index];values[index]=staged;setIds(recipe,values);
        changed([previousPhotoId]);await draw(index);say(index,'Фотография сохранена в браузере. Сохраните карточку, чтобы применить изменение.');
      } catch(error) {say(index,'Фотография не добавлена: '+error.message+' Предыдущий снимок и основная база не изменены.',true);}
      finally {slot.busy=false;if(!disposed){input.value='';controls();}}
    }
    slots.forEach((slot,index)=>{
      slot.frame.addEventListener('click',()=>slot.file.click());slot.pick.addEventListener('click',()=>slot.file.click());slot.cameraPick.addEventListener('click',()=>slot.camera.click());
      slot.file.addEventListener('change',()=>upload(index,slot.file));slot.camera.addEventListener('change',()=>upload(index,slot.camera));
      slot.remove.addEventListener('click',()=>{
        const values=ids(recipe);if(slot.busy || !values[index] || !confirm('Удалить фотографию '+(index+1)+' из рецепта? Изменение попадёт в карточку после сохранения.'))return;
        const previousPhotoId=values[index];values[index]=null;setIds(recipe,values);changed([previousPhotoId]);draw(index);say(index,'Фотография убрана из формы. Сохраните карточку для применения изменения.');
      });
    });
    swap.addEventListener('click',()=>{
      if(anyBusy() || !ids(recipe).some(Boolean))return;
      const values=ids(recipe);setIds(recipe,[values[1],values[0]]);changed([]);
      slots.forEach((_,index)=>{draw(index);say(index,'Фотографии поменялись местами. Сохраните карточку.');});
    });
    const ready=Promise.all(slots.map((_,index)=>draw(index)));
    return {get busy(){return anyBusy();},ready,dispose(){disposed=true;slots.forEach(slot=>{slot.version++;if(slot.url)URL.revokeObjectURL(slot.url);});}};
  }
  return {DB_NAME,MAX_SOURCE_BYTES,MAX_PIXELS,ids,compress,get,remove,exportData,prepareImport,rollback,mountEditor,mountPreview,mountGallery};
});
