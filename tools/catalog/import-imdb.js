import https from 'https';
import zlib from 'zlib';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Curated fields of an existing catalog are kept; a fresh clone has none.
const CURRENT_DB = await import('../../src/data/films-dataset.js')
  .then((module) => module.EXPANDED_FILM_DATABASE)
  .catch(() => []);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// A larger local catalogue improves variety without shipping every IMDb title
// (which would make the extension impractical to load). Override when running
// the importer: IMDB_CATALOG_LIMIT=50000 node tools/catalog/import-imdb.js
const CATALOG_LIMIT = Number.parseInt(process.env.IMDB_CATALOG_LIMIT || '10000', 10);
const SOURCE_SELECTION_LIMIT = Math.ceil(CATALOG_LIMIT * 1.12);

// Helper to stream-read a gzipped TSV file line by line
function streamTsvGz(url, onLine) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      const gunzip = zlib.createGunzip();
      const rl = readline.createInterface({
        input: res.pipe(gunzip),
        crlfDelay: Infinity
      });

      let isHeader = true;
      let header = [];

      rl.on('line', (line) => {
        if (isHeader) {
          header = line.split('\t');
          isHeader = false;
          return;
        }
        const cols = line.split('\t');
        onLine(cols, header);
      });

      rl.on('close', () => resolve());
      gunzip.on('error', (err) => reject(err));
      res.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

// Convert string to slug
function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Map IMDb genres and year/director to our 15 curator themes
function mapThemes(genres, year, runtime, director) {
  const g = (genres || []).map(x => x.toLowerCase());
  const themes = new Set();

  if (g.includes('sci-fi') || g.includes('science fiction')) {
    if (year >= 1980 && (g.includes('action') || g.includes('thriller'))) themes.add('cyberpunk-neon-noir');
    themes.add('philosophical-hard-scifi');
  }
  if (g.includes('horror')) {
    themes.add('psychological-slow-burn-horror');
  }
  if (g.includes('crime') || g.includes('film-noir')) {
    themes.add('gritty-90s-crime-neo-realism');
    if (year >= 1970 && year <= 1979) themes.add('paranoia-70s-conspiracy-thriller');
  }
  if (g.includes('thriller') || g.includes('mystery')) {
    themes.add('mindfuck-broken-reality');
    if (year >= 1970 && year <= 1979) themes.add('paranoia-70s-conspiracy-thriller');
  }
  if (g.includes('romance')) {
    themes.add('poetic-romance-fleeting-encounters');
  }
  if (g.includes('comedy')) {
    themes.add('acid-satire-dark-comedy');
    themes.add('whimsical-cozy-comfort');
  }
  if (g.includes('animation') || g.includes('family')) {
    themes.add('whimsical-cozy-comfort');
    themes.add('cozy-bittersweet-coming-of-age');
  }
  if (g.includes('fantasy')) {
    themes.add('dreamlike-magical-realism');
  }
  if (g.includes('drama')) {
    themes.add('existential-urban-melancholy');
    if (runtime >= 130) themes.add('slow-cinema-contemplative');
    if (g.includes('romance') || g.includes('comedy')) themes.add('cozy-bittersweet-coming-of-age');
  }

  if (themes.size === 0) {
    themes.add('hidden-gems-underrated');
  }

  return Array.from(themes).slice(0, 3);
}

async function run() {
  console.log('🚀 Iniciando pipeline de importação do IMDb...\n');

  // STEP 1: Process title.ratings.tsv.gz
  console.log('📥 1/5: Baixando e analisando title.ratings.tsv.gz...');
  const ratingMap = new Map(); // tconst -> { rating, numVotes }

  await streamTsvGz('https://datasets.imdbws.com/title.ratings.tsv.gz', (cols) => {
    const tconst = cols[0];
    const rating = parseFloat(cols[1]);
    const numVotes = parseInt(cols[2], 10);

    // Filter films with meaningful audience reception (at least 3,500 votes)
    if (numVotes >= 3500 && rating >= 5.0) {
      ratingMap.set(tconst, { rating, numVotes });
    }
  });

  console.log(`✓ Candidatos filtrados por relevância e votos: ${ratingMap.size} títulos.`);

  // STEP 2: Process title.basics.tsv.gz
  console.log('\n📥 2/5: Baixando e filtrando title.basics.tsv.gz (somente longas-metragens)...');
  const movieMap = new Map(); // tconst -> movieObj

  await streamTsvGz('https://datasets.imdbws.com/title.basics.tsv.gz', (cols) => {
    const tconst = cols[0];
    const titleType = cols[1];
    const primaryTitle = cols[2];
    const originalTitle = cols[3];
    const isAdult = cols[4];
    const startYear = parseInt(cols[5], 10);
    const runtimeMinutes = parseInt(cols[7], 10);
    const genresStr = cols[8];

    // Only feature movies matching our rated candidates
    if (titleType === 'movie' && isAdult === '0' && ratingMap.has(tconst) && !isNaN(startYear)) {
      const genres = genresStr && genresStr !== '\\N' ? genresStr.split(',') : [];
      const ratingInfo = ratingMap.get(tconst);

      movieMap.set(tconst, {
        tconst,
        primaryTitle,
        originalTitle: originalTitle !== '\\N' ? originalTitle : primaryTitle,
        year: startYear,
        runtime: !isNaN(runtimeMinutes) ? runtimeMinutes : 100,
        genres,
        rating: ratingInfo.rating,
        numVotes: ratingInfo.numVotes,
        // Weighted score for ranking top films (IMDb weighted formula)
        rankScore: ratingInfo.numVotes * ratingInfo.rating
      });
    }
  });

  console.log(`✓ Longas-metragens válidos encontrados: ${movieMap.size} filmes.`);

  // Sort and select a broad, reliable subset. IMDb has millions of records;
  // this keeps the packaged extension responsive while expanding discovery.
  const sortedMovies = Array.from(movieMap.values())
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, Number.isFinite(CATALOG_LIMIT) && CATALOG_LIMIT > 0 ? SOURCE_SELECTION_LIMIT : 11200);

  const selectedTconsts = new Set(sortedMovies.map(m => m.tconst));
  const selectedMovieMap = new Map();
  sortedMovies.forEach(m => selectedMovieMap.set(m.tconst, m));

  console.log(`✓ Selecionados os Top ${selectedMovieMap.size} filmes mais aclamados e populares do cinema.`);

  // STEP 3: Process title.crew.tsv.gz (directors)
  console.log('\n📥 3/5: Mapeando diretores em title.crew.tsv.gz...');
  const directorNconstsToLookup = new Set();
  const movieDirectorsMap = new Map(); // tconst -> [nconst1, ...]

  await streamTsvGz('https://datasets.imdbws.com/title.crew.tsv.gz', (cols) => {
    const tconst = cols[0];
    if (selectedTconsts.has(tconst)) {
      const directors = cols[1] && cols[1] !== '\\N' ? cols[1].split(',') : [];
      if (directors.length > 0) {
        movieDirectorsMap.set(tconst, directors[0]); // Primary director
        directorNconstsToLookup.add(directors[0]);
      }
    }
  });

  console.log(`✓ ${directorNconstsToLookup.size} diretores identificados para busca de nomes.`);

  // STEP 4: Process name.basics.tsv.gz (director names)
  console.log('\n📥 4/5: Baixando nomes dos diretores em name.basics.tsv.gz...');
  const directorNameMap = new Map(); // nconst -> primaryName

  await streamTsvGz('https://datasets.imdbws.com/name.basics.tsv.gz', (cols) => {
    const nconst = cols[0];
    if (directorNconstsToLookup.has(nconst)) {
      const primaryName = cols[1];
      if (primaryName && primaryName !== '\\N') {
        directorNameMap.set(nconst, primaryName);
      }
    }
  });

  console.log(`✓ ${directorNameMap.size} nomes de diretores resolvidos.`);

  // STEP 5: Process title.akas.tsv.gz (Brazilian Portuguese Titles)
  console.log('\n📥 5/5: Mapeando títulos localizados no Brasil em title.akas.tsv.gz...');
  const ptTitleMap = new Map(); // tconst -> ptTitle

  await streamTsvGz('https://datasets.imdbws.com/title.akas.tsv.gz', (cols) => {
    const tconst = cols[0];
    if (selectedTconsts.has(tconst)) {
      const title = cols[2];
      const region = cols[3];
      const isOriginal = cols[7] === '1';

      if (region === 'BR' && title && title !== '\\N') {
        ptTitleMap.set(tconst, title);
      } else if (region === 'PT' && !ptTitleMap.has(tconst) && title && title !== '\\N') {
        ptTitleMap.set(tconst, title);
      }
    }
  });

  console.log(`✓ ${ptTitleMap.size} títulos oficiais em português mapeados.`);

  // STEP 6: Merge with existing curated dataset to preserve rich handcrafted keywords/pitches
  console.log('\n🔄 Consolidando dados e gerando src/data/films-dataset.js...');

  const existingSlugMap = new Map();
  if (Array.isArray(CURRENT_DB)) {
    for (const film of CURRENT_DB) {
      if (film.slug) existingSlugMap.set(film.slug.toLowerCase(), film);
      const titleKey = (film.title + '|' + film.year).toLowerCase();
      existingSlugMap.set(titleKey, film);
    }
  }

  const finalDatabase = [];
  const seenSlugs = new Set();

  for (const movie of sortedMovies) {
    const directorNconst = movieDirectorsMap.get(movie.tconst);
    const directorName = (directorNconst && directorNameMap.get(directorNconst)) || 'Diretor Desconhecido';
    const ptTitle = ptTitleMap.get(movie.tconst) || movie.primaryTitle;
    const origTitle = movie.originalTitle || movie.primaryTitle;
    const slug = slugify(movie.primaryTitle);

    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    // Check if we already have curated rich data for this film
    const existing = existingSlugMap.get(slug) || existingSlugMap.get((ptTitle + '|' + movie.year).toLowerCase());

    const themes = existing?.themes?.length
      ? existing.themes
      : mapThemes(movie.genres, movie.year, movie.runtime, directorName);

    const genres = existing?.genres?.length ? existing.genres : movie.genres;

    // Rich keyword generation
    const keywordsSet = new Set();
    if (existing?.keywords) {
      existing.keywords.forEach(k => keywordsSet.add(k.toLowerCase()));
    }
    keywordsSet.add(ptTitle.toLowerCase());
    keywordsSet.add(origTitle.toLowerCase());
    keywordsSet.add(directorName.toLowerCase());
    movie.genres.forEach(g => keywordsSet.add(g.toLowerCase()));
    keywordsSet.add(String(movie.year));
    keywordsSet.add(`${Math.floor(movie.year / 10) * 10}s`);

    const pitch = existing?.pitch ||
      `Um dos grandes marcos do gênero ${movie.genres.slice(0, 2).join('/')} (${movie.year}), dirigido por ${directorName}.`;

    finalDatabase.push({
      title: ptTitle,
      originalTitle: origTitle,
      year: movie.year,
      director: directorName,
      slug: slug,
      runtime: movie.runtime,
      country: existing?.country || 'Internacional',
      imdbRating: movie.rating,
      imdbVotes: movie.numVotes,
      imdbId: movie.tconst,
      themes,
      genres,
      keywords: Array.from(keywordsSet).slice(0, 15),
      pitch
    });
    if (finalDatabase.length >= CATALOG_LIMIT) break;
  }

  console.log(`\n🎉 Total de filmes reais consolidados: ${finalDatabase.length}`);

  const outputPath = path.resolve(__dirname, '..', '..', 'src', 'data', 'films-dataset.js');
  const header = `/**
 * Letterboxd AI Curator - Massive Official IMDb Curated Film Database
 * ${finalDatabase.length} 100% REAL feature films officially imported from IMDb Datasets.
 * Auto-generated by import_imdb.js.
 */

export const EXPANDED_FILM_DATABASE = `;

  fs.writeFileSync(outputPath, header + JSON.stringify(finalDatabase, null, 2) + ';\n', 'utf-8');
  console.log(`✅ Banco de dados oficial gravado com sucesso em: ${outputPath}`);
}

run().catch((err) => {
  console.error('❌ Erro no pipeline:', err);
  process.exit(1);
});
