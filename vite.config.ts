import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works when uploaded to itch.io or CrazyGames
  base: './',
  // Phaser alone is ~1.4 MB unminified (~340 KB gzipped). That's fine for web portals.
  build: {
    chunkSizeWarningLimit: 2000,
  },
  server: {
    open: true,
  },
});
