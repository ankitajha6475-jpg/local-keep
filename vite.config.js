import fs from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'

// Reuse the mkcert certificate used by the other local services. The cert has
// a SAN for 192.168.3.222 (not localhost), so access the dev server by IP.
function loadHttps() {
  const certPath = process.env.VITE_HTTPS_CERT || '/app/certs/server.pem'
  const keyPath = process.env.VITE_HTTPS_KEY || '/app/certs/server-key.pem'
  try {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    }
  } catch (error) {
    console.warn('[vite] HTTPS disabled:', error.message)
  }
  return undefined
}

export default defineConfig({
  plugins: [
    vue(),
    react({ jsxImportSource: 'react' })
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    https: loadHttps(),
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true
      },
      '/mcp': {
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
