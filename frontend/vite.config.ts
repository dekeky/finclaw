import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': '/src',
      // monaco-editor 的 exports 字段未暴露 CSS 子路径，这里显式指向本地文件
      'monaco-editor/min/vs/editor/editor.main.css': fileURLToPath(
        new URL('./node_modules/monaco-editor/min/vs/editor/editor.main.css', import.meta.url),
      ),
    },
  },
  build: {
    outDir: '../internal/webui/dist',
    emptyOutDir: true,
    // 关闭 modulepreload，避免首屏并行拉取 markdown 等大 chunk 触发连接中断。
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('monaco-editor') ||
            id.includes('@monaco-editor')
          ) {
            return 'monaco'
          }
          if (
            id.includes('react-syntax-highlighter') ||
            id.includes('refractor') ||
            id.includes('prismjs')
          ) {
            return 'syntax-highlighter'
          }
          if (id.includes('mermaid')) {
            return 'mermaid'
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('unified') ||
            id.includes('micromark') ||
            id.includes('katex')
          ) {
            return 'markdown'
          }
          if (id.includes('@radix-ui') || id.includes('radix-ui')) {
            return 'radix'
          }
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'recharts'
          }
          if (id.includes('lightweight-charts')) {
            return 'charts'
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
      },
    },
  },
})
