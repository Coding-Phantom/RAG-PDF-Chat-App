import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    proxy: {
      '/register': 'http://127.0.0.1:8000',
      '/login': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/pdfs': 'http://127.0.0.1:8000',
      '/ask': 'http://127.0.0.1:8000',
      '/history': 'http://127.0.0.1:8000',
    },
  },
})
