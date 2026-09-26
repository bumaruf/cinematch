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
  description:
    'Extensão não oficial para recomendações personalizadas de filmes para usuários do Letterboxd, com análise de perfil e sugestões temáticas.',
  permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
  host_permissions: [...LETTERBOXD, 'https://image.tmdb.org/*'],
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
