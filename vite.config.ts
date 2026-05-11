import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/PDF_Tool/',
  build: {
    // mupdf (the compress engine) uses top-level await, which needs es2022+.
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['mupdf'],
  },
  worker: {
    format: 'es',
  },
})
