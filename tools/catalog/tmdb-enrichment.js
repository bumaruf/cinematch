export function isGenericPitch(pitch) {
  const value = String(pitch || '').trim();
  return !value || value.length < 25 || value.startsWith('Um dos grandes marcos do gênero');
}

export function selectMovieResult(payload) {
  return payload?.movie_results?.[0] || null;
}

export function metadataFromTmdb(result, detailsPt, detailsEn) {
  const details = detailsPt || detailsEn || result || {};
  const pitch = [detailsPt?.overview, result?.overview, detailsEn?.overview]
    .map(value => String(value || '').trim())
    .find(value => value.length >= 25) || '';
  const countries = (details.production_countries || [])
    .map(country => String(country?.name || '').trim())
    .filter(Boolean);

  return {
    tmdbId: result?.id || details.id || null,
    posterPath: result?.poster_path || details.poster_path || null,
    pitch,
    country: countries.join(', '),
    originalLanguage: String(details.original_language || result?.original_language || '').trim(),
    ...(Number(details.runtime) > 0 ? { runtime: Number(details.runtime) } : {})
  };
}

export function mergeTmdbMetadata(film, metadata) {
  return {
    ...film,
    ...(isGenericPitch(film.pitch) && metadata.pitch ? { pitch: metadata.pitch } : {}),
    ...((!film.country || film.country === 'Internacional') && metadata.country ? { country: metadata.country } : {}),
    ...(!film.originalLanguage && metadata.originalLanguage ? { originalLanguage: metadata.originalLanguage } : {}),
    ...((film.runtimeKnown === false || !film.runtime) && metadata.runtime > 0 ? { runtime: metadata.runtime, runtimeKnown: true } : {})
  };
}
