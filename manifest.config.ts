import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

const LETTERBOXD = ['https://letterboxd.com/*', 'https://*.letterboxd.com/*'];
const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

export default defineManifest({
  manifest_version: 3,
  name: 'CineMatch for Letterboxd (unofficial)',
  version: pkg.version,
  // The Chrome Web Store rejects a description over 132 characters.
  description: 'Recomendações de filmes pelo seu gosto no Letterboxd, por clima ou por pedido. Extensão não oficial.',
  // unlimitedStorage lifts the 10 MB cap of chrome.storage.local: a large
  // Letterboxd history and its backup can approach it. It shows no warning.
  // No `tabs`: the Letterboxd host permissions already expose those tabs' URLs
  // to chrome.tabs.query, and `tabs` would warn about the whole browsing history.
  permissions: ['storage', 'unlimitedStorage', 'activeTab', 'scripting'],
  // IMDb's ratings are downloaded by each browser instead of shipped (see docs/data-sources.md).
  host_permissions: [...LETTERBOXD, 'https://image.tmdb.org/*', 'https://datasets.imdbws.com/*'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/ui/pages/popup/index.html',
    default_icon: ICONS,
    default_title: 'CineMatch for Letterboxd (unofficial)',
  },
  options_page: 'src/ui/pages/options/index.html',
  content_scripts: [
    {
      matches: LETTERBOXD,
      js: ['src/ui/content/content.ts'],
      css: ['src/ui/content/content.css'],
      run_at: 'document_idle',
    },
  ],
  icons: ICONS,
});
