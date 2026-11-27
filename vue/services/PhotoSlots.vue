<script setup>
defineProps({ primary:Boolean })
const suffix = i => i === 1 ? '' : '-2'
</script>
<template>
  <h3>Фотографии блюда</h3>
  <div class="photo-editor-grid">
    <div v-for="i in 2" :key="i" class="photo-editor-slot" :data-photo-slot="i-1" role="group" :aria-label="'Фотография '+i">
      <strong>Фото {{ i }}{{ primary ? (i === 1 ? ' · Основное' : ' · Дополнительное') : '' }}</strong>
      <button type="button" class="photo-frame-button" aria-label="Добавить или заменить фотографию"></button>
      <div class="photo-slot-actions">
        <button type="button" class="photo-pick">Галерея</button><button type="button" class="photo-camera-pick">Камера</button>
        <button :id="'remove-photo'+suffix(i)" type="button" class="danger">Удалить фото</button>
        <button v-if="primary && i === 2" type="button" id="make-primary-photo">Сделать основным</button>
      </div>
      <input :id="'photo-file'+suffix(i)" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      <input :id="'photo-camera'+suffix(i)" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
      <p class="photo-status" role="status" aria-live="polite"></p>
    </div>
  </div>
  <button id="swap-photos" type="button">Поменять фотографии местами</button>
  <p class="field-help">До двух фотографий JPEG, PNG или WebP до 10 МБ каждая. Снимки уменьшаются до 1920 пикселей и 500 КБ и хранятся в этом браузере. Для переноса используйте экспорт JSON. Камера доступна, если её поддерживает устройство и браузер.</p>
</template>
