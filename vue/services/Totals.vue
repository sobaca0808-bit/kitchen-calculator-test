<script setup>
import { computed } from 'vue'
const props = defineProps({ month: Object, summary: Object, previous: Object, ui: Object })
const metrics = computed(() => {
  const { month, summary:s, ui } = props
  const format = ui.money
  return [
    ['revenue', month.method === 'monthly-average' ? 'Расчётная выручка' : 'Выручка', format(s.revenueCents)],
    ['cash','Фактически оплачено',format(s.cashCents)], ['accrued','Начислено, не оплачено',format(s.accruedCents)],
    ['estimated','Расчётные расходы',format(s.estimatedCents)], ['unclassified','PR41: метод не указан',format(s.unclassifiedCents)],
    ['expense-total','Расходы выбранного метода',format(s.totalCents)], ['share','Доля расходов в выручке',ui.percent(s.sharePercent)],
    ['result',(month.reportBasis||'cash') === 'cash' && month.method !== 'monthly-average' ? 'Финансовый остаток по денежным операциям' : 'Расчётный финансовый остаток',format(s.remainderCents)]
  ]
})
</script>
<template>
  <label>Метод отчёта<select id="ue-report-basis" :value="month.reportBasis || 'cash'"><option v-for="(name,key) in ui.bases" :key="key" :value="key">{{ name }}</option></select></label>
  <dl class="profitability-grid"><div v-for="[id,label,value] in metrics" :key="id"><dt>{{ label }}</dt><dd :id="'fj-'+id">{{ value }}</dd></div></dl>
  <h3>По категориям / папкам</h3><p v-for="category in summary.byCategory" :key="category.id">{{ ui.catName(category) }}: <strong>{{ ui.money(category.totalCents) }}</strong></p><p v-if="!summary.byCategory.length">Включённых расходов этого метода нет.</p>
  <h3>Сравнение с {{ previous?.period || '—' }}</h3><p>Выручка: {{ ui.money(previous?.revenueCents) }} → {{ ui.money(summary.revenueCents) }}</p>
  <p id="ue-comparison">Расходы: {{ ui.money(previous?.totalCents) }} → {{ ui.money(summary.totalCents) }}; остаток: {{ ui.money(previous?.remainderCents) }} → {{ ui.money(summary.remainderCents) }}</p>
  <p class="profitability-note">Оплата, начисленные обязательства и оценки показаны раздельно. Остаток не является чистой прибылью: продуктовые затраты и прочие обязательства могут быть внесены не полностью. После оплаты изменяйте существующую запись с «Начислено» на «Оплачено», не добавляя второй расход.</p>
  <p v-if="summary.unclassifiedCents" class="field-help">У старых подтверждённых записей PR41 метод не был указан. Суммы сохранены; уточните метод в карточке расхода. Они не выданы за фактическую оплату.</p>
</template>
