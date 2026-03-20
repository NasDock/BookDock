import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bookdock/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@bookdock/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@bookdock/ebook-reader': path.resolve(__dirname, '../../packages/ebook-reader/src'),
      '@bookdock/tts': path.resolve(__dirname, '../../packages/tts/src'),
      '@bookdock/auth': path.resolve(__dirname, '../../packages/auth/src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@ebook-reader': path.resolve(__dirname, '../../packages/ebook-reader/src'),
      '@tts': path.resolve(__dirname, '../../packages/tts/src'),
      '@auth': path.resolve(__dirname, '../../packages/auth/src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: [
      '@bookdock/auth',
      '@bookdock/ui',
      '@bookdock/api-client',
      '@bookdock/ebook-reader',
      '@bookdock/tts',
    ],
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
