<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{dialog:HTMLDialogElement, finish:(remember?:boolean)=>void}>()
const slides = [
  ['СИНТЕЗ МЕРЫ','ЗНАКОМСТВО','От идеи — к рецептам, точным расчётам и управлению кухней.','01_intro'],
  ['Для дома','ДОМА','От простых ингредиентов к любимым блюдам. Рецепты и понятные количества.','02_home'],
  ['Для повара','ПОВАР','Рецептуры, граммовки и фотографии блюд — всё под рукой.','03_chef'],
  ['Для бизнеса','БИЗНЕС','Себестоимость, цена продажи и маржа — расчёты в одном месте.','04_business'],
]
const current = ref(0), playing = ref(false), inFullscreen = ref(false), installHelp = ref(false)
const fullscreenSupported = Boolean(document.fullscreenEnabled && Element.prototype.requestFullscreen)
const pwa = Boolean(document.querySelector('link[rel=manifest]'))
const installStatus = ref(''), announcement = ref('')
const last = computed(()=> current.value === slides.length-1)
const stage = ref<HTMLElement>(), shell = ref<HTMLElement>(), previous = ref<HTMLButtonElement>(), next = ref<HTMLButtonElement>()
const install = ref<HTMLButtonElement>(), closeInstall = ref<HTMLButtonElement>()
let timer:number|undefined
let gesture:{x:number,y:number}|null = null
function pause(){clearInterval(timer);timer=undefined;playing.value=false}
function select(index:number, userAction=true){
  if(userAction)pause()
  current.value=Math.max(0,Math.min(index,slides.length-1))
  installHelp.value=false
  announcement.value=''
  if(last.value)pause()
  if(current.value===0 && document.activeElement===previous.value)nextTick(()=>next.value?.focus({preventScroll:true}))
}
function autoplay(){
  if(playing.value){pause();return}
  if(last.value)select(0)
  playing.value=true;timer=window.setInterval(()=>select(current.value+1,false),6000)
}
async function fullscreen(){
  try{
    if(document.fullscreenElement===shell.value)await document.exitFullscreen()
    else await shell.value?.requestFullscreen()
  }catch{announcement.value='Полноэкранный режим недоступен. Презентация работает в обычном окне.'}
}
function updateFullscreen(){inFullscreen.value=document.fullscreenElement===shell.value}
function visibility(){if(document.hidden)pause()}
function openInstall(){
  pause();installHelp.value=true
  const button=document.getElementById('pwa-install')
  if (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone)
    installStatus.value='Приложение уже открыто в отдельном окне. Можно продолжить работу.'
  else if(!pwa)installStatus.value='Откройте страницу существующего приложения по ссылке ниже. Эта обычная веб-страница не предлагает отдельную установку; установка не подтверждена.'
  else if(button && !button.hidden){
    installStatus.value='Запрошено системное окно установки. Подтвердите установку в браузере. Если вы закрыли окно, повторите через меню браузера.'
    button.click()
  }else installStatus.value='Системная кнопка установки сейчас недоступна. Используйте инструкцию для вашего устройства ниже; установка не подтверждена.'
  nextTick(()=>{closeInstall.value?.focus({preventScroll:true});closeInstall.value?.closest('section')?.scrollIntoView({block:'nearest'})})
}
function installed(){installStatus.value='Браузер подтвердил установку приложения. Запускайте его через появившийся ярлык.'}
function hideInstall(){installHelp.value=false;nextTick(()=>install.value?.focus({preventScroll:true}))}
function key(event:KeyboardEvent){
  if(event.key==='Escape'){
    event.stopPropagation()
    if(installHelp.value){event.preventDefault();hideInstall()}
    return
  }
  if(installHelp.value)return
  const index:Record<string,number>={Home:0,End:slides.length-1,ArrowLeft:current.value-1,ArrowRight:current.value+1}
  if(!(event.key in index))return
  event.preventDefault();event.stopPropagation();select(index[event.key])
}
function touchStart(event:TouchEvent){gesture=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null}
function touchEnd(event:TouchEvent){
  const start=gesture;gesture=null
  if(!start || event.touches.length || !event.changedTouches.length)return
  const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y
  if(Math.abs(dx)>=45 && Math.abs(dx)>Math.abs(dy)*1.5)select(current.value+(dx<0?1:-1))
}
onMounted(()=>{
  props.dialog.addEventListener('keydown',key)
  document.addEventListener('visibilitychange',visibility);document.addEventListener('fullscreenchange',updateFullscreen)
  window.addEventListener('appinstalled',installed)
})
onBeforeUnmount(()=>{
  pause();props.dialog.removeEventListener('keydown',key)
  document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',updateFullscreen)
  window.removeEventListener('appinstalled',installed)
})
</script>
<template>
<div ref="shell" class="sx-intro-shell">
  <header class="sx-intro-top"><span class="sx-intro-brand">СИНТЕЗ МЕРЫ</span><button data-intro-skip type="button" @click="finish(true)">Пропустить</button></header>
  <div ref="stage" class="sx-intro-stage" aria-roledescription="карусель" aria-label="Четыре истории о приложении" @touchstart.passive="touchStart" @touchend.passive="touchEnd" @touchcancel.passive="gesture=null">
    <figure v-for="([title,tag,copy,asset],i) in slides" :key="asset" class="sx-intro-slide" :class="{'is-active':current===i}" :data-intro-slide="title" :aria-hidden="current!==i">
      <img v-if="current===i" :src="'assets/sintez-intro/'+asset+'.jpg'" :alt="'Иллюстрация: '+title" width="1672" height="941" decoding="async">
      <figcaption class="sx-intro-copy"><span class="sx-intro-tag">{{tag}}</span><h2>{{title}}</h2><p>{{copy}}</p></figcaption>
    </figure>
  </div>
  <div class="sx-intro-bottom"><div class="sx-intro-progress"><nav class="sx-intro-dots" aria-label="Выбор слайда"><button v-for="(slide,i) in slides" :key="i" data-intro-dot type="button" :aria-label="'Слайд '+(i+1)+': '+slide[0]" :aria-current="current===i?'step':'false'" @click="select(i)"/></nav><span data-intro-count>{{current+1}} / {{slides.length}}</span></div>
  <div class="sx-intro-navigation"><button ref="previous" data-intro-previous type="button" :disabled="current===0" @click="select(current-1)">← Назад</button><button ref="next" data-intro-next type="button" @click="last?finish(true):select(current+1)">{{last?'Открыть программу':'Далее →'}}</button><button ref="install" data-intro-install type="button" :hidden="!last" @click="openInstall">Установить приложение</button></div></div>
      <section class="sx-intro-install-help" data-intro-install-help aria-labelledby="sintez-install-title" :hidden="!installHelp">
        <h3 id="sintez-install-title">Установка приложения</h3><p data-intro-install-status role="status" aria-live="polite">{{installStatus}}</p>
        <p data-intro-existing-pwa :hidden="pwa">Для установки используйте существующую PWA, чтобы сохранить её адрес и ярлык: <a :href="'pwa/'">Открыть страницу приложения</a>. Между отдельными базами данные переносятся только через JSON.</p>
        <div data-intro-device-help :hidden="!pwa">
        <details open><summary>Android — Chrome</summary><p>Откройте эту ссылку в обычном Chrome с интернетом. В меню ⋮ выберите «Установить приложение» либо «Добавить на главный экран» → «Установить». Названия зависят от версии Chrome. Если пункта нет, продолжайте в браузере; установка в этом браузере сейчас недоступна.</p></details>
        <details><summary>Компьютер — Chrome или Microsoft Edge</summary><p>В Chrome нажмите значок установки справа в адресной строке либо ⋮ → «Трансляция, сохранение и отправка» → «Установить страницу как приложение». В Edge: ⋯ → «Приложения» → «Установить этот сайт как приложение». Если пункта нет, этот браузер или профиль не предлагает установку; программа доступна как сайт.</p></details>
        <details><summary>iPhone или iPad — Safari</summary><p>Откройте эту ссылку в Safari, нажмите «Поделиться» → «На экран Домой». Если доступен переключатель «Открывать как веб-приложение», включите его, затем нажмите «Добавить». Нативное окно установки Chrome на iOS не поддерживается.</p></details>
        </div>
        <p>После установки дождитесь в меню «Приложение» сообщения «Готово к запуску без интернета». В другом браузере или профиле данные могут храниться отдельно: переносите их только через экспорт и импорт JSON. Старый ярлык не удаляйте, данные не очищайте.</p>
        <button ref="closeInstall" data-intro-install-close type="button" @click="hideInstall">Вернуться к презентации</button>
      </section>
  <div class="sx-intro-tools"><button data-intro-play type="button" :aria-pressed="playing" @click="autoplay">{{playing?'Ⅱ Пауза':'▶ Авто'}}</button><button data-intro-fullscreen type="button" :aria-pressed="inFullscreen" :hidden="!fullscreenSupported" @click="fullscreen">{{inFullscreen?'⛶ Обычный экран':'⛶ На весь экран'}}</button><span class="sx-intro-hint">Листайте стрелками ← → или свайпом</span></div>
  <p class="sx-intro-fine">Фотографии и экраны на них — иллюстрации, а не снимки действующей программы. После презентации откроется ваш калькулятор.</p>
  <span class="sx-intro-announcement" data-intro-announcement role="status" aria-live="polite">{{announcement || ('Слайд '+(current+1)+' из '+slides.length+': '+slides[current][0])}}</span>
</div>
</template>
