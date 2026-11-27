<script setup lang="ts">
import { shell, home, selectMode, settings, leaveSettings, diagnostics, showAlert } from './shell-state';
const modes = [
  {id:'home', number:'01', name:'Для дома', copy:'Продукты, рецепты и простые расчёты', path:'m9 29 23-19 23 19M16 25v29h32V25M26 54V36h12v18M39 15v-5h7v11', detail:'M7 58h50M22 29h5M37 29h5'},
  {id:'chef', number:'02', name:'Для повара', copy:'Рецепты, техкарты и профессиональная работа', path:'M18 39a11 11 0 0 1-1-22 16 16 0 0 1 30 0 11 11 0 0 1-1 22v15H18ZM18 45h28M26 33v11M38 33v11', detail:'M12 58h40M28 16a6 6 0 0 1 8 0'},
  {id:'business', number:'03', name:'Для бизнеса', copy:'Себестоимость, расходы и управление затратами', path:'M13 25h38v30H13zM9 25l5-14h36l5 14M9 25c0 10 11 10 12 0 0 10 11 10 11 0 0 10 11 10 11 0 0 10 12 10 12 0M22 55V40h20v15M14 19h36'}
] as const;
</script>
<template>
  <header class="sintez-header">
    <div class="sintez-wordmark unified-brand" aria-label="СИНТЕЗ МЕРЫ"><img :src="'icons/sintez/icon-192.png'" alt="Фирменный логотип СИНТЕЗ МЕРЫ" width="76" height="76"><span>СИНТЕЗ МЕРЫ<small>Кухонный калькулятор</small></span></div>
    <button id="sintez-home-button" class="review-home green-action" data-sintez-home type="button" @click.stop="home"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 10.7 4a2 2 0 0 1 2.6 0l7.7 6.5M5 9v10a2 2 0 0 0 2 2h3v-5a2 2 0 1 1 4 0v5h3a2 2 0 0 0 2-2V9"/></svg>Главная</button>
    <button class="sintez-settings-access" data-sintez-route="settings" type="button" aria-label="Настройки" title="Настройки" @click.stop="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m10 3-1 3-3 1-2 3 2 2v3l2 2 3-1 2 2 3-1 1-3 3-1v-4l-3-1-1-3-3-1-2 2Z"/><circle cx="12" cy="11" r="3"/></svg><span>Настройки</span><i id="sintez-settings-error" aria-hidden="true" :hidden="!shell.alert"/></button>
  </header>
  <section id="sintez-alert" class="sintez-alert" role="alert" :hidden="!shell.alert"><p id="sintez-alert-text">{{ shell.alert }}</p><button id="sintez-alert-action" type="button" @click.stop="showAlert">Подробнее</button></section>
  <p id="sintez-status" class="sintez-status" role="status" aria-live="polite">{{ shell.notice }}</p>
  <main id="sintez-home" :hidden="shell.screen === 'settings'">
    <div class="sintez-intro"><h1 tabindex="-1">Выберите режим работы</h1><p class="sintez-lead">От домашнего рецепта до профессионального расчёта себестоимости.</p></div>
    <div class="sintez-ruler" aria-hidden="true"/>
    <nav class="sintez-grid sintez-mode-grid" aria-label="Режимы работы">
      <button v-for="item in modes" :key="item.id" class="sintez-mode-card" :data-sintez-mode="item.id" type="button" :aria-labelledby="`sintez-${item.id}-name`" :aria-describedby="`sintez-${item.id}-copy`" :aria-pressed="shell.screen === 'workspace' && shell.mode === item.id" @click.stop="selectMode(item.id)">
        <span class="sintez-mode-number" aria-hidden="true">{{ item.number }}</span><span class="sintez-mode-icon"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" :stroke-width="item.id==='business' ? 2 : 1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.path"/><path v-if="'detail' in item" :d="item.detail" opacity=".45"/></svg></span><span class="sintez-mode-title" :id="`sintez-${item.id}-name`">{{ item.name }}</span><span class="sintez-mode-copy" :id="`sintez-${item.id}-copy`">{{ item.copy }}</span><span class="sintez-mode-action" aria-hidden="true"><span>Открыть</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span>
      </button>
    </nav>
    <button class="sintez-resume" id="sintez-resume" data-sintez-resume type="button" hidden>Продолжить открытую работу <span aria-hidden="true">→</span></button>
  </main>
  <section id="sintez-settings" aria-labelledby="sintez-settings-title" :hidden="shell.screen !== 'settings'">
    <button class="sintez-back" data-sintez-home data-settings-back type="button" @click.stop="leaveSettings">← Назад</button><h1 id="sintez-settings-title" tabindex="-1">Настройки</h1><p class="sintez-lead">Оформление, резервные копии и приложение.</p>
    <div class="sintez-settings-grid">
      <p class="classic-theme-label">Оформление: Classic Dark Glass</p>
      <fieldset class="sintez-setting"><legend>Оформление приложения</legend></fieldset>
      <section id="settings-backup" class="sintez-setting sintez-setting-wide"><h2>Резервные копии</h2><p>Сохраните библиотеку вместе с фотографиями в JSON. Перед импортом откроется проверка изменений.</p><div class="sintez-setting-actions"/></section>
      <section class="sintez-setting"><h2>Знакомство с приложением</h2><p>Утверждённая презентация «СИНТЕЗ МЕРЫ».</p><button id="sintez-presentation-replay" type="button">Посмотреть презентацию снова</button><p id="sintez-presentation-status" role="status"/></section>
      <section class="sintez-setting" id="sintez-pwa-settings"><h2>Приложение и обновления</h2><p>Установка, работа без интернета и безопасное обновление.</p></section>
      <section class="sintez-setting sintez-setting-wide"><div><h2>Сохранение данных</h2><p>Проверка хранилища и доступ к существующим средствам восстановления.</p></div><button data-sintez-diagnostics type="button" @click.stop="diagnostics">Проверить хранилище</button></section>
    </div>
  </section>
</template>
