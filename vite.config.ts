import { defineConfig } from 'vite';

// Relative base so the build works at any path. Two pages: the site and the 3D deck.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', deck: 'deck.html' } } },
});
