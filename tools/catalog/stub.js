// The film catalog is derived from IMDb's datasets, which are licensed for
// personal, non-commercial use only, so it is not versioned. This writes an
// empty catalog when none exists, enough to typecheck, test and build; run
// `npm run catalog:import` to generate the real one.
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../../src/data/films-dataset.js', import.meta.url));
if (existsSync(target)) {
  console.log('Catálogo já existe; nada a fazer.');
} else {
  writeFileSync(target, '// Empty stub: generate the real catalog with `npm run catalog:import`.\nexport const EXPANDED_FILM_DATABASE = [];\n');
  console.log('Catálogo vazio criado em src/data/films-dataset.js.');
}
