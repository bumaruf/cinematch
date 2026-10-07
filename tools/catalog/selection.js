const GENRE_TARGETS_AT_25K = Object.freeze({
  Documentary: 1500,
  Animation: 1500,
  Western: 600,
  'Film-Noir': 400,
  Musical: 500,
  Music: 800,
  Sport: 650,
  War: 800,
  'Sci-Fi': 1600,
  Horror: 2600,
});

/** Historical representation grows with the volume of feature production. */
export function yearlyQuota(year) {
  if (year < 1895) return 0;
  if (year <= 1919) return 10;
  if (year <= 1929) return 30;
  if (year <= 1949) return 60;
  if (year <= 1979) return 100;
  if (year <= 1999) return 140;
  if (year <= 2009) return 220;
  if (year <= 2019) return 300;
  return 320;
}

function qualityScore(movie) {
  // Logarithmic popularity keeps blockbusters strong without erasing older
  // and international films whose IMDb audiences are naturally smaller.
  return movie.rating * 12 + Math.log10(movie.numVotes + 1) * 10;
}

function compareMovies(a, b) {
  return qualityScore(b) - qualityScore(a) || b.numVotes - a.numVotes || b.rating - a.rating || a.tconst.localeCompare(b.tconst);
}

function scaledGenreTargets(limit) {
  const scale = limit / 25000;
  return Object.fromEntries(Object.entries(GENRE_TARGETS_AT_25K).map(([genre, target]) => [genre, Math.round(target * scale)]));
}

/**
 * Selects a historically balanced catalog, then fills weak genres and finally
 * uses global quality. Input records are never mutated.
 */
export function selectCatalogCandidates(movies, limit, endYear) {
  const eligible = movies.filter((movie) => movie.year >= 1895 && movie.year <= endYear);
  const selected = [];
  const selectedIds = new Set();
  const add = (movie) => {
    if (!movie || selected.length >= limit || selectedIds.has(movie.tconst)) return false;
    selected.push(movie);
    selectedIds.add(movie.tconst);
    return true;
  };

  const byYear = new Map();
  for (const movie of eligible) {
    const values = byYear.get(movie.year);
    if (values) values.push(movie);
    else byYear.set(movie.year, [movie]);
  }
  for (let year = 1895; year <= endYear && selected.length < limit; year++) {
    for (const movie of (byYear.get(year) ?? []).sort(compareMovies).slice(0, yearlyQuota(year))) add(movie);
  }

  const targets = scaledGenreTargets(limit);
  const genreCounts = Object.fromEntries(Object.keys(targets).map((genre) => [genre, selected.filter((movie) => movie.genres.includes(genre)).length]));
  const globallyRanked = [...eligible].sort(compareMovies);
  for (const [genre, target] of Object.entries(targets)) {
    if (selected.length >= limit || genreCounts[genre] >= target) continue;
    for (const movie of globallyRanked) {
      if (!movie.genres.includes(genre) || !add(movie)) continue;
      for (const coveredGenre of movie.genres) if (coveredGenre in genreCounts) genreCounts[coveredGenre]++;
      if (genreCounts[genre] >= target || selected.length >= limit) break;
    }
  }

  for (const movie of globallyRanked) add(movie);
  return selected;
}

export function selectionSummary(movies) {
  const decades = {};
  const genres = {};
  for (const movie of movies) {
    const decade = `${Math.floor(movie.year / 10) * 10}s`;
    decades[decade] = (decades[decade] ?? 0) + 1;
    for (const genre of movie.genres) genres[genre] = (genres[genre] ?? 0) + 1;
  }
  return { decades, genres };
}
