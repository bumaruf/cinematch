/**
 * tools/catalog/enrich-pitches.js
 * ---------------------------------------------------------------
 * Enriquece os pitches dos filmes no banco de dados usando a API
 * do TMDB (The Movie Database) para buscar sinopses reais em PT.
 *
 * USO:
 *   $env:TMDB_API_KEY="sua_chave_aqui"; node tools/catalog/enrich-pitches.js
 *
 * Chave GRATUITA em: https://www.themoviedb.org/settings/api
 * (Criar conta → Settings → API → Create → Developer)
 * ---------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ── Config ──────────────────────────────────────────────────────
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const DELAY_MS     = 200;   // ms between API calls (avoid rate limit)
const BATCH_SIZE   = 50;    // save progress every N films
const MAX_FILMS    = Infinity;

// ── Helpers ─────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function isGenericPitch(pitch) {
  if (!pitch) return true;
  return pitch.startsWith('Um dos grandes marcos do gênero') || pitch.length < 25;
}

async function tmdb(endpoint, params = {}) {
  const qs = new URLSearchParams({ api_key: TMDB_API_KEY, ...params }).toString();
  const url = `https://api.themoviedb.org/3${endpoint}?${qs}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getPitchForFilm(film) {
  const query = film.originalTitle || film.title;

  // Search with year constraint first
  let results = (await tmdb('/search/movie', { query, year: film.year, language: 'pt-BR', include_adult: false }))?.results;
  await sleep(DELAY_MS);

  if (!results?.length) {
    results = (await tmdb('/search/movie', { query, language: 'pt-BR', include_adult: false }))?.results;
    await sleep(DELAY_MS);
  }
  if (!results?.length) return null;

  // Find best year match
  const hit = results.find(r => Math.abs(parseInt(r.release_date) - film.year) <= 2) || results[0];
  if (!hit) return null;

  // Fetch full details with pt-BR overview
  const details = await tmdb(`/movie/${hit.id}`, { language: 'pt-BR' });
  await sleep(DELAY_MS);

  if (details?.overview?.length > 20) return details.overview.trim();

  // Fallback: English overview
  const detailsEn = await tmdb(`/movie/${hit.id}`, { language: 'en-US' });
  await sleep(DELAY_MS);

  return detailsEn?.overview?.trim() || null;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (!TMDB_API_KEY) {
    console.error('\n❌ TMDB_API_KEY não configurada!');
    console.error('   1. Crie uma conta grátis: https://www.themoviedb.org/signup');
    console.error('   2. Gere sua chave: https://www.themoviedb.org/settings/api');
    console.error('   3. Execute:');
    console.error('      $env:TMDB_API_KEY="sua_chave"; node tools/catalog/enrich-pitches.js\n');
    process.exit(1);
  }

  // Test API key
  const testData = await tmdb('/configuration');
  if (!testData) {
    console.error('\n❌ TMDB_API_KEY inválida ou sem conexão. Verifique a chave.\n');
    process.exit(1);
  }
  console.log('✅ TMDB API conectada!\n');

  // Load database
  const datasetPath = path.join(ROOT, 'src', 'data', 'films-dataset.js');
  const rawContent  = fs.readFileSync(datasetPath, 'utf-8');
  const tmpPath     = path.join(__dirname, '.tmp-dataset.mjs');

  // Convert to ES module for dynamic import
  const mjs = rawContent
    .replace(/^const\s+EXPANDED_FILM_DATABASE/m, 'export const EXPANDED_FILM_DATABASE')
    .replace(/^export const\s+EXPANDED_FILM_DATABASE/m, 'export const EXPANDED_FILM_DATABASE');
  fs.writeFileSync(tmpPath, mjs);
  const { EXPANDED_FILM_DATABASE } = await import(`file://${tmpPath}?t=${Date.now()}`);
  fs.unlinkSync(tmpPath);

  const db = [...EXPANDED_FILM_DATABASE];
  const slugToIdx = Object.fromEntries(db.map((f, i) => [f.slug, i]));

  const needsPitch = db.filter(f => isGenericPitch(f.pitch));
  const total = db.length;

  console.log(`📦 Banco: ${total} filmes`);
  console.log(`📝 Com pitch genérico: ${needsPitch.length} (${((needsPitch.length/total)*100).toFixed(1)}%)`);
  console.log(`✅ Com pitch real: ${total - needsPitch.length}`);

  // Load progress checkpoint (allows resuming interrupted runs)
  const checkpointPath = path.join(__dirname, 'pitch-checkpoint.json');
  let checkpoint = {};
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    const done = Object.values(checkpoint).filter(Boolean).length;
    console.log(`\n📂 Checkpoint: ${done} já processados — retomando...`);
  }

  // Apply already-saved pitches
  for (const [slug, pitch] of Object.entries(checkpoint)) {
    const idx = slugToIdx[slug];
    if (idx !== undefined && pitch && !isGenericPitch(pitch)) {
      db[idx] = { ...db[idx], pitch };
    }
  }

  const toProcess = needsPitch.filter(f => !checkpoint[f.slug]).slice(0, MAX_FILMS);
  console.log(`\n🚀 Processando ${toProcess.length} filmes restantes...`);
  const etaMin = Math.round(toProcess.length * (DELAY_MS * 3) / 60000);
  console.log(`⏱  Estimativa: ~${etaMin} minutos\n`);

  let enriched = 0, failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const film = toProcess[i];

    try {
      const pitch = await getPitchForFilm(film);
      if (pitch && pitch.length > 20) {
        const idx = slugToIdx[film.slug];
        if (idx !== undefined) db[idx] = { ...db[idx], pitch };
        checkpoint[film.slug] = pitch;
        enriched++;
      } else {
        checkpoint[film.slug] = '';
        failed++;
      }
    } catch (err) {
      checkpoint[film.slug] = '';
      failed++;
    }

    // Progress bar
    const pct = Math.round(((i + 1) / toProcess.length) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    process.stdout.write(`\r  [${bar}] ${pct}% (${i+1}/${toProcess.length}) ✓${enriched} ✗${failed}`);

    // Checkpoint + save every BATCH_SIZE
    if ((i + 1) % BATCH_SIZE === 0) {
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
      saveDatabase(db, datasetPath);
      process.stdout.write(`\n  💾 Salvo (${i+1}/${toProcess.length})\n`);
    }
  }

  // Final save
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  saveDatabase(db, datasetPath);

  const finalGeneric = db.filter(f => isGenericPitch(f.pitch)).length;
  console.log(`\n\n🎉 Concluído!`);
  console.log(`   Enriquecidos agora: ${enriched}`);
  console.log(`   Sem sinopse no TMDB: ${failed}`);
  console.log(`   Ainda genéricos: ${finalGeneric} de ${total} (${((finalGeneric/total)*100).toFixed(1)}%)`);
}

function saveDatabase(db, datasetPath) {
  const lines = db.map(f => '  ' + JSON.stringify(f));
  const content = `export const EXPANDED_FILM_DATABASE = [\n${lines.join(',\n')}\n];\n`;
  fs.writeFileSync(datasetPath, content, 'utf-8');
}

main().catch(err => { console.error('\n❌ Erro fatal:', err); process.exit(1); });
