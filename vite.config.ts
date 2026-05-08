import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/PDF_Tool/',
  build: {
    target: 'es2020',
  },
  worker: {
    format: 'es',
  },
})
