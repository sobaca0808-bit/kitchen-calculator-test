<script setup>
defineProps({ rows:Array, catalog:Array, units:Object, invalid:Map, format:Function, portions:Number })
</script>
<template>
  <section class="packaging-panel" aria-labelledby="packaging-editor-title">
    <div class="section-heading"><h3 id="packaging-editor-title">Упаковка и фасовка</h3><button type="button" id="add-packaging-row">+ Добавить упаковку</button></div>
    <p class="field-help">Расход укажите на одну порцию. Бесплатная выдача гостю также учитывается в себестоимости.</p>
    <p id="packaging-catalog-help" class="field-help" :hidden="catalog.length > 0">Сначала добавьте позиции в справочник «Упаковка и фасовка». Здесь выбираются только его записи, отдельно от пищевых ингредиентов.</p>
    <div class="packaging-rows">
      <div v-for="row in rows" :key="row.id" class="packaging-row" :data-packaging-row="row.id">
        <label class="packaging-material">Позиция из справочника<select :id="'pack-ref-'+row.id" :value="row.refId || ''">
          <option value="">Выберите позицию</option><option v-for="item in catalog" :key="item.id" :value="item.id" :disabled="rows.some(other => other.id !== row.id && other.refId === item.id)">{{ item.name }}{{ rows.some(other => other.id !== row.id && other.refId === item.id) ? ' — уже добавлено' : '' }}</option>
        </select></label>
        <div class="packaging-quantity-grid">
          <label>Расход на 1 порцию<input :id="'pack-qty-'+row.id" type="text" inputmode="decimal" autocomplete="off" :value="invalid.get(row.id)?.raw ?? format(row.quantity)" placeholder="Не задано"></label>
          <label>Единица<select :id="'pack-unit-'+row.id" :value="row.unit"><option v-for="(unit,id) in units" :key="id" :value="id">{{ unit.label }}</option></select></label>
        </div>
        <label class="packaging-checkbox"><input :id="'pack-free-'+row.id" type="checkbox" :checked="row.freeForGuest">Бесплатно для гостя — закупочная стоимость учитывается</label>
        <label>Как учитывать<select :id="'pack-mode-'+row.id" :value="row.costMode || 'auto'">
          <option value="auto">Авто: без двойного учёта</option><option value="additional">Дополнительно к ингредиентам</option><option value="included">Уже учтено в ингредиентах</option>
        </select></label>
        <div class="packaging-row-total"><div><small>На рецепт ({{ format(portions) }} порц.)</small><strong :id="'pack-cost-'+row.id" class="packaging-row-cost"></strong></div>
          <button type="button" class="remove-packaging-row danger" aria-label="Удалить позицию упаковки">Удалить</button>
        </div>
        <div :id="'pack-hint-'+row.id" class="packaging-issues" role="status" hidden></div>
      </div>
    </div>
    <div id="packaging-subtotal" class="packaging-subtotal" aria-live="polite"></div>
  </section>
</template>
