<script setup>
defineProps({ themes:Object })
</script>
<template>
        <button id="appearance-toggle" class="quiet appearance-toggle" type="button" aria-expanded="false" aria-controls="appearance-panel" aria-haspopup="dialog"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3.1 1.7 1.7 0 0 1 1.4-2.6H18a3 3 0 0 0 3-3.1A9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="6.8" r=".8"/><circle cx="15.5" cy="8" r=".8"/><circle cx="6.8" cy="14.5" r=".8"/></svg><span>Оформление</span></button>
        <section id="appearance-panel" class="appearance-panel" role="dialog" aria-label="Оформление калькулятора" hidden>
          <h2>Оформление</h2><p class="appearance-intro">Три настроения одной кухни</p>
          <fieldset class="appearance-options"><legend class="sr-only">Выберите тему</legend>
            <label v-for="(theme,key) in themes" :key="key" class="appearance-option"><span class="appearance-preview" :data-theme="key" aria-hidden="true"></span><span class="appearance-name"><input type="radio" name="kitchen-appearance" :value="key"><span>{{ theme.name }}</span></span></label>
          </fieldset>
          <p id="appearance-status" class="appearance-status" role="status" aria-live="polite">Меняется только оформление. Рецепты остаются прежними.</p>
        </section>
</template>
