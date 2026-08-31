import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vercel = site at domain root. GitHub Pages = /atelier/ subpath.
const base =
  process.env.VITE_BASE_PATH ||
  (process.env.VERCEL ? '/' : '/atelier/');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
