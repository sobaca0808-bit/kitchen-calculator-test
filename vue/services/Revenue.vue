<script setup>
import { computed } from 'vue'
const props = defineProps({ month: Object, period: String, ui: Object })
const days = computed(() => Object.entries(props.month.days).filter(([, r]) => !r.deleted).sort(([a],[b]) => a.localeCompare(b)))
</script>
<template>
  <form id="fj-revenue-form">
    <label>Активный способ за {{ period }}<select id="fj-method" :value="month.method"><option v-for="(label,key) in ui.methods" :key="key" :value="key">{{ label }}</option></select></label>
    <p class="field-help">В итог входит один выбранный способ. Значения остальных сохраняются и не прибавляются к нему.</p>
    <div id="fj-daily-fields" class="fj-fields">
      <label>Дата выручки<input id="fj-day" type="date" :value="period+'-01'" :min="period+'-01'" :max="period+'-'+ui.journal.daysIn(period)"></label>
      <label>Дневная выручка, ₽<input id="fj-day-amount" type="text" inputmode="decimal"></label>
      <button type="submit" data-save-action>Сохранить дневную выручку</button><p id="fj-day-note" class="field-help"></p>
    </div>
    <div id="fj-monthly-fields">
      <label id="fj-total-label">Выручка за месяц, ₽<input id="fj-month-total" inputmode="decimal" :value="ui.raw(month.monthlyTotalCents)"></label>
      <div id="fj-average-fields" class="fj-fields">
        <label>Средняя дневная выручка, ₽<input id="fj-average" type="text" inputmode="decimal" :value="ui.raw(month.averageDailyCents)"></label>
        <label>Рабочих дней<input id="fj-working-days" type="text" inputmode="numeric" :value="month.workingDays ?? ''"></label>
      </div>
      <button type="submit" data-save-action>Сохранить выручку</button>
    </div>
  </form>
  <details><summary>Дневные записи ({{ days.length }})</summary>
    <p v-for="[day,row] in days" :key="day" :data-fj-day="day">{{ day }}: {{ ui.money(row.amountCents) }} <button type="button" :data-day-edit="day">Изменить</button> <button type="button" class="danger" :data-day-delete="day">Удалить</button></p>
    <p v-if="!days.length">Записей пока нет.</p>
  </details>
</template>
