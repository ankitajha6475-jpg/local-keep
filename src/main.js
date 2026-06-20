import { createApp } from 'vue'
import debug from 'debug'
import App from './App.vue'

if (import.meta.env.DEV) {
  debug.enable('local-keep:*')
}

createApp(App).mount('#app')
