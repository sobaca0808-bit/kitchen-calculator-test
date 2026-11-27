import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({mode}) => {
  const photo=mode==='photo'
  return {
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  publicDir: false,
  build: {
    target: 'es2020',
    outDir: '.vue-build',
    emptyOutDir: !photo,
    rollupOptions: photo ? {external: ['vue'], output: {globals: {vue: 'KitchenVuePhotoRuntime'}}} : {},
    lib: {
      entry: photo ? 'vue/photo-entry.ts' : 'vue/main.ts',
      name: photo ? 'SintezPhoto' : 'SintezVue',
      formats: ['iife'],
      fileName: () => photo ? 'vue-photo.js' : 'workspace.js',
      cssFileName: 'workspace',
    },
  },
  }
})
