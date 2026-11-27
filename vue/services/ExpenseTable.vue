<script setup>
defineProps({ rows: Array, ui: Object })
</script>
<template>
  <div v-if="rows.length" class="fj-table-wrap"><table class="fj-table">
    <thead><tr><th>Название / дата / папка</th><th>Сумма и учёт</th><th>Действия</th></tr></thead>
    <tbody><tr v-for="row in rows" :key="row.id" :data-fj-expense="row.id">
      <td><strong>{{ row.name }}</strong><br><small>{{ row.date }} · {{ row.categoryName }}{{ ui.taxInfo(row) ? ' · '+ui.taxInfo(row) : '' }}{{ row.repeat === 'once' ? '' : row.repeat === 'monthly' ? ' · Ежемесячно' : ' · Ежегодно' }}</small><p v-if="row.note" class="field-help">{{ row.note }}</p></td>
      <td>{{ ui.money(row.amountCents) }}<br><small>{{ ui.accounts[ui.journal.accounting(row)] }}{{ row.included ? '' : ' · Исключён' }}{{ ui.journal.overhead(row) ? ' · Накладной' : '' }}</small></td>
      <td><button type="button" :data-expense-edit="row.id">Изменить</button><button type="button" :data-expense-toggle="row.id">{{ row.included ? 'Исключить' : 'Включить' }}</button><button type="button" class="danger" :data-expense-delete="row.id">Удалить</button></td>
    </tr></tbody>
  </table></div>
  <p v-else class="field-help">За выбранный месяц записей нет.</p>
</template>
