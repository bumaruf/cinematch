// Zips dist/ for the Chrome Web Store as cinematch-v<version>.zip. Run it
// where the real catalog exists: the repository only has an empty stub.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLISHABLE_SOURCE, readCatalogSource } from './catalog/catalog-source.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { EXPANDED_FILM_DATABASE } = await import('../src/data/films-dataset.js');
if (EXPANDED_FILM_DATABASE.length === 0) {
  console.error('O catálogo está vazio. Gere-o com npm run catalog:wikidata antes de empacotar.');
  process.exit(1);
}
// The IMDb datasets are for personal use, and TMDB's synopses are not ours to
// redistribute: only a catalog built from Wikidata may go to the store.
const source = await readCatalogSource();
if (source !== PUBLISHABLE_SOURCE) {
  console.error(`O catálogo não veio do Wikidata (origem: ${source || 'desconhecida'}). Gere-o com npm run catalog:wikidata e, se quiser, npm run catalog:enrich; os comandos do IMDb e do TMDB são só para uso local.`);
  process.exit(1);
}
const zip = `cinematch-v${version}.zip`;
// Top-level names instead of '.', so entries carry no './' prefix.
const entries = readdirSync(`${root}/dist`);
if (process.platform === 'win32') {
  // Windows has no zip command; its bundled bsdtar writes zip archives with -a.
  // The full path avoids Git Bash's GNU tar, which cannot.
  const tar = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\tar.exe`;
  execFileSync(tar, ['-a', '-cf', `../${zip}`, ...entries], { cwd: `${root}/dist`, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', `../${zip}`, ...entries], { cwd: `${root}/dist`, stdio: 'inherit' });
}
console.log(`Pacote pronto: ${zip} (${EXPANDED_FILM_DATABASE.length} filmes no catálogo).`);
