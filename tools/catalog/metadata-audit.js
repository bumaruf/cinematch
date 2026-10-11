export function parseBasicsRuntime(line, columns) {
  const values = line.split('\t');
  const imdbId = values[columns.tconst];
  const raw = values[columns.runtimeMinutes];
  const runtime = /^\d+$/.test(raw || '') && Number(raw) > 0 ? Number(raw) : 0;
  return { imdbId, runtime };
}

export function mergeVerifiedRuntime(film, record) {
  if (!record || record.imdbId !== film.imdbId) return film;
  // Keep a verified TMDB duration when IMDb has no duration for this title.
  if (!record.runtime && film.metadataSources?.runtime === 'tmdb' && film.runtime > 0) return film;
  return { ...film, runtime: record.runtime, runtimeKnown: record.runtime > 0,
    metadataSources: { ...film.metadataSources, runtime: 'imdb' } };
}

export function auditMetadata(films) {
  return {
    total: films.length,
    unknownCountries: films.filter(film => !film.country || film.country === 'Internacional').length,
    unknownRuntimes: films.filter(film => film.runtimeKnown === false || !(film.runtime > 0)).length,
    unverifiedRuntimes: films.filter(film => !film.metadataSources?.runtime).length,
    verifiedCountries: films.filter(film => film.metadataSources?.country).length,
    genericSynopses: films.filter(film => !film.pitch || film.pitch.startsWith('Um dos grandes marcos do gênero')).length,
  };
}
