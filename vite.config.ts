import { defineConfig } from 'vite';

// Hosted at the root of its domain (Vercel). Absolute asset paths keep the 404 page working
// on any missing URL, however deep. Three pages: the site, the 3D deck and the 404.
export default defineConfig({
  base: '/',
  build: { rollupOptions: { input: { main: 'index.html', deck: 'deck.html', lost: '404.html' } } },
});
