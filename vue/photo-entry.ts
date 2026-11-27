import { createApp } from 'vue'
import Photo from './photo-viewer.vue'

let active: {close:()=>void} | undefined
export function open({url,alt='Фотография готового блюда',trigger}:{url:string,alt?:string,trigger?:HTMLElement}){
  if(typeof url!=='string'||!url.startsWith('blob:'))throw Error('Для просмотра нужна локальная фотография из браузера.')
  active?.close()
  const dialog=document.createElement('dialog')
  dialog.className='photo-viewer';dialog.id='photo-viewer';dialog.setAttribute('aria-labelledby','photo-viewer-title')
  const previous=trigger || document.activeElement
  const handle={close}
  const app=createApp(Photo,{url,alt,close})
  function close(){
    if(active!==handle)return
    active=undefined
    if(dialog.open)dialog.close()
    app.unmount();dialog.remove()
    if(previous instanceof HTMLElement && previous.isConnected)previous.focus({preventScroll:true})
  }
  active=handle
  document.body.append(dialog);app.mount(dialog)
  dialog.addEventListener('close',close)
  dialog.addEventListener('click',e=>{
    if(e.target!==dialog)return
    const b=dialog.getBoundingClientRect()
    if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close()
  })
  try{dialog.showModal()}catch(e){close();throw e}
  dialog.querySelector<HTMLButtonElement>('#photo-viewer-close')?.focus({preventScroll:true})
  return handle
}
