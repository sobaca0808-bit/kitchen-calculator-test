// A single shared Vue runtime for the first paint and the on-demand photo tool.
import {createApp, defineComponent, createElementVNode, toDisplayString, normalizeStyle,
  withModifiers, Fragment, openBlock, createElementBlock, computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
export const runtime = {createApp, defineComponent, createElementVNode, toDisplayString, normalizeStyle,
  withModifiers, Fragment, openBlock, createElementBlock, computed, onMounted, onBeforeUnmount, ref, watch}
let pending:Promise<any> | undefined
function load(){
  if(!pending){
    const url=new URL('js/vue-photo.js',document.baseURI)
    url.searchParams.set('v',document.documentElement.dataset.pwaBuild || 'dev')
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script')
      script.src=url.href
      script.onload=()=>{script.remove(); resolve((globalThis as any).SintezPhoto)}
      script.onerror=()=>{script.remove(); reject(Error('Photo component unavailable'))}
      document.head.append(script)
    }).catch(error=>{pending=undefined;throw error})
  }
  return pending
}
export const lazyViewer={
  open(options:{url:string,alt?:string,trigger?:HTMLElement}){
    let cancelled=false,viewer:{close:()=>void}|undefined
    load().then(module=>{
      if(!cancelled)viewer=module.open(options)
    }).catch(()=>{
      if(cancelled)return
      const text=document.createElement('p');text.className='inline-error';text.setAttribute('role','alert')
      text.textContent='Не удалось загрузить просмотр фотографии. Проверьте доступность автономной копии и повторите.'
      options.trigger?.parentElement?.append(text)
    })
    return {close(){cancelled=true;viewer?.close()}}
  }
}
