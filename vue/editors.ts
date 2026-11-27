import { Fragment, defineComponent, h, render, type VNode, type VNodeChild } from 'vue'
import { RecipeCard } from './editors-card'

type Unit = { label: string }
type Options = Record<string, Unit>
type Row = {
  id: string; refId: string | null; quantity: number | null; unit: string
  lossPercent: number | null; outputGrams: number | null; note: string
}
type Field = string | number | null
interface EditorContext {
  draft: Record<string, any>
  dish: boolean
  catalog: boolean
  hideMoney: boolean
  unified: boolean
  stateText: string
  draftStatus: string
  description: string
  badge: string
  folders: { id: string; name: string }[]
  units: Options
  numericText(id: string, value: Field): string
  cookingMinutes: number | null
}

const fragment = (children: VNodeChild[]) => h(Fragment, null, children)
const label = (caption: string, field: VNode, attrs: Record<string, any> = {}) => h('label', attrs, [caption, field])
const numeric = (ctx: Pick<EditorContext, 'numericText'>, id: string, value: Field, placeholder = 'Не задано') =>
  h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: ctx.numericText(id, value), placeholder })
const select = (id: string, value: string, options: [string, string][]) =>
  h('select', { id, value }, options.map(([key, caption]) => h('option', { key, value: key }, caption)))
const units = (options: Options): [string,string][] => Object.entries(options).map(([key, value]) => [key, value.label])
const button = (id: string, text: string, attrs: Record<string, any> = {}) => h('button', { id, ...attrs }, text)
const area = (id:string, value:string, attrs:Record<string,any>={}) => h('textarea',{id,value,...attrs})
const status = () => h('p', {id:'form-error',class:'inline-error',role:'status'})
const help = (text:string) => h('p', {class:'field-help'},text)

function Header(ctx: EditorContext) {
  return h('div', {class:'editor-head'}, [
    h('div', {class:'editor-topline'}, [h('span',{class:'badge'},ctx.badge), h('span',{id:'save-state', class:'save-state'},ctx.stateText)]),
    h('label',[h('span',{class:'sr-only'},'Название'),h('input',{id:'item-name',class:'name-input',value:ctx.draft.name,placeholder:'Введите название',maxlength:300})]),
    h('p',{class:'intro'},ctx.description),
    !ctx.catalog && h('p',{id:'draft-status',class:'draft-status',role:'status','aria-live':'polite'},ctx.draftStatus || 'Черновик сохраняется автоматически. Карточка — по кнопке «Сохранить».')
  ])
}
function Actions(recipe: boolean) {
  return h('div',{class:'form-actions'},[
    recipe && h('div',{id:'mobile-summary',class:'mobile-summary','aria-live':'polite'}),
    button('view-recipe','← Назад'), recipe && button('add-row','+ Добавить продукт'),
    button('delete-item','Удалить',{class:'danger'}),button('save-item','Сохранить',{class:'primary'})
  ])
}

function CatalogForm(ctx:EditorContext, packaging:boolean) {
  const d=ctx.draft
  const finance=packaging?{}:{'data-finance-only':''}
  const note=packaging?'packaging-note':'product-note'
  const grid=[
    !packaging && label('Другие слова для поиска',h('input',{id:'aliases',value:d.aliases,placeholder:'Например, картошка, картошечка'}),{class:'full'}),
    label('Закупочная цена, ₽', numeric(ctx,'price',d.price,'Нет цены'),finance),
    label(packaging?'Закупленное количество':'Количество в упаковке',numeric(ctx,'packQuantity',d.packQuantity),finance),
    label(packaging?'Единица закупки':ctx.hideMoney?'Единица продукта':'Единица упаковки',select(packaging?'packaging-unit':'product-unit',d.unit,units(ctx.units))),
    packaging && label('Примечание',area(note,d.note,{maxlength:10000}),{class:'full'})
  ]
  return fragment([Header(ctx),h('div',{class:'editor-content'},[
    h('div',{class:'product-grid'},grid),h('div',{id:'base-price',class:'base-price',...finance}),
    packaging ? help('Метры пересчитываются в сантиметры, килограммы — в граммы, литры — в миллилитры. Разные виды единиц между собой не смешиваются.')
    : h('details',{class:'recipe-note'},[h('summary','Масса штуки, коэффициент объёма и заметка'),h('div',{class:'product-grid',style:{marginTop:'14px'}},[
      label('Масса одной штуки, г',numeric(ctx,'massPerPiece',d.massPerPiece)),
      label('Коэффициент массы, г на 1 мл',numeric(ctx,'gramsPerMl',d.gramsPerMl)),
      label('Заметка',area(note,d.note),{class:'full'})]),
      help('Объём не переводится в массу без вашего коэффициента. Масса штуки нужна для подсчёта веса, например, булочки.')]),
    status()
  ]),Actions(false)])
}
function RecipeForm(ctx:EditorContext) {
  const d=ctx.draft
  return fragment([
    Header(ctx),
    ctx.dish && h('div',{class:'recipe-folder-editor'},[label('Папка блюда',select('recipe-folder',d.folderId || '',[['','Без папки'],...ctx.folders.map(f=>[f.id,f.name] as [string,string])]))]),
    h('div',{id:'photo-editor',class:'recipe-photo-editor'}),
    h('div',{class:'editor-content'},[
      h('div',{class:'section-heading'},[h('h3','Ингредиенты'),h('small',{id:'row-count'})]),
      h('div',{class:'ingredient-head','aria-hidden':'true'},[h('span','Продукт / полуфабрикат'),h('span','Количество'),h('span','Ед.'),h('span',{'data-finance-only':''},'Стоимость'),h('span')]),
      h('div',{id:'ingredients'}),ctx.dish && h('div',{id:'packaging-editor'}),
      ctx.dish ? h('div',{class:'product-grid recipe-note'},[
        label('Количество порций в рецепте',numeric(ctx,'recipe-portions',d.portions||1)),
        label('Фактический выход блюда, г (необязательно)',numeric(ctx,'dish-yield',d.actualYield))
      ]) : h('div',{class:'yield-panel'},[h('div',[h('h3','Фактический выход партии'),h('p',ctx.hideMoney?'Взвесьте всю готовую партию и укажите её выход.':'Взвесьте всю готовую партию. По этому значению рассчитывается себестоимость грамма и килограмма.')]),label('Выход готовой партии, г',numeric(ctx,'actualYield',d.actualYield,'Обязательно'))]),
      ctx.unified && label('Время приготовления, мин',numeric(ctx,'cooking-minutes',ctx.cookingMinutes),{class:'recipe-note cooking-time-editor'}),
      label('Способ приготовления',area('technology',d.technology,{maxlength:10000}),{class:'recipe-note'}),
      h('details',{class:'recipe-note',open:!!d.note},[h('summary','Заметка к рецепту'),area('recipe-note',d.note,{placeholder:'Что нужно уточнить или учесть'})]),
      h('div',{id:'summary',class:'summary','aria-live':'polite'}),
      ctx.dish && h('div',{class:'selling-price-editor recipe-note'},[label('Цена продажи блюда, ₽',numeric(ctx,'selling-price',d.sellingPrice,'Не задана')),help('Цена за одну порцию. Показатели ниже рассчитаны только по продуктовой себестоимости, без упаковки.')]),
      ctx.dish && h('div',{id:'profitability-preview','aria-live':'polite'}),
      ctx.dish && h('div',{id:'expenses-preview'}),status()
    ]),Actions(true)
  ])
}

interface RowContext {
  row: Row
  reference?: {name:string; type?:string; massPerPiece?:number}
  rawMass: number | null
  home: boolean
  units: Options
  numericText: EditorContext['numericText']
  format(value:number|null): string
  bind():void
}
const IngredientRow = defineComponent({
  name:'IngredientRow',
  props:['context'],
  setup(props) {
    // List reordering/addition retains the editor for an unchanged row. The inputs
    // are deliberately uncontrolled while typing so commas and invalid drafts survive.
    const ctx:RowContext = props.context
    return () => {
      const {row,reference,home,format}=ctx
      const prep=reference?.type==='prep', processable=!prep&&['g','kg'].includes(row.unit)
      const cell=(text:string, node:VNode) => h('label',[h('span',text),node])
      const number=(key:string, value:Field, placeholder?:string) => numeric(ctx,key+'-'+row.id,value,placeholder)
      return h('div',{class:'ingredient-row','data-row':row.id},[
        h('div',{class:'autocomplete'},[h('label',[h('span',{class:'sr-only'},'Продукт или полуфабрикат'),h('input',{
          class:'ingredient-search',id:'search-'+row.id,role:'combobox','aria-autocomplete':'list','aria-expanded':'false',
          'aria-controls':'options-'+row.id,autocomplete:'off',placeholder:'Начните вводить название…',value:reference?.name || ''
        })]),h('div',{id:'options-'+row.id,class:'suggestions',role:'listbox',hidden:true}),
        reference && h('span',{class:'ingredient-tag'},(prep?'Полуфабрикат · готовая масса':'Продукт')+(reference.massPerPiece?' · '+format(reference.massPerPiece)+' г/шт.':''))]),
        cell(prep?'Готовая масса':'Исходное кол-во',number('qty',row.quantity)),
        cell('Ед.',select('unit-'+row.id,row.unit,prep?units(ctx.units).filter(([key])=>key==='g'||key==='kg'):units(ctx.units))),
        h('div',{class:'item-cost','data-finance-only':'',id:'cost-'+row.id},[h('span','Стоимость'),'—']),
        h('button',{class:'remove-row','aria-label':'Удалить строку '+(reference?.name||'ингредиента'),title:'Удалить строку'},'×'),
        h('details',{class:'row-extra',open:!!row.note},[
          h('summary',(prep||home?'Заметка':'Обработка и заметка')+(!home&&row.lossPercent!=null?' · потери '+format(row.lossPercent)+'%':'')),
          h('div',{class:'extra-grid'},[
            processable && label('Исходный вес, г',h('input',{id:'raw-'+row.id,value:format(ctx.rawMass),readonly:true,tabindex:-1,placeholder:'Масса неизвестна'}),{class:'processing-option'}),
            processable && label('Потери, %',number('loss',row.lossPercent,'Без потерь'),{class:'processing-option'}),
            processable && label('Расчётный выход, г',number('output',row.outputGrams,'По исходному весу'),{class:'processing-option'}),
            label('Заметка',h('input',{id:'note-'+row.id,value:row.note,placeholder:'Например, уточнить количество'}),{class:'note-field'})
          ])
        ])
      ])
    }
  }
})

const Form = defineComponent({name:'RecordEditor', props:['kind','context'],setup(props) {
  return () => props.kind==='recipe'?RecipeForm(props.context):CatalogForm(props.context,props.kind==='packaging')
}})

export const editors = {
  form(el:HTMLElement, kind:'product'|'packaging'|'recipe', context:EditorContext){render(h(Form,{kind,context}),el)},
  empty(el:HTMLElement,title:string) {render(h('div',{class:'empty-state'},[h('h2',title),h('p',['Откройте сохранённую запись или создайте новую',h('br'),'кнопкой в справочнике.'])]),el)},
  dispose(el:HTMLElement){render(null,el)},
  rows(el:HTMLElement, contexts:RowContext[]) {
    render(fragment(contexts.map(ctx => h(IngredientRow,{
      key:JSON.stringify([ctx.row.id,ctx.row.refId,ctx.row.unit,ctx.home]),
      context:ctx,onVnodeMounted:ctx.bind
    }))),el)
  },
  card(el:HTMLElement, context:Record<string,any>) {render(h(RecipeCard,context),el)}
}
