import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Capacitor 会把 dist/ 整个打进 WebView；用相对 base 保证 file:// 与 https:// 两种加载方式都能找到资源。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
