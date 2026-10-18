/**
 * Builds src/data/films-dataset.js from Wikidata (CC0), with synopses from
 * Wikipedia (CC BY-SA 4.0). Unlike the IMDb import, the result may ship in the
 * extension; each browser downloads IMDb's scores on its own.
 *
 *   npm run catalog:wikidata
 *
 * Optional:
 *   CATALOG_LIMIT=25000          films in the catalog
 *   WIKIDATA_MIN_SITELINKS=3     Wikipedias a film needs to be a candidate
 *   CATALOG_END_YEAR=2026        last release year
 *   WIKIDATA_YEARS_PER_QUERY=3   release years per candidate query (lower it on timeouts)
 *   WIKIPEDIA_PITCHES=0          skip synopses (generic text instead)
 *   IMDB_LOCAL_RATINGS=0         skip IMDb scores in the local dataset
 *
 * IMDB_LOCAL_RATINGS adds IMDb scores to the local file only, so tests and
 * diagnostics see what a browser with downloaded ratings sees. The build
 * strips them from the package (src/domain/catalog/packaged.ts).
 *
 * Progress is checkpointed in tools/catalog/wikidata-checkpoint.json; run the
 * command again to resume. Delete the file to start over.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { selectCatalogCandidates, selectionSummary } from './selection.js';
import { catalogSourceLine, filmRows, PUBLISHABLE_SOURCE } from './catalog-source.js';
import {
  buildFilm, canonicalGenres, candidatesQuery, DETAIL_QUERIES, entityLabelsQuery, groupByFilm, LEGACY_DETAILS, localizedLabelsQuery, parseCandidates, parseRows,
  pitchFromArticle, sitelinkScore, WIKIDATA_SPARQL, WIKIPEDIA_API,
} from './wikidata.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..', '..');
const datasetPath = path.join(root, 'src', 'data', 'films-dataset.js');
const checkpointPath = path.join(dirname, 'wikidata-checkpoint.json');

const LIMIT = Number.parseInt(process.env.CATALOG_LIMIT || '25000', 10);
const MIN_SITELINKS = Number.parseInt(process.env.WIKIDATA_MIN_SITELINKS || '3', 10);
const END_YEAR = Number.parseInt(process.env.CATALOG_END_YEAR || String(new Date().getUTCFullYear()), 10);
const WITH_PITCHES = process.env.WIKIPEDIA_PITCHES !== '0';
const WITH_LOCAL_RATINGS = process.env.IMDB_LOCAL_RATINGS !== '0';
const YEARS_PER_QUERY = Number.parseInt(process.env.WIKIDATA_YEARS_PER_QUERY || '3', 10);
const DETAIL_BATCH = 200;
const LABEL_BATCH = 300;
const PITCH_CONCURRENCY = 4;
// Wikimedia asks automated clients to identify themselves.
const USER_AGENT = 'CineMatchCatalogBuilder/1.0 (https://github.com/bumaruf/cinematch)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readCheckpoint() {
  if (!fs.existsSync(checkpointPath)) return { version: 2, candidates: {}, genreLabels: {}, localizedLabels: {}, details: {}, pitches: {} };
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  if (!checkpoint.version) {
    // Older checkpoints kept a film's details only for queries with results,
    // and ran every query of that time for each film they hold.
    for (const details of Object.values(checkpoint.details ?? {})) for (const name of LEGACY_DETAILS) details[name] ??= [];
    checkpoint.version = 2;
  }
  return checkpoint;
}

function writeCheckpoint(checkpoint) {
  fs.writeFileSync(`${checkpointPath}.tmp`, JSON.stringify(checkpoint), 'utf8');
  fs.renameSync(`${checkpointPath}.tmp`, checkpointPath);
}

/** @returns {Promise<Response>} */
async function request(url, init = {}, attempt = 0) {
  /** @type {Response | null} */
  let response = null;
  let failure = '';
  try {
    response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
    if (response.ok) return response;
    failure = `HTTP ${response.status}`;
  } catch (error) {
    failure = error.message;
  }
  const retryable = !response || response.status >= 500 || response.status === 429;
  if (attempt >= 5 || !retryable) throw new Error(`Falha em ${url.slice(0, 120)}: ${failure}`);
  const retryAfter = Number(response?.headers.get('retry-after'));
  await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt);
  return request(url, init, attempt + 1);
}

async function sparql(query) {
  const response = await request(WIKIDATA_SPARQL, {
    method: 'POST',
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }),
  });
  return response.json();
}

function chunks(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function collectCandidates(checkpoint) {
  for (let from = 1895; from <= END_YEAR; from += YEARS_PER_QUERY) {
    const key = `${from}`;
    if (checkpoint.candidates[key]) continue;
    const to = Math.min(END_YEAR, from + YEARS_PER_QUERY - 1);
    checkpoint.candidates[key] = parseCandidates(await sparql(candidatesQuery({ fromYear: from, toYear: to, minSitelinks: MIN_SITELINKS })));
    writeCheckpoint(checkpoint);
    console.log(`  ${from}–${to}: ${checkpoint.candidates[key].length} filmes`);
  }
  // A film released in two windows (festival, then theaters) keeps its first year.
  const byId = new Map();
  for (const list of Object.values(checkpoint.candidates)) {
    for (const candidate of list) {
      const known = byId.get(candidate.id);
      if (!known || candidate.year < known.year) byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

async function collectGenreLabels(checkpoint, candidates) {
  const ids = [...new Set(candidates.flatMap((candidate) => [...candidate.genreIds, ...candidate.classIds]))].filter((id) => !(id in checkpoint.genreLabels));
  for (const batch of chunks(ids, LABEL_BATCH)) {
    for (const row of parseRows(await sparql(entityLabelsQuery(batch)))) checkpoint.genreLabels[row.film] = row.label;
    for (const id of batch) checkpoint.genreLabels[id] ??= '';
    writeCheckpoint(checkpoint);
  }
  return new Map(Object.entries(checkpoint.genreLabels));
}

/** Portuguese genre labels for the keywords the panel shows; English stays for genre mapping. */
async function collectLocalizedLabels(checkpoint, candidates) {
  checkpoint.localizedLabels ??= {};
  const ids = [...new Set(candidates.flatMap((candidate) => candidate.genreIds))].filter((id) => !(id in checkpoint.localizedLabels));
  for (const batch of chunks(ids, LABEL_BATCH)) {
    for (const row of parseRows(await sparql(localizedLabelsQuery(batch)))) checkpoint.localizedLabels[row.film] = row.label;
    for (const id of batch) checkpoint.localizedLabels[id] ??= '';
    writeCheckpoint(checkpoint);
  }
  return new Map(Object.entries(checkpoint.localizedLabels));
}

const fetched = (details, name) => Boolean(details) && name in details;

async function collectDetails(checkpoint, selected) {
  for (const [name, query] of Object.entries(DETAIL_QUERIES)) {
    const missing = selected.filter((candidate) => !fetched(checkpoint.details[candidate.id], name));
    if (!missing.length) continue;
    const batches = chunks(missing, DETAIL_BATCH);
    for (const [index, batch] of batches.entries()) {
      const ids = batch.map((candidate) => candidate.id);
      for (const id of ids) checkpoint.details[id] = { ...checkpoint.details[id], [name]: [] };
      for (const [film, rows] of groupByFilm(parseRows(await sparql(query(ids))))) if (checkpoint.details[film]) checkpoint.details[film][name] = rows;
      writeCheckpoint(checkpoint);
      console.log(`  ${name}: lote ${index + 1}/${batches.length}`);
    }
  }
}

async function articleText(lang, title) {
  const params = new URLSearchParams({
    action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'wiki', redirects: '1',
    titles: title, format: 'json', formatversion: '2', maxlag: '5',
  });
  const json = await (await request(`${WIKIPEDIA_API(lang)}?${params}`)).json();
  return json?.query?.pages?.[0]?.extract ?? '';
}

async function collectPitches(checkpoint, selected) {
  const pending = selected.filter((candidate) => !(candidate.id in checkpoint.pitches));
  let done = 0;
  const work = async (candidate) => {
    const articles = checkpoint.details[candidate.id]?.articles ?? [];
    let pitch = '';
    // Portuguese first; English keeps a real synopsis where pt.wikipedia has none.
    for (const lang of ['pt', 'en']) {
      const title = articles.find((row) => row.lang === lang)?.label;
      if (!title) continue;
      pitch = pitchFromArticle(await articleText(lang, title).catch(() => ''));
      if (pitch) break;
    }
    checkpoint.pitches[candidate.id] = pitch;
    if (++done % 250 === 0) {
      writeCheckpoint(checkpoint);
      console.log(`  sinopses: ${done}/${pending.length}`);
    }
  };
  const queue = [...pending];
  await Promise.all(Array.from({ length: PITCH_CONCURRENCY }, async () => {
    while (queue.length) await work(queue.shift());
  }));
  writeCheckpoint(checkpoint);
}

/** IMDb scores for the local dataset only (personal use); never packaged. */
async function localRatings(imdbIds) {
  const response = await request('https://datasets.imdbws.com/title.ratings.tsv.gz');
  const lines = readline.createInterface({ input: Readable.fromWeb(response.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const ratings = new Map();
  for await (const line of lines) {
    const [id, rating, votes] = line.split('\t');
    if (imdbIds.has(id)) ratings.set(id, [Number(rating), Number(votes)]);
  }
  return ratings;
}

async function run() {
  console.log('Importando o catálogo do Wikidata…');
  const checkpoint = readCheckpoint();

  console.log('\n1/5 Candidatos por período');
  const candidates = await collectCandidates(checkpoint);
  console.log(`✓ ${candidates.length} longas com IMDb id e pelo menos ${MIN_SITELINKS} Wikipédias.`);

  console.log('\n2/5 Gêneros');
  const genreLabels = await collectGenreLabels(checkpoint, candidates);
  const pool = candidates.map((candidate) => ({
    ...candidate,
    tconst: candidate.imdbId,
    genres: canonicalGenres([...candidate.genreIds, ...candidate.classIds].map((id) => genreLabels.get(id)).filter(Boolean)),
  }));
  // Extra room for films dropped later (short runtimes, duplicate slugs).
  const selected = selectCatalogCandidates(pool, Math.ceil(LIMIT * 1.08), END_YEAR, sitelinkScore);
  const summary = selectionSummary(selected);
  console.log(`✓ ${selected.length} selecionados. Décadas: ${Object.entries(summary.decades).map(([decade, count]) => `${decade}: ${count}`).join(' · ')}`);

  console.log('\n3/5 Títulos, diretores, durações, países e idiomas');
  await collectDetails(checkpoint, selected);
  const localizedLabels = await collectLocalizedLabels(checkpoint, selected);

  console.log('\n4/5 Sinopses da Wikipédia');
  if (WITH_PITCHES) await collectPitches(checkpoint, selected);
  else console.log('  puladas (WIKIPEDIA_PITCHES=0)');

  console.log('\n5/5 Montando o catálogo');
  const films = [];
  const slugs = new Set();
  for (const candidate of selected) {
    const film = buildFilm(candidate, checkpoint.details[candidate.id] ?? {}, genreLabels, checkpoint.pitches[candidate.id] ?? '', localizedLabels);
    if (!film || slugs.has(film.slug)) continue;
    slugs.add(film.slug);
    films.push(film);
    if (films.length >= LIMIT) break;
  }
  if (WITH_LOCAL_RATINGS) {
    const ratings = await localRatings(new Set(films.map((film) => film.imdbId)));
    for (const film of films) [film.imdbRating, film.imdbVotes] = ratings.get(film.imdbId) ?? [0, 0];
    console.log(`  notas do IMDb no arquivo local: ${ratings.size} filmes (não entram no pacote)`);
  }
  const withPitch = films.filter((film) => !film.pitch.startsWith('Um dos grandes marcos')).length;
  const header = `/**
 * CineMatch film catalog, generated by tools/catalog/import-wikidata.js.
 * ${films.length} films from Wikidata (CC0); synopses from Wikipedia (CC BY-SA 4.0).
 * Do not edit by hand.
 */

export const EXPANDED_FILM_DATABASE = `;
  fs.writeFileSync(datasetPath, header + filmRows(films) + ';\n' + catalogSourceLine(PUBLISHABLE_SOURCE), 'utf8');
  console.log(`\n✓ ${films.length} filmes (${withPitch} com sinopse da Wikipédia) gravados em ${datasetPath}`);
  console.log('Próximo passo: npm run catalog:enrich (palavras-chave por regras locais).');
}

run().catch((error) => {
  console.error('Erro na importação:', error);
  process.exit(1);
});
