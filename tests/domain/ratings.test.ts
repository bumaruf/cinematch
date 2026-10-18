import { expect, test } from 'vitest';
import { applyRatings, collectRatings, ratingsAreStale, ratingsOf, withoutRatings } from '../../src/domain/catalog/ratings.ts';
import { film } from '../fixtures/catalog.ts';

test('only the catalog films are kept from IMDb ratings lines, skipping the header and malformed rows', () => {
  const lines = ['tconst\taverageRating\tnumVotes', 'tt1\t8.6\t2000000', 'tt2\t7.1\t1500', 'tt3\tabc\t10', 'tt4\t7\t-1', 'tt9\t9.9\t10'];
  expect(collectRatings(lines, new Set(['tt1', 'tt2', 'tt3', 'tt4']))).toEqual({ tt1: [8.6, 2000000], tt2: [7.1, 1500] });
});

test('ratings become stale after a month, and a missing or broken download is stale', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  expect(ratingsAreStale(null, now)).toBe(true);
  expect(ratingsAreStale({ fetchedAt: 'never', ratings: {} }, now)).toBe(true);
  expect(ratingsAreStale({ fetchedAt: '2026-10-01T00:00:00Z', ratings: {} }, now)).toBe(false);
  expect(ratingsAreStale({ fetchedAt: '2026-09-01T00:00:00Z', ratings: {} }, now)).toBe(true);
});

test('packaging removes scores and the keywords derived from them, but not the same word from another source', () => {
  const rated = film('rated', {
    imdbRating: 9.1, imdbVotes: 900000, keywords: ['máfia', 'aclamado', 'cult', 'popular'],
    keywordEvidence: [{ term: 'máfia', source: 'film' }, { term: 'aclamado', source: 'derived' }, { term: 'cult', source: 'legacy' }, { term: 'popular', source: 'derived' }],
  });
  const stripped = withoutRatings(rated);
  expect(stripped).toMatchObject({ imdbRating: 0, imdbVotes: 0, keywords: ['máfia', 'cult'] });
  expect(stripped.keywordEvidence?.map(entry => entry.term)).toEqual(['máfia', 'cult']);
  expect(rated.imdbRating).toBe(9.1);
});

test('downloaded ratings restore the score and its keywords; unrated films stay neutral', () => {
  const films = [film('a', { imdbId: 'tt1', keywords: ['x'], keywordEvidence: [] }), film('b', { imdbId: 'tt2' })].map(withoutRatings);
  const [a, b] = applyRatings(films, { tt1: [8.6, 600000] });
  expect(a).toMatchObject({ imdbRating: 8.6, imdbVotes: 600000, keywords: ['x', 'aclamado', 'obra-prima', 'masterpiece', 'popular'] });
  expect(a.keywordEvidence?.every(entry => entry.source === 'derived')).toBe(true);
  expect(b).toBe(films[1]);
  expect(applyRatings(films, null)).toEqual(films);
});

test('stripping then applying the original ratings gives back the scores', () => {
  const films = [film('a', { imdbRating: 7.4, imdbVotes: 1234 }), film('b', { imdbVotes: 0, imdbRating: 0 })];
  const restored = applyRatings(films.map(withoutRatings), ratingsOf(films));
  expect(restored.map(f => [f.imdbRating, f.imdbVotes])).toEqual([[7.4, 1234], [0, 0]]);
});

test('before the ratings are downloaded, a theme with a minimum score does not exclude every film', async () => {
  const { themeEligibility } = await import('../../src/domain/recommend/theme-eligibility.ts');
  const { getThemeCriteria } = await import('../../src/domain/themes/themes.ts');
  const criteria = getThemeCriteria('hidden-gems-underrated');
  expect(themeEligibility(withoutRatings(film('unrated')), criteria).eligible).toBe(true);
  expect(themeEligibility(film('low', { imdbRating: 6, imdbVotes: 2000 }), criteria).eligible).toBe(false);
});
