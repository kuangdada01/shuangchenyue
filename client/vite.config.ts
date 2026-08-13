import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 移除 HTML 中 script/link 标签的 crossorigin 属性
// Capacitor Android WebView 中 crossorigin 会导致 ERR_CONNECTION_REFUSED
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // 手动分包：稳定第三方库独立缓存，业务代码变更不影响其缓存
        // （Vite 8 基于 Rolldown，需函数式 manualChunks）
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react-router') || id.includes('/react/') || id.includes('react-dom') || id.includes('scheduler')) return 'react';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('axios')) return 'http';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})