import { createApp } from 'vue'
import debug from 'debug'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import App from './App.vue'

if (import.meta.env.DEV) {
  debug.enable('local-keep:*')
}

createApp(App).mount('#app')
