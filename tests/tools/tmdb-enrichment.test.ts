import { describe, expect, test } from 'vitest';
import { isGenericPitch, mergeTmdbMetadata, metadataFromTmdb, selectMovieResult } from '../../tools/catalog/tmdb-enrichment.js';

describe('TMDB catalog enrichment', () => {
  test('selects a movie and normalizes all supported metadata', () => {
    const result = { id: 42, poster_path: '/poster.jpg', overview: '', original_language: 'it' };
    expect(selectMovieResult({ movie_results: [result] })).toEqual(result);
    expect(metadataFromTmdb(result, {
      id: 42,
      overview: 'Uma sinopse real e suficientemente detalhada para o catálogo.',
      production_countries: [{ name: 'Itália' }, { name: 'França' }],
      original_language: 'it'
    }, null)).toEqual({
      tmdbId: 42,
      posterPath: '/poster.jpg',
      pitch: 'Uma sinopse real e suficientemente detalhada para o catálogo.',
      country: 'Itália, França',
      originalLanguage: 'it'
    });
  });

  test('preserves curated values and fills placeholders', () => {
    const metadata = { pitch: 'Sinopse real longa o bastante para substituir o texto genérico.', country: 'Brasil', originalLanguage: 'pt' };
    const generic = mergeTmdbMetadata({ pitch: 'Um dos grandes marcos do gênero Drama.', country: 'Internacional' }, metadata);
    expect(generic).toMatchObject({ pitch: metadata.pitch, country: 'Brasil', originalLanguage: 'pt' });

    const curated = mergeTmdbMetadata({ pitch: 'Uma descrição artesanal que deve permanecer intacta.', country: 'Argentina', originalLanguage: 'es' }, metadata);
    expect(curated).toMatchObject({ pitch: 'Uma descrição artesanal que deve permanecer intacta.', country: 'Argentina', originalLanguage: 'es' });
    expect(isGenericPitch(generic.pitch)).toBe(false);
  });

  test('unknown duration is filled with a real runtime, and all coproductions survive', () => {
    const metadata = metadataFromTmdb({ id: 1 }, { runtime: 82, production_countries: [{ name: 'Brazil' }, { name: 'France' }, { name: 'Portugal' }] }, null);
    expect(metadata.country).toBe('Brazil, France, Portugal');
    expect(mergeTmdbMetadata({ runtime: 100, runtimeKnown: false }, metadata)).toMatchObject({ runtime: 82, runtimeKnown: true });
    expect(mergeTmdbMetadata({ runtime: 105, runtimeKnown: true }, metadata)).toMatchObject({ runtime: 105, runtimeKnown: true });
  });
});
