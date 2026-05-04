import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    },
  },
})
