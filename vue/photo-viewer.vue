<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps<{url:string, alt:string, close:()=>void}>()
const stage = ref<HTMLElement>()
const image = ref<HTMLImageElement>()
const scale = ref(1), x = ref(0), y = ref(0), failed = ref(false)
const pointers = new Map<number, {x:number,y:number}>()
const dragging = ref(false)
let observer:ResizeObserver | undefined
let pinch:{distance:number,scale:number,x:number,y:number,cx:number,cy:number} | undefined
const clamp = (n:number, limit:number) => Math.max(-limit, Math.min(limit,n))
const transform = computed(()=>`translate(${x.value}px, ${y.value}px) scale(${scale.value})`)
function constrain() {
  const host=stage.value, img=image.value
  if (!host || !img?.naturalWidth || !img.naturalHeight) return
  const ratio=Math.min(host.clientWidth/img.naturalWidth,host.clientHeight/img.naturalHeight)
  x.value=clamp(x.value,Math.max(0,(img.naturalWidth*ratio*scale.value-host.clientWidth)/2))
  y.value=clamp(y.value,Math.max(0,(img.naturalHeight*ratio*scale.value-host.clientHeight)/2))
}
function position(e:MouseEvent) {
  const r=stage.value!.getBoundingClientRect()
  return {x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2}
}
function zoom(next:number, anchor={x:0,y:0}) {
  next=Math.min(5,Math.max(1,next))
  const factor=next/scale.value
  x.value=anchor.x-(anchor.x-x.value)*factor
  y.value=anchor.y-(anchor.y-y.value)*factor
  scale.value=next;constrain()
}
function reset(){scale.value=1;x.value=0;y.value=0}
function gesture() {
  const [a,b]=pointers.values()
  pinch=b?{distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:scale.value,x:x.value,y:y.value,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2}:undefined
  dragging.value=pointers.size>0
}
function down(e:PointerEvent) {
  if(e.pointerType==='mouse' && e.button!==0)return
  e.preventDefault();stage.value?.focus({preventScroll:true})
  try{stage.value!.setPointerCapture(e.pointerId)}catch{/* Synthetic events may lack capture. */}
  pointers.set(e.pointerId,position(e));gesture()
}
function move(e:PointerEvent) {
  const prev=pointers.get(e.pointerId);if(!prev)return
  e.preventDefault();const current=position(e);pointers.set(e.pointerId,current)
  const [a,b]=pointers.values()
  if(b && pinch){
    scale.value=Math.min(5,Math.max(1,pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance))
    const factor=scale.value/pinch.scale
    x.value=(a.x+b.x)/2-(pinch.cx-pinch.x)*factor
    y.value=(a.y+b.y)/2-(pinch.cy-pinch.y)*factor
  }else if(scale.value>1){x.value+=current.x-prev.x;y.value+=current.y-prev.y}
  constrain()
}
function up(e:PointerEvent){if(pointers.delete(e.pointerId))gesture()}
function key(e:KeyboardEvent) {
  if(e.key==='+'||e.key==='=')zoom(scale.value*1.4)
  else if(e.key==='-')zoom(scale.value/1.4)
  else if(e.key==='0')reset()
  else if(scale.value>1 && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    x.value+=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0
    y.value+=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;constrain()
  }else return
  e.preventDefault()
}
onMounted(()=>{if(typeof ResizeObserver==='function'){observer=new ResizeObserver(constrain);observer.observe(stage.value!)}})
onBeforeUnmount(()=>{observer?.disconnect();pointers.clear()})
watch(()=>props.url,()=>{reset();failed.value=false})
</script>
<template>
  <div class="photo-viewer-toolbar"><h2 id="photo-viewer-title">Фотография блюда</h2><button id="photo-viewer-close" type="button" aria-label="Закрыть фотографию" @click="close">Закрыть</button></div>
  <div class="photo-viewer-zoom" aria-label="Масштаб фотографии"><button id="photo-zoom-out" type="button" aria-label="Уменьшить фотографию" :disabled="scale<=1" @click="zoom(scale/1.4)">−</button><output id="photo-zoom-value" aria-live="polite">{{Math.round(scale*100)}}%</output><button id="photo-zoom-in" type="button" aria-label="Увеличить фотографию" :disabled="scale>=5" @click="zoom(scale*1.4)">+</button><button id="photo-zoom-reset" type="button" @click="reset">Целиком</button></div>
  <div ref="stage" class="photo-viewer-stage" tabindex="0" :data-scale="scale" :data-pan-x="x" :data-pan-y="y" aria-label="Фотография: увеличение кнопками или двумя пальцами, перемещение увеличенного снимка" :style="{touchAction:'none',cursor:scale>1?(dragging?'grabbing':'grab'):'zoom-in'}" @wheel.prevent="zoom(scale*Math.exp(-$event.deltaY*.002),position($event))" @dblclick="scale>1?reset():zoom(2,position($event))" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @keydown="key"><img ref="image" class="photo-viewer-image" :src="url" :alt="alt" :style="{transform,transformOrigin:'center center',objectFit:'contain'}" draggable="false" @load="constrain" @error="failed=true"></div>
  <p class="photo-viewer-error inline-error" role="status" :hidden="!failed">Не удалось открыть фотографию. Закройте просмотр и попробуйте снова.</p><p class="photo-viewer-help">Увеличьте кнопками, колесом мыши или двумя пальцами. Увеличенный снимок можно перемещать. Escape — закрыть.</p>
</template>
