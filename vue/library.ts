import {
  computed, defineComponent, Fragment, h, nextTick, onBeforeUnmount,
  onMounted, onUpdated, ref, render, shallowRef, watch, type PropType
} from 'vue'

type Item = { id: string; name: string }
type Rows = { items: Item[]; section: string; caption: (row: Item) => string }
const overscan = 8
const virtualThreshold = 48

// Measured rows retain their original height, including multi-line prep and product
// names. Prefix sums locate either end of the viewport without walking 10,000 rows.
class RowHeights {
  private readonly corrections: Float64Array
  private readonly measured = new Map<number, number>()
  constructor(readonly count: number, readonly estimate: number) {
    this.corrections = new Float64Array(count + 1)
  }
  offset(index: number): number {
    let size = index * this.estimate
    for (let i = index; i > 0; i -= i & -i) size += this.corrections[i]
    return size
  }
  indexAt(offset: number): number {
    let lo = 0, hi = this.count
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (this.offset(mid + 1) <= offset) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  measure(index: number, size: number): boolean {
    if (!(size > 0) || index < 0 || index >= this.count) return false
    const difference = size - (this.measured.get(index) ?? this.estimate)
    if (Math.abs(difference) < 0.25) return false
    this.measured.set(index, size)
    for (let i = index + 1; i <= this.count; i += i & -i) this.corrections[i] += difference
    return true
  }
}

const Library = defineComponent({
  name: 'RecipeLibrary',
  props: {
    host: { type: Object as PropType<HTMLElement>, required: true },
    model: { type: Object as PropType<Rows>, required: true },
    selected: { type: String, default: null }
  },
  setup(props) {
    const scroll = ref(0), viewport = ref(480), revision = ref(0)
    const virtual = computed(() => props.model.items.length > virtualThreshold)
    const makeHeights = () => new RowHeights(props.model.items.length, props.model.section === 'dish' ? 64 : 46)
    const heights = shallowRef(makeHeights())
    let previousWidth = 0
    let observer: ResizeObserver | undefined
    const observed = new Set<Element>()
    watch(() => props.model, (model, previous) => {
      heights.value = makeHeights()
      if (previous.items !== model.items) {
        props.host.scrollTop = 0
        scroll.value = 0
      }
    }, { flush: 'sync' })
    const window = computed(() => {
      revision.value
      const ledger = heights.value, count = props.model.items.length
      if (!virtual.value) return { start: 0, end: count, before: 0, after: 0 }
      const start = Math.max(0, ledger.indexAt(scroll.value) - overscan)
      const end = Math.min(count, ledger.indexAt(scroll.value + viewport.value) + overscan + 1)
      return { start, end, before: ledger.offset(start), after: ledger.offset(count) - ledger.offset(end) }
    })
    function onScroll() { scroll.value = props.host.scrollTop }
    function observeRows() {
      if (!observer) return
      const current = new Set<Element>()
      if (virtual.value && props.model.section !== 'dish') {
        for (const row of props.host.querySelectorAll('[data-row-index]')) {
          current.add(row)
          if (!observed.has(row)) observer.observe(row)
        }
      }
      for (const row of observed) if (!current.has(row)) observer.unobserve(row)
      observed.clear()
      for (const row of current) observed.add(row)
    }
    function onResize(entries: ResizeObserverEntry[]) {
      for (const entry of entries) {
        if (entry.target === props.host) {
          viewport.value = props.host.clientHeight || 480
          const width = props.host.clientWidth
          if (width && width !== previousWidth) {
            previousWidth = width
            heights.value = makeHeights()
            // Width and font changes can wrap a label, including rows unchanged in DOM.
            for (const row of observed) {
              heights.value.measure(Number((row as HTMLElement).dataset.rowIndex), row.getBoundingClientRect().height)
            }
          }
        } else if (observed.has(entry.target)) {
          const node = entry.target as HTMLElement
          const size = entry.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height
          if (heights.value.measure(Number(node.dataset.rowIndex), size)) revision.value++
        }
      }
    }
    function keyboard(event: KeyboardEvent) {
      if (!virtual.value || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement
      const row = target.closest<HTMLElement>('[data-row-index]')
      const index = row ? Number(row.dataset.rowIndex) : -1
      const count = props.model.items.length, ledger = heights.value
      let next: number
      switch (event.key) {
        case 'ArrowDown': next = Math.min(count - 1, index + 1); break
        case 'ArrowUp': next = Math.max(0, index - 1); break
        case 'Home': next = 0; break
        case 'End': next = count - 1; break
        case 'PageDown': next = Math.min(count - 1, ledger.indexAt(ledger.offset(Math.max(0,index)) + viewport.value)); break
        case 'PageUp': next = Math.max(0, ledger.indexAt(ledger.offset(Math.max(0,index)) - viewport.value)); break
        case 'Tab':
          if (!row) return
          next = index + (event.shiftKey ? -1 : 1)
          if (next < 0 || next >= count) return
          break
        default: return
      }
      event.preventDefault()
      const top = ledger.offset(next), bottom = ledger.offset(next + 1)
      if (top < props.host.scrollTop) props.host.scrollTop = top
      else if (bottom > props.host.scrollTop + viewport.value) props.host.scrollTop = bottom - viewport.value
      onScroll()
      nextTick(() => props.host.querySelector<HTMLElement>('[data-row-index="'+next+'"]')?.focus({ preventScroll: true }))
    }
    onMounted(() => {
      observer = new ResizeObserver(onResize)
      observer.observe(props.host)
      observeRows()
      props.host.addEventListener('scroll', onScroll, { passive: true })
      props.host.addEventListener('keydown', keyboard)
    })
    onUpdated(observeRows)
    onBeforeUnmount(() => {
      observer?.disconnect()
      props.host.removeEventListener('scroll', onScroll)
      props.host.removeEventListener('keydown', keyboard)
    })
    return () => {
      const { items, section, caption } = props.model
      if (!items.length) return h('p',{class:'field-help'},'Ничего не найдено. Создайте новую запись.')
      const { start, end, before, after } = window.value
      const spacer = (height: number, key: symbol) => h('div', { key, 'aria-hidden': 'true', style: { height: height+'px', overflowAnchor: 'none' } })
      const nodes = []
      if (before) nodes.push(spacer(before, Symbol.for('library-before')))
      for (let i = start; i < end; i++) {
        const item = items[i], active = item.id === props.selected
        nodes.push(h('button', {
          key: item.id, type: 'button', title: item.name,
          class: ['library-item library-row', { 'product-row': section === 'products', active }],
          'data-open': item.id, 'data-row-index': i, 'aria-current': active ? 'true' : 'false'
        }, [h('strong',item.name),h('small',caption(item))]))
      }
      if (after) nodes.push(spacer(after, Symbol.for('library-after')))
      return h(Fragment, nodes)
    }
  }
})

type Folder = {id: string; name: string}
type Draft = { id: string; type: string; data: {name: string}; updatedAt: number }
type DraftAction = (id: string, type: string) => void
const dates = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })

type CatalogItem = Item & {aliases?: string}
type Recipe = Item & {type: 'dish' | 'prep'; folderId?: string; ingredients: {refId: string | null}[]}
type Catalog = {products: CatalogItem[]; packaging?: CatalogItem[]; recipes: Recipe[]}

function index(book: Catalog) {
  const sections: Record<string, CatalogItem[]> = {dish: [], prep: [], products: book.products, packaging: book.packaging ?? []}
  const byId = new Map<string, CatalogItem>()
  const folderCounts = new Map<string, number>()
  let unfiled = 0
  for (const item of sections.products) byId.set(item.id, item)
  for (const item of sections.packaging) byId.set(item.id, item)
  for (const recipe of book.recipes) {
    byId.set(recipe.id, recipe)
    sections[recipe.type].push(recipe)
    if (recipe.type === 'dish') {
      if (recipe.folderId) folderCounts.set(recipe.folderId, (folderCounts.get(recipe.folderId) ?? 0) + 1)
      else unfiled++
    }
  }
  // Build the normalized substring-search index on demand per section. Filtering
  // must preserve source order and Russian aliases, including matches mid-word.
  const labels = new Map<string, string[]>()
  function search(section: string, query: string) {
    const items = sections[section] ?? []
    if (!query) return items
    let words = labels.get(section)
    if (!words) {
      words = items.map(item => (item.name + ' ' + (item.aliases || '')).toLocaleLowerCase('ru'))
      labels.set(section, words)
    }
    return items.filter((_, i) => words![i].includes(query))
  }
  // An incoming edge to the current recipe can create a cycle; edits to its
  // own outgoing edges cannot change which preparations already reach it.
  let parents: Map<string, Set<string>> | undefined
  let lastRecipe: string | undefined
  let forbidden: Set<string>
  function ancestors(recipeId: string) {
    if (recipeId === lastRecipe) return forbidden
    if (!parents) {
      parents = new Map()
      for (const recipe of book.recipes) {
        if (recipe.type !== 'prep') continue
        for (const row of recipe.ingredients) {
          if (!row.refId) continue
          let incoming = parents.get(row.refId)
          if (!incoming) parents.set(row.refId, incoming = new Set())
          incoming.add(recipe.id)
        }
      }
    }
    forbidden = new Set([recipeId])
    const pending = [recipeId]
    while (pending.length) {
      const id = pending.pop()!
      for (const parent of parents.get(id) ?? []) if (!forbidden.has(parent)) {
        forbidden.add(parent)
        pending.push(parent)
      }
    }
    lastRecipe = recipeId
    return forbidden
  }
  return {sections, byId, folderCounts, unfiled, search, ancestors}
}

export const KitchenVueLibrary = {
  index,
  rows(host: HTMLElement, model: Rows, selected: string | null) {
    render(h(Library, { host, model, selected }), host)
  },
  folders(host: HTMLElement, folders: Folder[], counts: Map<string, number>, total: number, unfiled: number) {
    render(h(Fragment, [
      h('option',{key:'all',value:'all'},'Все блюда ('+total+')'),
      h('option',{key:'unfiled',value:'unfiled'},'Без папки ('+unfiled+')'),
      ...folders.map(folder => h('option', {key:'folder:'+folder.id,value:'folder:'+folder.id}, folder.name+' ('+(counts.get(folder.id)||0)+')'))
    ]),host)
  },
  drafts(host: HTMLElement, records: Draft[], error: string, activeId: string | null, activeType: string, restore: DraftAction, discard: DraftAction) {
    if (error) {
      render(h('p',{class:'inline-error'},'Не удалось прочитать черновики: '+error+' Исходная запись не изменена.'),host)
      return
    }
    const rows = records.map(record => {
      const active = record.id === activeId && record.type === activeType
      return h('div',{key:record.type+':'+record.id,class:'draft-entry'},[
        h('div',[h('strong',record.data.name || 'Без названия'),h('small',(record.type === 'prep' ? 'Полуфабрикат' : 'Блюдо')+' · '+dates.format(record.updatedAt))]),
        h('button',{'data-restore-draft':record.id,'data-type':record.type,disabled:active,onClick:()=>restore(record.id,record.type)},active?'Открыт':'Восстановить'),
        h('button',{class:'danger','data-delete-draft':record.id,'data-type':record.type,onClick:()=>discard(record.id,record.type)},'Удалить черновик')
      ])
    })
    render(h(Fragment,[h('h2','Незавершённые рецепты'),h('p','Восстановите работу или удалите ненужный черновик. Сохранённые карточки не изменены.'),h('div',{class:'draft-list'},rows)]),host)
  }
}
