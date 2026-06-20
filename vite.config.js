import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    vue(),
    react({ jsxImportSource: 'react' })
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:5173',
        ws: true
      }
    }
  }
})
