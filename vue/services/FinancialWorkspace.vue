<script setup>
import { computed } from 'vue'
import Panel from './Panel.vue'
import Revenue from './Revenue.vue'
import History from './History.vue'
import Totals from './Totals.vue'
import Allocation from './Allocation.vue'
import ExpenseTable from './ExpenseTable.vue'
import ExpenseForm from './ExpenseForm.vue'

const props=defineProps({ saved:Object,period:String,view:String,openState:Object,ui:Object,legacy:Object,hasSaved:Boolean,formRevision:Number,onEdit:Function })
const month=computed(()=>props.saved.months[props.period] || props.ui.journal.emptyMonth())
const months=computed(()=>props.ui.journal.periods(props.saved).reverse())
const summary=computed(()=>props.ui.journal.summary(props.saved,props.period))
const basis=computed(()=>props.ui.journal.basisSummary(props.saved,props.period,month.value.reportBasis || 'cash'))
const previous=computed(()=>props.period === '1000-01' ? null : props.ui.journal.basisSummary(props.saved,props.ui.journal.move(props.period,-1),month.value.reportBasis || 'cash'))
const operations=computed(()=>props.ui.journal.operations(props.saved,props.period))
const byCategory=computed(()=>{
  const map=new Map()
  for (const row of summary.value.rows) {
    if (!map.has(row.categoryId)) map.set(row.categoryId,[])
    map.get(row.categoryId).push(row)
  }
  return map
})
const folders=computed(()=>props.saved.categories.filter(c=>!c.deleted && (!c.archived || byCategory.value.has(c.id))))
const archive=computed(()=>props.saved.categories.filter(c=>c.archived || c.deleted))
const categories=computed(()=>props.ui.journal.categories(props.saved).filter(c=>!c.archived && !c.deleted))
const groups=computed(()=>{
  const specs=[
    ['fixed','3. Постоянные расходы',['fj-cat-rent','fj-cat-payroll','fj-cat-utilities','fj-cat-maintenance']],
    ['tax','4. Налоги и обязательные платежи',['fj-cat-taxes']],
    ['materials','5. Канцелярия и расходные материалы',['fj-cat-office','fj-cat-cleaning','fj-cat-packaging']]
  ]
  return specs.map(([id,label,ids])=>{
    const rows=summary.value.rows.filter(r=>ids.includes(r.categoryId))
    const sum=props.ui.journal.sum(rows.filter(r=>r.included).map(r=>r.amountCents))
    return {id,label,category:ids[0],rows,total:props.ui.money(sum)}
  })
})
</script>
<template>
  <section class="fj-workspace" data-unified-expenses>
    <div class="editor-head"><div class="editor-topline">
      <span class="badge">{{ view === 'journal' ? 'История' : 'Единый учёт заведения' }}</span>
      <span id="save-state" class="save-state">{{ hasSaved ? 'Сохранено в браузере' : 'Данные ещё не сохранены' }}</span>
    </div><h1>{{ view === 'journal' ? 'Финансовый журнал' : 'Расходы заведения' }}</h1>
    <p class="intro">Выручка, расходы и финансовые показатели используют одни сохранённые записи.</p></div>
    <div class="editor-content">
      <div class="fj-period"><button id="fj-previous" type="button" aria-label="Предыдущий месяц">←</button>
        <label>Месяц и год<input id="fj-period" type="month" :value="period"></label>
        <button id="fj-next" type="button" aria-label="Следующий месяц">→</button>
        <label>История месяцев<select id="fj-history"><option value="">Выбрать…</option><option v-for="p in months" :key="p" :value="p">{{ p }}</option></select></label>
      </div><p id="fj-error" class="inline-error" role="alert" tabindex="-1"></p>
      <History :key="period" v-if="view === 'journal'" :operations="operations" :period="period" :last-day="ui.journal.daysIn(period)" :money="ui.money" :tax-info="ui.taxInfo" :accounts="ui.accounts" :on-edit="onEdit"/>
      <template v-else>
        <Panel id="revenue" label="1. Выручка заведения" :open="openState.revenue" :summary="ui.money(summary.revenueCents)">
          <Revenue :key="formRevision" :month="month" :period="period" :ui="ui"/>
        </Panel>
        <Panel id="totals" label="2. Финансовые итоги" :open="openState.totals" :summary="ui.money(basis.remainderCents)">
          <Totals :key="formRevision" :month="month" :summary="basis" :previous="previous" :ui="ui"/>
        </Panel>
        <Panel v-for="group in groups" :key="group.id" :id="group.id" :label="group.label" :open="openState[group.id]" :summary="group.total">
          <button type="button" :data-add-group="group.category">+ Добавить расход</button>
          <ExpenseTable :rows="group.rows" :ui="ui"/><div class="ue-editor-slot" :data-slot="group.id"></div>
        </Panel>
        <Panel id="folders" label="6. Прочие расходы и пользовательские папки" :open="openState.folders" :summary="folders.length+' папок'">
          <button type="button" id="ue-create-folder">+ Создать папку</button>
          <form :key="formRevision" id="fj-category-form" hidden><label>Название папки<input id="fj-category-name" type="text"></label><button type="submit" data-save-action>Сохранить папку</button></form>
          <h3>Прочие расходы</h3><button type="button" data-add-group="fj-cat-other">+ Добавить расход</button>
          <ExpenseTable :rows="byCategory.get('fj-cat-other') || []" :ui="ui"/>
          <details v-for="folder in folders" :key="folder.id" :data-folder="folder.id" :open="openState[folder.id]">
            <summary>{{ folder.name }} · {{ byCategory.get(folder.id)?.length || 0 }}</summary>
            <button type="button" :data-folder-add="folder.id">+ Добавить расход</button>
            <button type="button" :data-folder-rename="folder.id">Переименовать</button>
            <button type="button" class="danger" :data-folder-delete="folder.id">Удалить папку</button>
            <ExpenseTable :rows="byCategory.get(folder.id) || []" :ui="ui"/><div class="ue-editor-slot" :data-slot="folder.id"></div>
          </details>
          <div class="ue-editor-slot" data-slot="folders"></div>
          <details><summary>Архив папок</summary><p v-for="folder in archive" :key="folder.id">{{ folder.name }} <button type="button" :data-folder-restore="folder.id">Восстановить папку</button></p><p v-if="!archive.length">Архив пуст.</p></details>
        </Panel>
        <Panel id="allocation" label="7. Распределение расходов на блюда" :open="openState.allocation" :summary="saved.allocationPeriod || 'Не изменён прежний план'">
          <Allocation :key="formRevision" :saved="saved" :month="month" :legacy="legacy" :ui="ui" :period="period"/>
        </Panel>
      </template>
      <div id="ue-editor-parking"><ExpenseForm :key="formRevision" v-if="view === 'entry'" :categories="categories" :period="period" :ui="ui"/></div>
      <button v-if="view === 'entry'" type="button" id="fj-reset">Отменить несохранённые изменения</button>
    </div>
    <div v-if="view === 'entry'" class="form-actions"><button id="save-item" class="primary" type="button">Сохранить</button></div>
  </section>
</template>
