<script setup>
import { ref } from 'vue'
const props=defineProps({ conflict:Object, ui:Object, choose:Function })
const expanded=ref(false)
</script>
<template>
  <section class="import-conflict" :data-conflict-key="conflict.key">
    <h3>{{ ui.entryLabel(conflict) }}: {{ ui.visibleName(conflict) }}</h3><p>{{ conflict.reason }}</p>
    <label>Решение<select :data-conflict-choice="conflict.key" :value="conflict.choice || ''" @change="choose(conflict.key,$event.target.value)">
      <option value="">Выберите действие…</option><option v-for="v in (conflict.options || ['local','both'])" :key="v" :value="v">{{ ui.choiceLabel(v) }}</option>
    </select></label>
    <details @toggle="expanded=$event.currentTarget.open"><summary>Сравнить содержимое</summary>
      <template v-if="expanded">
        <p class="field-help">{{ ui.home() ? 'Финансовые настройки скрыты в текущем режиме. Выбранное действие применяется к полной записи.' : 'Большие поля показаны сокращённо, данные фото — без длинной строки изображения. Сам файл обрабатывается полностью.' }}</p>
        <div class="import-comparison"><div><h4>Текущая версия</h4><pre>{{ ui.readable(conflict.local,conflict) }}</pre></div><div><h4>Из файла</h4><pre>{{ ui.readable(conflict.incoming,conflict) }}</pre></div></div>
      </template>
    </details>
  </section>
</template>
