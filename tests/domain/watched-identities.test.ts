import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { analyzeProfile } from '../../src/domain/profile/analyze.ts';
import { catalogIdentity, createWatchedIndex, toWatchedEntry } from '../../src/domain/profile/watched.ts';
import { createFilmIdentityIndex } from '../../src/domain/profile/identity.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { film } from '../fixtures/catalog.ts';
import { FIXED_NOW } from '../helpers.ts';

const potter = film('harry-potter-and-the-sorcerer-s-stone', {
  imdbId: 'tt0241527', year: 2001, title: 'Harry Potter e a Pedra Filosofal',
  originalTitle: "Harry Potter and the Sorcerer's Stone", director: 'Chris Columbus',
  genres: ['Fantasy'], pitch: 'Um garoto descobre a magia em sua vida cotidiana.', imdbVotes: 900000,
});
const catalog = createCatalog([potter, film('another', { genres: ['Fantasy'], pitch: 'Uma família descobre a magia em sua vida.', imdbVotes: 900000 })]);

test.each(["Harry Potter and the Philosopher's Stone", 'Harry Potter and the Philosopher’s Stone'])('Letterboxd title %s resolves to the same catalog film and is blocked', title => {
  const raw = { title, year: 2001, slug: 'harry-potter-and-the-philosophers-stone', rating: 3 };
  expect(catalog.resolve(raw).film?.imdbId).toBe('tt0241527');
  const watched = createWatchedIndex(analyzeProfile({ username: 'test', films: [raw] }, catalog, FIXED_NOW).watchedList);
  expect(watched.has(catalogIdentity(potter))).toBe(true);
  expect(catalog.resolve({ ...raw, title: 'Nome indisponível', year: null }).film?.imdbId).toBe('tt0241527');
});

test.each([
  { customPrompt: '"Harry Potter and the Sorcerer\'s Stone"' },
  { themeId: 'dreamlike-magical-realism' },
  {},
])('watched regional titles stay excluded in search, nearby themes and general recommendations: %j', query => {
  const profile = { username: 'test', films: [{ title: "Harry Potter and the Philosopher's Stone", year: 2001, slug: 'harry-potter-and-the-philosophers-stone', rating: 3 }] };
  const allowing = recommend({ profile, ...query, filters: { minVotes: 250000, avoidWatched: false } }, catalog, FIXED_NOW);
  expect(allowing.recommendations.some(movie => movie.catalogSlug === potter.slug)).toBe(true);
  const avoiding = recommend({ profile, ...query, filters: { minVotes: 250000, avoidWatched: true } }, catalog, FIXED_NOW);
  expect(avoiding.recommendations.some(movie => movie.catalogSlug === potter.slug)).toBe(false);
});

test('a reviewed alternate title does not identify a remake or a sequel as watched', () => {
  const watched = createWatchedIndex(analyzeProfile({ username: 'test', films: [{ title: "Harry Potter and the Philosopher's Stone", year: 2001, slug: 'harry-potter-and-the-philosophers-stone' }] }, catalog, FIXED_NOW).watchedList);
  expect(catalog.resolve({ title: "Harry Potter and the Philosopher's Stone", year: 2030 }).film).toBeNull();
  expect(watched.has({ title: potter.title, originalTitle: potter.originalTitle, year: 2030, slug: `${potter.slug}-2030` })).toBe(false);
  expect(watched.has({ title: 'Harry Potter and the Chamber of Secrets', year: 2002, slug: 'harry-potter-and-the-chamber-of-secrets' })).toBe(false);
});

test('IMDb identity survives renamed titles and slugs, without conflating distinct IDs', () => {
  const identity = { title: 'Título antigo', slug: 'old-title', imdbId: 'tt0241527' };
  const watched = createWatchedIndex([toWatchedEntry(identity)]);
  const explicit = createFilmIdentityIndex([identity]);
  for (const index of [watched, explicit]) {
    expect(index.has({ title: 'Novo título', slug: 'new-title', imdbId: 'tt0241527' })).toBe(true);
    expect(index.has({ ...identity, imdbId: 'tt9999999' })).toBe(false);
  }
  expect(catalog.resolve({ title: 'Título desconhecido', imdbId: 'tt0241527' }).film?.slug).toBe(potter.slug);
  expect(catalog.resolve({ title: potter.title, slug: potter.slug, imdbId: 'tt9999999' }).film).toBeNull();
});

test('curly apostrophes agree with straight ones even without catalog metadata', () => {
  const watched = createWatchedIndex([toWatchedEntry({ title: 'The World’s End', year: 2013 })]);
  expect(watched.has({ title: "The World's End", year: 2013 })).toBe(true);
});

test('a short unrelated title cannot resolve a longer unknown film title by substring', () => {
  const small = createCatalog([film('o', { title: 'O', originalTitle: 'O', year: 2001 })]);
  expect(small.resolve({ title: 'Another movie', year: 2001 }).film).toBeNull();
});

test('known candidates still match legacy entries with absent IMDb identity, including undated and misspelled titles', () => {
  const watched = createWatchedIndex([
    toWatchedEntry({ title: 'An Unknown Movie', year: 2001 }),
    toWatchedEntry({ title: 'Another Unresolved Movie' }),
    toWatchedEntry({ title: 'Identical title', year: 2001, imdbId: 'tt-other' }),
  ]);
  expect(watched.has({ title: 'An Unknown Movi', year: 2001, imdbId: 'tt-new' })).toBe(true);
  expect(watched.has({ title: 'Another Unresolved Movie', year: 2001, imdbId: 'tt-new' })).toBe(true);
  expect(watched.has({ title: 'Identical title', year: 2001, imdbId: 'tt-new' })).toBe(false);
  expect(watched.has({ title: 'An Unknown Movie', year: 2030, imdbId: 'tt-new' })).toBe(false);
  expect(watched.has({ title: 'An Unknown Movie', imdbId: 'tt-new' })).toBe(true);
  expect(watched.has({ title: 'Identical title', year: 2001 })).toBe(true);
});
