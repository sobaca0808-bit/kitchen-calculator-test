<script setup>
import { computed } from 'vue'
const props=defineProps({ saved:Object, month:Object, legacy:Object, period:String, ui:Object })
const cfg=computed(()=>props.month.allocation || {method:'planned-portions',basis:'cash',plannedPortions:props.legacy?.plannedPortions})
const previous=computed(()=>props.ui.allocation.previewLegacy(props.saved,props.legacy))
const active=computed(()=>props.saved.allocationPeriod ? props.ui.allocation.resolve(props.saved,100) : null)
</script>
<template>
  <div class="fj-fields">
    <label>Способ распределения<select id="ue-allocation-method" :value="cfg.method"><option value="planned-portions">По плановым порциям</option><option value="by-revenue">По месячной выручке</option></select></label>
    <label>Какие накладные учитывать<select id="ue-allocation-basis" :value="cfg.basis"><option v-for="(name,key) in ui.bases" :key="key" :value="key">{{ name }}</option></select></label>
    <label>Плановое количество порций<input id="ue-planned-portions" type="text" inputmode="numeric" :value="cfg.plannedPortions ?? ''"></label>
  </div>
  <p class="field-help">В распределение входят только включённые записи с признаком «Накладной расход». Упаковка исключена: она уже учитывается в карточке. На полуфабрикаты надбавка повторно не начисляется.</p>
  <button type="button" id="ue-apply-month" data-save-action>Сохранить и применить {{ period }} к блюдам</button>
  <p id="ue-active-allocation"><template v-if="active">Активный месяц: {{ active.period }} · {{ active.method === 'by-revenue' ? 'По выручке' : 'По порциям' }} · {{ ui.allocation.BASE_LABELS[active.basis] }}. {{ active.status !== 'ready' ? active.issues.join(' ') : active.method === 'by-revenue' ? 'Доля накладных: '+ui.percent(active.ratePercent) : 'Накладные на порцию: '+ui.rub(active.perPortion) }}</template><template v-else>Новый источник для блюд пока не выбран. Прежний сохранённый план продолжает действовать.</template></p>
  <p class="field-help">Формулы: по порциям — накладные / план порций; по выручке — накладные / выручка месяца × цена продажи порции. Способы применяются по одному. Просмотр другого месяца не переключает активный расчёт. В карточке блюда используется её прежний переключатель «Учитывать расходы заведения».</p>
  <details v-if="legacy"><summary>Прежний план — просмотр и безопасный перенос</summary>
    <p>Месяц: {{ legacy.period }}. План порций: {{ legacy.plannedPortions ?? '—' }}. Исходный план сохранён; повторного независимого ввода сумм здесь нет.</p>
    <p v-for="item in previous.rows" :key="item.id || item.name">{{ item.name }}: {{ ui.money(item.amountCents) }} — {{ item.existing ? 'уже есть запись, второй расход не создаётся' : 'можно перенести как оценку' }}</p>
    <p v-for="issue in previous.issues" :key="issue" class="inline-error">{{ issue }}</p>
    <button type="button" id="ue-adopt-legacy" :disabled="!!previous.issues.length">Перенести отсутствующие статьи в записи</button>
  </details>
</template>
