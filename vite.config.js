import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: { chunkSizeWarningLimit: 1200, target: 'es2020' },
});
