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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('react-syntax-highlighter') ||
            id.includes('refractor') ||
            id.includes('prismjs')
          ) {
            return 'syntax-highlighter'
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('unified') ||
            id.includes('micromark')
          ) {
            return 'markdown'
          }
          if (id.includes('@radix-ui') || id.includes('radix-ui')) {
            return 'radix'
          }
          if (id.includes('react-dom') || id.includes('react-router')) {
            return 'react-vendor'
          }
        },
      },
    },
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
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/rss': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      }
    },
  },
})
