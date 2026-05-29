import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    outDir: '../internal/webui/dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8082',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
      '/rss': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/agents': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
    },
  },
})
