<script setup>
defineProps({ id: String, label: String, summary: String, open: Boolean })
</script>
<template>
  <details class="recipe-note ue-panel" :data-panel="id" :open="open">
    <summary><span>{{ label }}</span><small>{{ summary }}</small></summary>
    <slot />
  </details>
</template>
