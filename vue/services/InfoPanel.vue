<script setup lang="ts">
import {ref} from 'vue'
const props = defineProps<{kind:string,mode:string,build:string,settings:()=>void}>()
const area=ref<HTMLTextAreaElement>()
const label=ref('Скопировать обращение')
const copying=ref(false)
async function copy() {
  if(!area.value || copying.value)return
  copying.value=true
  label.value='Копирование…'
  let timeout:ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([navigator.clipboard.writeText(area.value.value+'\n'+props.build),
      new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Clipboard unavailable')),1800)})])
    label.value='Скопировано ✓'
  } catch {
    area.value?.focus()
    area.value?.select()
    label.value='Выделено — скопируйте текст'
  } finally {
    clearTimeout(timeout)
    copying.value=false
  }
}
</script>
<template>
  <p v-if="kind==='about'">СИНТЕЗ МЕРЫ — кухонный калькулятор. Один справочник продуктов и рецептов для трёх режимов. Данные хранятся на вашем устройстве. {{ build }}</p>
  <p v-else-if="kind==='help'">{{ mode === 'business' ? 'Добавьте продукты с ценами,' : 'Добавьте продукты,' }} затем создайте заготовку или рецепт. Сохраните карточку. Для переноса между устройствами используйте JSON в настройках. Режимы расширяют инструменты и используют одну базу.</p>
  <p v-else>Внешний сервис отправки пока не подключён. Опишите проблему и скопируйте текст обращения, чтобы передать его владельцу приложения. Данные базы автоматически не отправляются.</p>
  <template v-if="kind==='feedback'"><label>Ваше сообщение<textarea id="feedback-text" ref="area" rows="5" maxlength="10000"></textarea></label><button type="button" :disabled="copying" @click="copy">{{ label }}</button></template>
  <button v-else type="button" @click="settings">Резервная копия и настройки</button>
</template>
