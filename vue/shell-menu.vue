<script setup lang="ts">
import { computed } from 'vue';
import { shell, policy, show, titles, menuSections, type Tool } from './shell-state';
const paths:Partial<Record<Tool,string>> = {dashboard:'M3 11 12 3l9 8M5 10v11h14V10M9 21v-8h6v8',calculator:'M5 2h14v20H5zM8 6h8M8 11h2m4 0h2M8 15h2m4 0h2M8 19h2m4 0h2',recipes:'M3 3c4-1 6 0 9 2 3-2 5-3 9-2v17c-4-1-6 0-9 2-3-2-5-3-9-2zM12 5v17',products:'M4 9c-1-5 6-6 8-3 4-4 9-1 8 4l-4 10H8zM12 5V2',prep:'m2 7 10-5 10 5-10 5zM2 12l10 5 10-5M2 17l10 5 10-5',favorites:'m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z',analysis:'M3 22V12h4v10m3 0V7h4v15m3 0V2h4v20',expenses:'M3 4h18v16H3zM3 8h18M7 13h4m-4 3h7',cards:'M5 2h14v20H5zM8 7h8M8 12h8m-8 5h5'};
const allowed = computed(() => policy().menus[shell.mode]);
const items = computed(() => [...allowed.value,...(Object.keys(titles) as Tool[]).filter(key=>!allowed.value.includes(key))]);
</script>
<template>
  <nav class="tabs unified-core-tabs" aria-label="Разделы">
    <button v-for="id in items" :key="id" type="button" :data-tab="menuSections[id]" :data-unified-tool="id" :data-sintez-route="id" :hidden="!allowed.includes(id)" :aria-current="shell.active === id ? 'page' : 'false'" @click.stop="show(id)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path :d="paths[id] || paths.cards"/></svg><span class="unified-menu-label">{{ shell.mode==='home' && id==='calculator' ? 'Новый рецепт' : titles[id] }}</span><span v-if="menuSections[id] && id!=='expenses'" :id="'count-'+menuSections[id]">{{ shell.counts[menuSections[id]!] }}</span>
    </button>
  </nav>
</template>
