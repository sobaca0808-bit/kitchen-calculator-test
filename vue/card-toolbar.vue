<script setup lang="ts">
import {ref} from 'vue'
defineProps<{mode:string,portions:string,folder:string,folders:{id:string,name:string}[],detail:string}>()
const details = ref<HTMLDetailsElement>()
const input = ref<HTMLInputElement>()
const trigger = ref<HTMLButtonElement>()
const expanded = ref(false)
function toggle(open:boolean) {
  if(!details.value)return
  details.value.open=open
  if(open)input.value?.focus();else trigger.value?.focus()
}
</script>
<template>
  <div class="card-controls"><span class="unified-card-caption">Рецепт</span><button id="back-list">← Назад</button><div class="review-card-actions"><button id="edit-recipe" class="green-action">Изменить</button><button ref="trigger" id="portions-recipe" class="green-action" aria-controls="recipe-options" :aria-expanded="expanded" @click="toggle(!details?.open)">Порции</button><button id="print-recipe" class="green-action">Печать</button></div>
    <p id="view-error" role="status"></p>
    <details ref="details" id="recipe-options" class="unified-card-options" @toggle="expanded=!!details?.open"><summary hidden>Порции и печать</summary><div class="unified-card-option-fields"><button class="review-options-back" type="button" @click="toggle(false)">← Назад</button>
      <label data-finance-only>Форма карты<select id="card-mode" :value="mode"><option value="calculation">Калькуляционная карта</option><option value="chef">Карта повара</option></select></label>
      <label>Количество порций<input ref="input" id="view-portions" type="text" inputmode="decimal" :value="portions"></label>
      <label>Фотографии при печати<select id="print-photos"><option value="none">Без фотографий</option><option value="first">Только первая</option><option value="second">Только вторая</option><option value="both">Обе фотографии</option></select></label>
      <label class="expense-print-control" data-professional-only>Статьи расходов при печати<select id="print-expense-detail" :value="detail"><option value="summary">Только итоги</option><option value="full">С детализацией</option></select><small>Без цен — форма «Карта повара».</small></label>
      <div class="recipe-folder-move"><label>Папка блюда<select id="move-folder" :value="folder"><option value="">Без папки</option><option v-for="item in folders" :key="item.id" :value="item.id">{{item.name}}</option></select></label><button id="move-recipe" disabled>Переместить</button></div>
    </div></details>
  </div><article id="recipe-card" class="recipe-card"></article>
</template>
