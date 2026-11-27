<script setup>
defineProps({categories:Array,period:String,ui:Object})
</script>
<template>
  <form id="fj-expense-form" class="ue-expense-editor" hidden>
    <h3 id="fj-expense-heading">Карточка расхода</h3>
    <div class="fj-fields">
      <label>Название<input id="fj-expense-name" type="text"></label>
      <label>Папка или категория<select id="fj-expense-category"><option v-for="c in categories" :key="c.id" :value="c.id">{{ ui.catName(c) }}</option></select></label>
      <label>Сумма, ₽<input id="fj-expense-amount" type="text" inputmode="decimal"></label>
      <label>Дата<input id="fj-expense-date" type="date" :min="period+'-01'" :max="period+'-'+ui.journal.daysIn(period)" :value="period+'-01'"></label>
      <label>Разовый / регулярный<select id="fj-repeat"><option value="once">Разовый платёж</option><option value="monthly">Ежемесячно</option><option value="yearly">Ежегодно</option></select></label>
      <label>Метод учёта<select id="ue-accounting"><option v-for="(name,key) in ui.accounts" :key="key" :value="key">{{ name }}</option></select></label>
    </div>
    <label class="expenses-toggle"><input id="fj-expense-included" type="checkbox" checked>Включать в финансовый расчёт</label>
    <label class="expenses-toggle"><input id="ue-overhead" type="checkbox">Накладной расход для распределения на блюда</label>
    <p class="field-help">Упаковка не распределяется повторно. Покупку оборудования включайте в накладные только осознанно; автоматической амортизации нет.</p>
    <div id="fj-tax-fields" hidden class="fj-fields">
      <label>Система налогообложения<select id="ue-tax-system"><option value="">Не указана</option><option v-for="(name,key) in ui.journal.TAX_SYSTEMS" :key="key" :value="key">{{ name }}</option></select></label>
      <label>Ставка, %<input id="ue-tax-rate" type="text" inputmode="decimal"></label>
      <label>Название налога / платежа (можно оставить пустым при выбранной системе)<input id="fj-tax-type" type="text"></label>
      <label>Отчётный период (месяц, квартал, год)<input id="fj-tax-period" type="text" :value="period"></label>
      <p class="field-help">Ставку указываете вы. Сумма платежа вводится вручную и не изменяется при выборе системы или ставки.</p>
    </div>
    <label>Примечание<textarea id="ue-expense-note" maxlength="5000"></textarea></label>
    <p class="field-help">При редактировании меняется выбранный месяц. Для другой даты начала или периодичности серии завершите старые повторения и создайте новую серию.</p>
    <button type="submit" data-save-action>Сохранить расход</button><button type="button" id="ue-cancel-expense">Закрыть карточку</button><div id="ue-series-controls"></div>
  </form>
</template>
