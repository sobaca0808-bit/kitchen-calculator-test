<script setup>
defineProps({ sources:Array, mode:String, actions:Function })
function counts(source) {
  if(source.error || !source.data)return 'Запись: '+(source.error || 'отсутствует')
  const d=source.data, num=type=>d.recipes.filter(r=>r.type===type).length
  return 'Продуктов: '+d.products.length+' · Полуфабрикатов: '+num('prep')+' · Блюд: '+num('dish')+' · Папок: '+(d.folders||[]).length+' · Упаковки: '+(d.packaging||[]).length
}
function examples(source,mode) {
  return source.data.products.slice(0,3).map(p=>p.name+(['home','chef'].includes(mode)?'':' — '+(p.price===null?'нет цены':p.price+' ₽'))).join('; ')+'. Рецепты: '+source.data.recipes.slice(0,4).map(r=>r.name).join('; ')
}
</script>
<template>
  <section v-for="source in sources" :key="source.id" class="import-conflict" :data-storage-source="source.id">
    <h3>{{ source.label }}</h3><p class="import-file-name">{{ source.key }}</p>
    <p>{{ counts(source) }}</p><p v-if="source.data" class="field-help">Примеры: {{ examples(source,mode) }}</p>
    <p class="field-help">Черновики: {{ source.draftCount }}{{ source.draftError ? ' · '+source.draftError : '' }}. Черновики остаются в исходном хранилище и не входят в обычный экспорт карточек.</p>
    <div class="import-backup-actions"><button v-for="button in actions(source)" :key="button.kind" type="button" :disabled="button.disabled" :data-diagnostic-action="button.kind" @click="button.action">{{ button.label }}</button></div>
  </section>
</template>
