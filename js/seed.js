(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenSeed = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create() {
    const product = (id, name, unit, aliases = '', extra = {}) => ({
      id: 'product-' + id, name, aliases, price: null, packQuantity: 1, unit,
      massPerPiece: null, gramsPerMl: null, note: '', ...extra
    });
    const ingredient = (id, refId, quantity, unit = 'g', extra = {}) => ({
      id, refId, quantity, unit, lossPercent: null, outputGrams: null, note: '', ...extra
    });
    return {
      version: 1,
      products: [
        product('raw-meat', 'Сырое мясо', 'kg', 'мясо', { note: 'Уточнить вид сырья, количество и закупочную цену.' }),
        product('potato', 'Картофель', 'kg', 'картошка, сырой картофель'),
        product('oil', 'Масло растительное', 'l', 'масло'),
        product('salt', 'Соль', 'kg'),
        product('paprika', 'Паприка', 'kg'),
        product('mayonnaise', 'Майонез', 'kg', 'майонезный соус'),
        product('ketchup', 'Кетчуп', 'kg'),
        product('mustard', 'Мустарда', 'kg', 'горчица'),
        product('tzatziki', 'Дзадзики', 'kg', 'цацики, тзадзики', { note: 'Состав пока неизвестен. Позже можно заменить в блюде полуфабрикатом.' }),
        product('onion', 'Синий лук', 'kg', 'красный лук, лук'),
        product('tomato', 'Помидоры', 'kg', 'томаты, помидор'),
        product('bun', 'Булочка', 'pcs', 'булка', { massPerPiece: 100, note: 'Условная масса 100 г. Уточнить.' })
      ],
      recipes: [
        {
          id: 'prep-meat', type: 'prep', name: 'Готовое мясо', actualYield: null,
          note: 'Черновик: уточнить сырьё, его количество и фактический выход партии. Потери пока неизвестны.',
          ingredients: [ingredient('meat-raw', 'product-raw-meat', null)]
        },
        {
          id: 'prep-fries', type: 'prep', name: 'Жареный картофель', actualYield: 100,
          note: 'Незавершённый рецепт: уточнить количества масла, соли и паприки. 160 г сырого картофеля дают 100 г готового.',
          ingredients: [
            ingredient('fries-potato', 'product-potato', 160, 'g', { lossPercent: 37.5, outputGrams: 100 }),
            ingredient('fries-oil', 'product-oil', null, 'ml', { note: 'Количество пока неизвестно.' }),
            ingredient('fries-salt', 'product-salt', null, 'g', { note: 'Количество пока неизвестно.' }),
            ingredient('fries-paprika', 'product-paprika', null, 'g', { note: 'Количество пока неизвестно.' })
          ]
        },
        {
          id: 'dish-gyro', type: 'dish', name: 'Гиро в булке большое', actualYield: null,
          note: 'Редактируемый черновик одной порции. Внесите закупочные цены и завершите рецептуры полуфабрикатов.',
          ingredients: [
            ingredient('gyro-meat', 'prep-meat', 100),
            ingredient('gyro-fries', 'prep-fries', 100),
            ingredient('gyro-mayonnaise', 'product-mayonnaise', 20),
            ingredient('gyro-ketchup', 'product-ketchup', 20),
            ingredient('gyro-mustard', 'product-mustard', 20),
            ingredient('gyro-tzatziki', 'product-tzatziki', 20),
            ingredient('gyro-onion', 'product-onion', 20),
            ingredient('gyro-tomato', 'product-tomato', 35, 'g', { note: 'Предварительно, диапазон 30–40 г' }),
            ingredient('gyro-bun', 'product-bun', 1, 'pcs', { note: 'Условная масса 100 г. Уточнить.' })
          ]
        }
      ]
    };
  }
  return { create };
});
