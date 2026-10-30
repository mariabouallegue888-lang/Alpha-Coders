import { defineConfig } from 'vite';

export default defineConfig({
  // Vite's built-in transform handles TSX without an additional native SWC cache.
  esbuild: { jsx: 'automatic' },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5000' } },
});
