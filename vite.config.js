import { defineConfig } from 'vite';
import { moriApiPlugin } from './scripts/dev-api.mjs';

export default defineConfig({
  root: 'website',
  publicDir: 'public',
  plugins: [moriApiPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
