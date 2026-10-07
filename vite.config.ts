import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the app at https://bevankoopman.github.io/gpx-journey/
  base: '/gpx-journey/',
  plugins: [svelte()],
  build: {
    rollupOptions: {
      // MapLibre is most of the bundle and changes rarely; keep it cacheable apart from app code.
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
    chunkSizeWarningLimit: 1100,
  },
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
