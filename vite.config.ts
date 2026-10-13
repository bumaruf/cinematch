import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import manifest from './manifest.config.ts';
import { catalogAsset } from './tools/build/catalog-asset.ts';

export default defineConfig({
  plugins: [catalogAsset(), tailwindcss(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
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
    // Leave headroom for desktop audio while catalog-heavy tests run.
    maxWorkers: process.platform === 'win32' ? 2 : undefined,
  },
});
