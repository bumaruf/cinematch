// Verifies the built payload without printing generated or personal data.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { POSTER_PATHS_BY_IMDB_ID } from '../../src/data/poster-catalog.js';
import { packageCatalog } from '../../src/domain/catalog/packaged.ts';

const assets = readdirSync('dist/assets');
const catalogs = assets.filter(name => /^catalog\.json-.*\.gz$/.test(name));
assert.equal(catalogs.length, 1, 'The package must contain exactly one local catalog');
const file = `dist/assets/${catalogs[0]}`;
const packaged = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
assert.equal(packaged.films.length, EXPANDED_FILM_DATABASE.length, 'Packaging must keep every film');
// The asset is the source catalog through packageCatalog: normalized, without
// fields no runtime code reads, and with precomputed taste tags.
assert.deepEqual(packaged, JSON.parse(JSON.stringify(packageCatalog(EXPANDED_FILM_DATABASE, POSTER_PATHS_BY_IMDB_ID))), 'Packaging must match packageCatalog');
assert.deepEqual(packaged.posters, POSTER_PATHS_BY_IMDB_ID, 'Packaging must preserve every poster');
const scripts = assets.filter(name => name.endsWith('.js'));
for (const name of scripts) {
  assert.ok(statSync(`dist/assets/${name}`).size < 500_000, `${name} must not embed the generated catalog`);
}
console.log(JSON.stringify({ films: packaged.films.length, catalogBytes: statSync(file).size,
  largestScriptBytes: Math.max(...scripts.map(name => statSync(`dist/assets/${name}`).size)), metadataPreserved: true }, null, 2));
