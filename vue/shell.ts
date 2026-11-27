import {createApp} from 'vue'
import Chrome from './shell-chrome.vue'
import Menu from './shell-menu.vue'
import Presentation from './shell-presentation.vue'
import {configure, shell, type Mode, type Tool} from './shell-state'

export function installShell() {
  Object.assign(globalThis, { KitchenVueShell: {
    presentation(dialog: HTMLDialogElement, finish: (remember?:boolean)=>void) {
      const app=createApp(Presentation,{dialog,finish})
      dialog.replaceChildren()
      app.mount(dialog)
      return ()=>app.unmount()
    },
    mount(actions:Parameters<typeof configure>[0], mode:Mode) {
      configure(actions)
      shell.mode = mode
      const oldMenu = document.querySelector<HTMLElement>('nav.tabs')!
      for (const count of oldMenu.querySelectorAll('[id^="count-"]')) {
        shell.counts[count.id.slice(6)] = count.textContent || ''
      }
      oldMenu.remove()
      createApp(Chrome).mount('#sintez-shell')
      createApp(Menu).mount('#unified-menu')
    },
    screen(value:string, mode:Mode, active:Tool) {
      Object.assign(shell, {screen:value, mode, active})
    },
    notice(text:string) { shell.notice = text },
    alert(text:string) { shell.alert = text },
  }})
}
