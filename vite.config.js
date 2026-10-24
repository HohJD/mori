import { defineConfig } from 'vite';

export default defineConfig({
  root: 'website',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
