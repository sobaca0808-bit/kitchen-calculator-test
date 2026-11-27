<script setup>
defineProps({ view: String, switchView: Function })
</script>
<template>
  <nav class="expense-workspace-tabs" aria-label="Расходы и история">
    <button id="expense-entry-tab" type="button" :aria-pressed="view === 'entry'" @click="switchView('entry')">Расходы заведения</button>
    <button id="financial-journal-tab" type="button" :aria-pressed="view === 'journal'" @click="switchView('journal')">Журнал и календарь</button>
  </nav>
  <div class="expense-workspace-pane"></div>
</template>
