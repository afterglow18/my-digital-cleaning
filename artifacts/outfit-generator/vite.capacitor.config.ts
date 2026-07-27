/**
 * Vite configuration used when building the static bundle for Capacitor / iOS.
 *
 * Key differences from vite.config.ts:
 *  - base is always "/" (no Replit proxy BASE_PATH)
 *  - PORT is not required (no dev server)
 *  - Replit-only plugins (cartographer, dev-banner, runtime-error-modal) are excluded
 *  - The output directory matches what capacitor.config.ts expects: dist/public
 */

import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],

  optimizeDeps: {
    exclude: ['@imgly/background-removal'],
  },

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },

  root: path.resolve(import.meta.dirname),

  worker: {
    format: 'es',
  },

  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
});
