// Verify existing catalog durations by exact IMDb identity; never reselect films.
// npm run catalog:verify -- --apply
// IMDB_BASICS_PATH may point to a local .tsv or .tsv.gz for offline verification.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { auditMetadata, mergeVerifiedRuntime, parseBasicsRuntime } from './metadata-audit.js';
import { mergeTmdbMetadata } from './tmdb-enrichment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const datasetPath = path.join(root, 'src/data/films-dataset.js');
const reportDir = path.join(root, 'e2e-screenshots');
const apply = process.argv.includes('--apply');
const films = EXPANDED_FILM_DATABASE;
if (!films.length) throw new Error('Gere o catálogo real antes de verificar seus metadados.');
const ids = new Set(films.map(film => film.imdbId));
const records = new Map();
let source;
const localPath = process.env.IMDB_BASICS_PATH;
if (localPath) {
  source = fs.createReadStream(localPath);
  if (localPath.endsWith('.gz')) source = source.pipe(createGunzip());
} else {
  const response = await fetch('https://datasets.imdbws.com/title.basics.tsv.gz', { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error(`IMDb respondeu HTTP ${response.status}.`);
  source = Readable.fromWeb(response.body).pipe(createGunzip());
}
const lines = createInterface({ input: source, crlfDelay: Infinity });
let columns;
let scanned = 0;
for await (const line of lines) {
  if (!columns) {
    columns = Object.fromEntries(line.split('\t').map((name, index) => [name, index]));
    if (columns.tconst === undefined || columns.runtimeMinutes === undefined) throw new Error('Cabeçalho IMDb inválido.');
    continue;
  }
  scanned++;
  const id = line.slice(0, line.indexOf('\t'));
  if (ids.has(id)) records.set(id, parseBasicsRuntime(line, columns));
  if (scanned % 2000000 === 0) console.log(`Verificados ${records.size}/${ids.size} IDs · ${scanned} linhas lidas`);
}
// A failed/truncated download must never replace the catalog.
if (records.size < ids.size * 0.98) throw new Error(`Cobertura insuficiente: ${records.size}/${ids.size}. Catálogo preservado.`);
const tmdbPath = path.join(root, 'tools/catalog/tmdb-checkpoint.json');
const tmdb = fs.existsSync(tmdbPath) ? JSON.parse(fs.readFileSync(tmdbPath, 'utf8')) : {};
const updated = films.map(film => mergeVerifiedRuntime(mergeTmdbMetadata(film, tmdb[film.imdbId] || {}), records.get(film.imdbId)));
const changes = films.flatMap((film, index) => film.runtime !== updated[index].runtime ? [{ imdbId: film.imdbId, title: film.originalTitle, before: film.runtime, after: updated[index].runtime }] : []);
const report = { source: 'https://datasets.imdbws.com/title.basics.tsv.gz', checkedAt: new Date().toISOString(), applied: apply,
  matched: records.size, unmatched: [...ids].filter(id => !records.has(id)), before: auditMetadata(films), after: auditMetadata(updated), runtimeChanges: changes };
fs.mkdirSync(reportDir, { recursive: true });
if (apply) {
  const backupDir = path.join(reportDir, 'catalog-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(datasetPath, path.join(backupDir, `films-${Date.now()}.js`));
  const temporary = `${datasetPath}.tmp`;
  fs.writeFileSync(temporary, `export const EXPANDED_FILM_DATABASE = [\n${updated.map(film => `  ${JSON.stringify(film)}`).join(',\n')}\n];\n`);
  fs.renameSync(temporary, datasetPath);
}
fs.writeFileSync(path.join(reportDir, 'catalog-metadata-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ applied: apply, matched: records.size, before: report.before, after: report.after, changedRuntimes: changes.length }, null, 2));
