import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [tailwindcss(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The film catalog is a single ~9 MB module; splitting it gains nothing.
    chunkSizeWarningLimit: 12_000,
    // Extension pages cannot use preloads across worlds; Chrome only warns.
    modulePreload: false,
    rollupOptions: {
      // Not referenced by the manifest: opened with chrome.tabs.create.
      input: { dashboard: 'src/ui/pages/dashboard/index.html' },
    },
  },
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    environment: 'node',
  },
});
