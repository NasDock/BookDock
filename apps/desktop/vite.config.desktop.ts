import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            lib: {
              entry: 'electron/preload.ts',
              formats: ['es'],
              fileName: () => 'preload.mjs',
            },
          },
        },
      },
    ]),
    renderer(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icons/*.png'],
      manifest: {
        name: 'BookDock - 书仓',
        short_name: '书仓',
        description: '专为NAS用户打造的电子书阅读器',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bookdock/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@bookdock/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@bookdock/ebook-reader': path.resolve(__dirname, '../../packages/ebook-reader/src'),
      '@bookdock/tts': path.resolve(__dirname, '../../packages/tts/src'),
      '@bookdock/auth': path.resolve(__dirname, '../../packages/auth/src'),
    },
  },
  server: {
    port: 1424,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
