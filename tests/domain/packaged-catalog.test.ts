import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { packageCatalog, unpackFilms, UNPACKAGED_FIELDS } from '../../src/domain/catalog/packaged.ts';
import { applyRatings, ratingsOf, withoutRatings } from '../../src/domain/catalog/ratings.ts';
import { pickDaily, dateKey } from '../../src/domain/recommend/daily.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { tasteTags } from '../../src/domain/taste/taste-match.ts';
import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { POSTER_PATHS_BY_IMDB_ID } from '../../src/data/poster-catalog.js';
import { discoveryCatalog, film } from '../fixtures/catalog.ts';
import { FIXED_NOW, testWithCatalog } from '../helpers.ts';

/** The packaged catalog, as the worker reads it after JSON round-tripping and with the browser's downloaded ratings. */
function shipped(films: Parameters<typeof packageCatalog>[0], posters = {}) {
  const data = JSON.parse(JSON.stringify(packageCatalog(films, posters)));
  return createCatalog(applyRatings(unpackFilms(data.films), ratingsOf(films)), data.posters, { normalized: data.normalized });
}

test('the package carries no IMDb score nor keywords derived from one', () => {
  const films = [film('rated', { imdbRating: 8.7, imdbVotes: 700000, keywords: ['aclamado', 'máfia'], keywordEvidence: [{ term: 'aclamado', source: 'derived' }, { term: 'máfia', source: 'film' }] })];
  const [packaged] = packageCatalog(films, {}).films;
  expect(packaged).toMatchObject({ imdbRating: 0, imdbVotes: 0, keywords: ['máfia'] });
  expect(JSON.stringify(packaged)).not.toMatch(/8\.7|700000|aclamado/);
});

test('packaged films carry exactly the taste tags the runtime would compute', () => {
  const raw = discoveryCatalog();
  const packaged = shipped(raw.films);
  for (const film of raw.films) {
    expect(packaged.bySlug(film.slug)?.tasteTags).toEqual(tasteTags(film, raw));
    for (const field of UNPACKAGED_FIELDS) expect(packaged.bySlug(film.slug)).not.toHaveProperty(field);
  }
});

testWithCatalog('the packaged real catalog recommends exactly what the raw catalog does', () => {
  // Ratings come back at the end of the keyword list, as in the browser.
  const raw = createCatalog(applyRatings(EXPANDED_FILM_DATABASE.map(withoutRatings), ratingsOf(EXPANDED_FILM_DATABASE)), POSTER_PATHS_BY_IMDB_ID);
  const packaged = shipped(EXPANDED_FILM_DATABASE, POSTER_PATHS_BY_IMDB_ID);
  const ratings = [5, 4.5, 4, 3.5, 3, 2.5, 2, 4, 3.5, 1];
  // Synced profiles carry no keywords or synopsis, so they reuse the catalog's tags.
  const profile = { username: 'packaged', favorites: [], films: [...raw.films].sort((a, b) => b.imdbVotes - a.imdbVotes).slice(0, 300)
    .map((film, i) => ({ title: film.title, year: film.year, slug: film.slug, rating: ratings[i % ratings.length] })) };
  const requests = [{}, { themeId: 'slow-cinema-contemplative' }, { themeId: 'mindfuck-broken-reality' }, { customPrompt: 'memória' }, { customPrompt: 'suspense sem terror até 1h40' }];
  for (const request of requests) {
    expect(recommend({ profile, ...request }, packaged, FIXED_NOW)).toEqual(recommend({ profile, ...request }, raw, FIXED_NOW));
  }
  const date = dateKey(FIXED_NOW);
  expect(pickDaily(profile, packaged, { date, now: FIXED_NOW })).toEqual(pickDaily(profile, raw, { date, now: FIXED_NOW }));
}, 120_000);

test('keyword evidence ships as one code per keyword and reads back unchanged', () => {
  const aligned = film('aligned', { keywords: ['máfia', 'drama'], keywordEvidence: [{ term: 'máfia', source: 'film' }, { term: 'drama', source: 'genre' }] });
  const unaligned = film('unaligned', { keywords: ['máfia', 'drama'], keywordEvidence: [{ term: 'drama', source: 'genre' }] });
  const data = JSON.parse(JSON.stringify(packageCatalog([aligned, unaligned], {})));
  expect(data.films[0]).toMatchObject({ keywordSources: 'fg' });
  expect(data.films[0]).not.toHaveProperty('keywordEvidence');
  // Evidence that does not mirror the keywords ships as it is.
  expect(data.films[1]).not.toHaveProperty('keywordSources');
  const [first, second] = unpackFilms(data.films);
  expect(first.keywordEvidence).toEqual(aligned.keywordEvidence);
  expect(first).not.toHaveProperty('keywordSources');
  expect(second.keywordEvidence).toEqual(unaligned.keywordEvidence);
});

test('a package with unknown keyword codes is rejected', () => {
  const [packaged] = JSON.parse(JSON.stringify(packageCatalog([film('a', { keywords: ['x'], keywordEvidence: [{ term: 'x', source: 'film' }] })], {}))).films;
  expect(() => unpackFilms([{ ...packaged, keywordSources: '?' }])).toThrow(/inválido/);
  expect(() => unpackFilms([{ ...packaged, keywordSources: 'ff' }])).toThrow(/inválido/);
});
