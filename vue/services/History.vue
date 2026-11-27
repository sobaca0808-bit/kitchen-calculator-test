<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ operations: Array, period: String, lastDay: Number, money: Function, taxInfo: Function, accounts: Object, onEdit: Function })
const date = ref('')
const visible = computed(() => date.value ? props.operations.filter(r => r.date === date.value) : props.operations)
</script>
<template>
  <section class="recipe-note">
    <h2>Календарь и история операций</h2>
    <p>Это просмотр тех же сохранённых записей. Ввод и изменение открываются в разделе «Расходы заведения».</p>
    <label>Показать дату (пусто — весь месяц)<input id="ue-journal-date" type="date" v-model="date" :min="period+'-01'" :max="period+'-'+lastDay"></label>
    <p>Операций: <strong id="ue-operation-count">{{ visible.length }}</strong></p>
    <div class="fj-table-wrap"><table class="fj-table">
      <thead><tr><th>Дата / операция</th><th>Сумма / учёт</th><th>Открыть</th></tr></thead>
      <tbody><tr v-for="row in visible" :key="row.id" :data-operation="row.id">
        <td>{{ row.date }}<br><strong>{{ row.name }}</strong><template v-if="row.kind === 'expense'"><br>{{ row.categoryName }}<template v-if="taxInfo(row)"><br>{{ taxInfo(row) }}</template></template><p v-if="row.note">{{ row.note }}</p></td>
        <td>{{ money(row.amountCents) }}<br>{{ !row.active ? 'Не включено в итог' : row.kind === 'expense' ? accounts[row.accounting] : row.source === 'monthly-average' ? 'Оценка' : 'Активная выручка' }}</td>
        <td><button type="button" :data-journal-edit="row.id" @click="onEdit({kind:row.kind,id:row.entryId,date:row.date,source:row.source})">В разделе расходов</button></td>
      </tr></tbody>
    </table></div>
    <p v-if="!visible.length">За выбранную дату операций нет.</p>
  </section>
</template>
