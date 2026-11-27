import {runtime, lazyViewer} from './lazy-photo'
import { version } from 'vue'
import { KitchenVueLibrary } from './library'
import { editors } from './editors'
import { services } from './services'
import { installShell } from './shell'

Object.assign(globalThis, {
  KitchenVuePhotoRuntime: runtime,
  KitchenPhotoViewer: lazyViewer,
  KitchenVueLibrary,
  KitchenVueEditors: editors,
  KitchenVueServices: services,
  KitchenVueVersion: version,
})
installShell()
