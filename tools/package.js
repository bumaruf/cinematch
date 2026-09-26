// Zips dist/ for the Chrome Web Store as cinematch-v<version>.zip. Run it
// where the real catalog exists: the repository only has an empty stub.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { EXPANDED_FILM_DATABASE } = await import('../src/data/films-dataset.js');
if (EXPANDED_FILM_DATABASE.length === 0) {
  console.error('O catálogo está vazio. Gere-o com npm run catalog:import antes de empacotar.');
  process.exit(1);
}
const zip = `cinematch-v${version}.zip`;
execFileSync('zip', ['-qr', `../${zip}`, '.'], { cwd: `${root}/dist`, stdio: 'inherit' });
console.log(`Pacote pronto: ${zip} (${EXPANDED_FILM_DATABASE.length} filmes no catálogo).`);
