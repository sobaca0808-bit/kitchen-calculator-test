import { reactive } from 'vue'

export const titles = {
  dashboard:'Главная', calculator:'Калькулятор', recipes:'Мои рецепты', products:'Продукты',
  prep:'Заготовки', cards:'Технологические карты', processing:'Выходы и потери',
  scaling:'Пересчёт порций', analysis:'Себестоимость', packaging:'Упаковка и фасовка',
  expenses:'Расходы заведения', financials:'Финансовые показатели', favorites:'Избранное',
}
export type Tool = keyof typeof titles
export type Mode = 'home' | 'chef' | 'business'
export const menuSections: Partial<Record<Tool, string>> = { recipes:'dish', products:'products', prep:'prep', expenses:'expenses', packaging:'packaging' }
export const policy = () => (globalThis as any).KitchenWorkspacePolicy as {menus: Record<Mode, Tool[]>}
export const shell = reactive({
  screen:'home', active:'recipes' as Tool, mode:'home' as Mode, alert:'', notice:'',
  counts:{} as Record<string, string>,
})
type Actions = {
  home:()=>void, selectMode:(mode:Mode)=>void, settings:()=>void, leaveSettings:()=>void,
  diagnostics:()=>void, showAlert:()=>void, show:(id:Tool)=>void,
}
let actions:Actions
export function configure(value:Actions) { actions = value }
export const home = () => actions.home()
export const selectMode = (id:Mode) => actions.selectMode(id)
export const settings = () => actions.settings()
export const leaveSettings = () => actions.leaveSettings()
export const diagnostics = () => actions.diagnostics()
export const showAlert = () => actions.showAlert()
export const show = (id:Tool) => actions.show(id)
