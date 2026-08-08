import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        masterminds: resolve(process.cwd(), 'masterminds/index.html'),
        chapter: resolve(process.cwd(), 'chapter/index.html')
      }
    }
  }
})
