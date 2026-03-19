import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@ebook-reader': path.resolve(__dirname, '../../packages/ebook-reader/src'),
      '@tts': path.resolve(__dirname, '../../packages/tts/src'),
      '@auth': path.resolve(__dirname, '../../packages/auth/src'),
    },
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
