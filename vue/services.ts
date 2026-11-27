import { Fragment, h, render, nextTick } from 'vue'
import ExpenseTabs from './services/ExpenseTabs.vue'
import FinancialWorkspace from './services/FinancialWorkspace.vue'
import Conflict from './services/Conflict.vue'

const counts = [['added','Будет добавлено'],['updated','Будет обновлено'],['skipped','Будет пропущено'],['conflicts','Конфликтов'],['removed','Будет удалено']]
const actions:Record<string,string> = {added:'добавить',updated:'обновить',skipped:'пропустить',removed:'удалить'}
type PreviewRow = {key?:string,kind:string,id?:string,action:string,reason?:string}
type Plan = {changes:Record<string,number>, conflicts?:{key:string}[], warnings?:(string|{text:string})[], rows?:PreviewRow[]}
type PreviewUI = {entryLabel:(r:PreviewRow)=>string,visibleName:(r:PreviewRow)=>string,choose:(key:string,value:string)=>void}
function previewRoots(panel:Element) {
  return ['summary','conflicts','warnings','details'].map(key=>panel.querySelector('#import-'+key)!)
}
export const services = {
  afterRender: nextTick,
  tabs(host:Element,view:string,switchView:Function) {render(h(ExpenseTabs,{view,switchView}),host)},
  finance(host:Element, props:Record<string,unknown>) {render(h(FinancialWorkspace,props),host)},
  unmount(host:Element) {render(null,host)},
  clearPreview(panel:Element) {for(const root of previewRoots(panel)) render(null,root)},
  preview(panel:Element, plan:Plan, ui:PreviewUI) {
    const [summary,conflicts,warnings,details]=previewRoots(panel)
    render(h(Fragment,counts.map(([key,label])=>h('div',{key},[h('span',label),h('strong',String(plan.changes[key] || 0))]))),summary)
    render(h(Fragment,(plan.conflicts || []).map(conflict=>h(Conflict,{key:conflict.key,conflict,ui,choose:ui.choose}))),conflicts)
    render(h(Fragment,(plan.warnings || []).map((warning,index)=>h('li',{key:index},typeof warning==='string'?warning:warning.text))),warnings)
    const rows=plan.rows || []
    const entries=rows.slice(0,200).map((r,index)=>h('li',{key:r.key || index},
      ui.entryLabel(r)+' · '+ui.visibleName(r)+' — '+(actions[r.action] || r.action)+(r.reason?' · '+r.reason:'')))
    if(rows.length>200)entries.push(h('li',{key:'remainder'},'Ещё '+(rows.length-200)+' позиций. Итоги выше учитывают весь файл.'))
    render(h(Fragment,entries),details)
  },
  backups(host:Element, items:{id:string,createdAt:string,mode:string}[]) {
    render(h(Fragment, items.map(item=>h('option',{key:item.id,value:item.id},
      new Date(item.createdAt).toLocaleString('ru-RU')+' · '+(item.mode==='replace'?'до замены':'до объединения')))),host)
  }
}
