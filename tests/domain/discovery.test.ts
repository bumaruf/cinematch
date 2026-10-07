import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { productionCountries } from '../../src/domain/catalog/countries.ts';
import { specificKeywords } from '../../src/domain/catalog/evidence.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { parseSearchQuery } from '../../src/domain/recommend/query.ts';
import { themeEligibility } from '../../src/domain/recommend/theme-eligibility.ts';
import { createTasteMatcher } from '../../src/domain/taste/taste-match.ts';
import { createFilmIdentityIndex } from '../../src/domain/profile/identity.ts';
import { getThemeCriteria } from '../../src/domain/themes/themes.ts';
import { film, discoveryCatalog } from '../fixtures/catalog.ts';
import { FIXED_NOW } from '../helpers.ts';

test('negations exclude genres while durations and decades remain hard constraints', () => {
  const catalog = createCatalog([
    film('yes', { genres: ['Comedy'], year: 1994, runtime: 89 }),
    film('horror', { genres: ['Comedy', 'Horror'], year: 1994, runtime: 89 }),
    film('long', { genres: ['Comedy'], year: 1994, runtime: 91 }),
    film('old', { genres: ['Comedy'], year: 1989, runtime: 89 }),
    film('unknown', { genres: ['Comedy'], year: 1994, runtime: 89, runtimeKnown: false }),
  ]);
  const result = recommend({ profile: null, customPrompt: 'quero comédia dos anos 90 sem terror até 90 minutos' }, catalog, FIXED_NOW);
  expect(result.recommendations.map((item) => item.letterboxdSlug)).toEqual(['yes']);
  expect(result.interpretation).toEqual(expect.arrayContaining(['Sem terror', '1990–1999', 'Até 90 min']));
});

test('negative-only requests remain useful instead of requiring a positive keyword', () => {
  const catalog = createCatalog([film('drama'), film('horror', { genres: ['Horror'] })]);
  expect(recommend({ profile: null, customPrompt: 'sem terror' }, catalog, FIXED_NOW).recommendations.map((item) => item.letterboxdSlug)).toEqual(['drama']);
});

test('policial maps to Crime, and different spelling of production countries agrees', () => {
  const query = parseSearchQuery('policial italiano sem comédia');
  expect([...query.genres]).toEqual(['crime']);
  expect([...query.countries]).toEqual(['IT']);
  expect([...productionCountries('Itália, United States of America; Japan')]).toEqual(['IT', 'US', 'JP']);
  const catalog = createCatalog([film('yes', { country: 'Italy, France', genres: ['Crime'] }), film('title-only', { title: 'Policial italiano', genres: ['Crime'], country: 'United States' })]);
  expect(recommend({ profile: null, customPrompt: 'policial italiano' }, catalog, FIXED_NOW).recommendations.map((item) => item.letterboxdSlug)).toEqual(['yes']);
});

test('an exact original title wins over accumulated lexical and IMDb bonuses', () => {
  const catalog = createCatalog([
    film('alien', { title: 'Alien: o oitavo passageiro', originalTitle: 'Alien', imdbRating: 7 }),
    ...Array.from({ length: 9 }, (_, i) => film(`alien-${i}`, { title: `Alien ${i}`, originalTitle: `Alien ${i}`, director: 'Alien', pitch: 'Alien '.repeat(20), keywords: ['alien'], imdbRating: 9 })),
  ]);
  expect(recommend({ profile: null, customPrompt: 'Alien' }, catalog, FIXED_NOW).recommendations[0].letterboxdSlug).toBe('alien');
});

test('quoted titles disambiguate a country name or a numeric title', () => {
  const catalog = createCatalog([film('brazil', { title: 'Brazil', country: 'United Kingdom' }), film('1984', { title: '1984', year: 1956 })]);
  expect(recommend({ profile: null, customPrompt: '"Brazil"' }, catalog, FIXED_NOW).recommendations[0].catalogSlug).toBe('brazil');
  expect(recommend({ profile: null, customPrompt: '“1984”' }, catalog, FIXED_NOW).recommendations[0].catalogSlug).toBe('1984');
});

test('natural durations and explicit periods are consumed instead of becoming lexical demands', () => {
  const query = parseSearchQuery('drama entre 1980 e 1995 com até 2h30');
  expect(query.constraints).toEqual({ minYear: 1980, maxYear: 1995, maxRuntime: 150 });
  expect(query.lexicalTokens).toEqual([]);
});

test('a light request excludes tension without interpreting mother as a literal keyword', () => {
  const query = parseSearchQuery('algo leve para assistir com minha mãe sem terror');
  expect(query.lexicalTokens).toEqual([]);
  expect([...query.excludedGenres]).toEqual(expect.arrayContaining(['horror', 'thriller', 'war']));
});

test('genre and director expansions are not evidence of a cinematic atmosphere', () => {
  const generated = film('generated', { genres: ['Sci-Fi'], year: 1995, keywords: ['distopia', 'robô', 'slow cinema', 'contemplativo'], keywordEvidence: [{ term: 'distopia', source: 'genre' }, { term: 'robô', source: 'genre' }, { term: 'slow cinema', source: 'director' }, { term: 'contemplativo', source: 'director' }] });
  expect(specificKeywords(generated)).toEqual([]);
  expect(themeEligibility(generated, getThemeCriteria('cyberpunk-neon-noir')).eligible).toBe(false);
  const real = { ...generated, keywords: ['distopia', 'robô'], keywordEvidence: [{ term: 'distopia', source: 'film' as const }, { term: 'robô', source: 'film' as const }] };
  expect(themeEligibility(real, getThemeCriteria('cyberpunk-neon-noir')).eligible).toBe(true);
});

test('inherited slasher tags do not veto a slow horror synopsis', () => {
  const candidate = film('slow', { genres: ['Horror'], keywords: ['slasher', 'monstro'], pitch: 'Slow burn: isolamento e luto num terror psicológico.' });
  expect(themeEligibility(candidate, getThemeCriteria('psychological-slow-burn-horror')).eligible).toBe(true);
});

test('real synopsis affinity can cross countries and unknown origins', () => {
  const catalog = discoveryCatalog();
  const match = createTasteMatcher({ films: [{ title: 'seen', slug: 'seen', rating: 4 }] }, catalog);
  expect(match(catalog.bySlug('bridge-0')!).eligible).toBe(true);
  expect(match({ ...catalog.bySlug('bridge-0')!, country: '' }).eligible).toBe(true);
  expect(match(catalog.bySlug('animation-0')!).eligible).toBe(false);
});

test('personal rating scales recognize relative favorites without liking one-star histories', () => {
  const catalog = discoveryCatalog();
  const ratings = Array.from({ length: 10 }, (_, i) => ({ title: `rated-${i}`, director: i >= 7 ? 'A' : `other-${i}`, rating: i >= 7 ? 3 : 2.5 }));
  expect(createTasteMatcher({ films: ratings }, catalog)(catalog.bySlug('known-0')!).eligible).toBe(true);
  expect(createTasteMatcher({ films: ratings.map((item) => ({ ...item, rating: 1 })) }, catalog)(catalog.bySlug('known-0')!).hasPreferences).toBe(false);
});

test('many dislikes of one director do not multiply penalties without limit', () => {
  const catalog = discoveryCatalog();
  const positive = { title: 'seen', slug: 'seen', rating: 5 };
  const dislikes = Array.from({ length: 20 }, (_, i) => ({ title: `bad-${i}`, director: 'A', rating: 1 }));
  const one = createTasteMatcher({ films: [positive, dislikes[0]] }, catalog)(catalog.bySlug('known-0')!);
  const many = createTasteMatcher({ films: [positive, ...dislikes] }, catalog)(catalog.bySlug('known-0')!);
  expect(many.score).toBe(one.score);
});

test('modes preserve requirements and exploration avoids a six-film director monopoly', () => {
  const catalog = discoveryCatalog();
  const profile = { username: 'test', films: [{ title: 'seen', slug: 'seen', rating: 5 }] };
  const familiar = recommend({ profile, mode: 'familiar' }, catalog, FIXED_NOW);
  const explore = recommend({ profile, mode: 'explore' }, catalog, FIXED_NOW);
  expect(familiar.recommendations[0].director).toBe('A');
  expect(explore.recommendations.filter((item) => item.director === 'A').length).toBeLessThanOrEqual(2);
  expect(explore.recommendations.some((item) => item.director.startsWith('B'))).toBe(true);
  const constrained = recommend({ profile, mode: 'surprise', customPrompt: 'animação japonesa até 120 minutos' }, catalog, FIXED_NOW);
  expect(constrained.recommendations.length).toBeGreaterThan(0);
  expect(constrained.recommendations.every((item) => item.genres.includes('Animation') && item.country === 'Japan')).toBe(true);
});

test('different tastes change the same atmosphere instead of merely its explanation', () => {
  const catalog = discoveryCatalog();
  const a = { username: 'a', films: [{ title: 'seen', slug: 'seen', rating: 5 }] };
  const b = { username: 'b', films: [{ title: 'animation-0', slug: 'animation-0', rating: 5 }] };
  const first = recommend({ profile: a, themeId: 'hidden-gems-underrated', mode: 'explore' }, catalog, FIXED_NOW);
  const second = recommend({ profile: b, themeId: 'hidden-gems-underrated', mode: 'explore' }, catalog, FIXED_NOW);
  expect(first.recommendations.map((item) => item.letterboxdSlug)).not.toEqual(second.recommendations.map((item) => item.letterboxdSlug));
});

test('local feedback exclusions remain hard restrictions in every mode', () => {
  const catalog = discoveryCatalog();
  for (const mode of ['familiar', 'explore', 'surprise'] as const) {
    const result = recommend({ profile: null, mode, excludedFilms: [{ title: 'bridge-0', slug: 'bridge-0' }] }, catalog, FIXED_NOW);
    expect(result.recommendations).not.toHaveLength(0);
    expect(result.recommendations.some((film) => film.catalogSlug === 'bridge-0')).toBe(false);
  }
});

test('explicit identities do not confuse similar titles, sequels or remakes', () => {
  const saved = createFilmIdentityIndex([{ title: 'Alien', year: 1979, slug: 'alien' }, { title: 'Suspiria', year: 1977 }]);
  expect(saved.has({ title: 'Aliens', year: 1979, slug: 'aliens' })).toBe(false);
  expect(saved.has({ title: 'Alien', year: 1979, slug: 'alien-1979' })).toBe(true);
  expect(saved.has({ title: 'Suspiria', year: 2018 })).toBe(false);
  expect(saved.has({ title: 'Suspiria', year: 1977 })).toBe(true);
});
