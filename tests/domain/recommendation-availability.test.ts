import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { relatedThemeEligibility } from '../../src/domain/recommend/theme-eligibility.ts';
import { getThemeCriteria } from '../../src/domain/themes/themes.ts';
import { film } from '../fixtures/catalog.ts';
import { FIXED_NOW } from '../helpers.ts';

test('an exhausted exact theme offers labelled nearby films without reintroducing watched films', () => {
  const catalog = createCatalog([
    film('seen', { genres: ['Sci-Fi'], pitch: 'Cyberpunk de hackers e realidade virtual.' }),
    film('nearby', { genres: ['Sci-Fi'], pitch: 'Em um futuro distópico, um hacker luta contra a tecnologia que controla a população.' }),
    film('space-horror', { genres: ['Horror', 'Sci-Fi'], pitch: 'Uma sonda espacial leva um androide pela distopia do futuro.' }),
  ]);
  const profile = { username: 'test', films: [{ title: 'seen', slug: 'seen', year: 1995, rating: 5 }] };
  const result = recommend({ profile, themeId: 'cyberpunk-neon-noir' }, catalog, FIXED_NOW);
  expect(result.recommendations.map(movie => movie.catalogSlug)).toEqual(['nearby']);
  expect(result.recommendations[0].themeFit).toBe('related');
  expect(result.notice).toMatch(/próxima ao clima/);
});

test('nearby films still obey runtime, year, feedback and genre constraints', () => {
  const candidate = film('nearby', { genres: ['Drama', 'Mystery'], pitch: 'Preso num apartamento, um homem precisa escapar para sobreviver.', runtime: 85 });
  const catalog = createCatalog([candidate]);
  const request = { profile: null, themeId: 'claustrophobic-single-location' };
  expect(recommend(request, catalog, FIXED_NOW).recommendations[0].themeFit).toBe('related');
  for (const filters of [{ maxRuntime: 80 }, { minYear: 2000 }]) expect(recommend({ ...request, filters }, catalog, FIXED_NOW).recommendations).toEqual([]);
  expect(recommend({ ...request, excludedFilms: [{ title: 'nearby', slug: 'nearby' }] }, catalog, FIXED_NOW).recommendations).toEqual([]);
  expect(recommend(request, createCatalog([{ ...candidate, runtimeKnown: false }]), FIXED_NOW).recommendations).toHaveLength(1);
  expect(recommend({ ...request, filters: { maxRuntime: 90 } }, createCatalog([{ ...candidate, runtimeKnown: false }]), FIXED_NOW).recommendations).toEqual([]);
  expect(recommend(request, createCatalog([{ ...candidate, genres: ['Action', 'Adventure'] }]), FIXED_NOW).recommendations).toEqual([]);
});

test('inherited style and a prison plot cannot become an exact or nearby single-location promise', () => {
  const candidate = film('inherited', { themes: ['claustrophobic-single-location'], keywords: ['apartamento', 'confinado'], keywordEvidence: [{ term: 'apartamento', source: 'director' }, { term: 'confinado', source: 'genre' }], pitch: 'Um homem passa décadas numa prisão e depois foge.' });
  expect(relatedThemeEligibility(candidate, getThemeCriteria('claustrophobic-single-location')).eligible).toBe(false);
  expect(recommend({ profile: null, themeId: 'claustrophobic-single-location' }, createCatalog([candidate]), FIXED_NOW).recommendations).toEqual([]);
});

test('exact matches keep their places before nearby alternatives, including one-director pools', () => {
  const exact = Array.from({ length: 6 }, (_, index) => film(`exact-${index}`, { director: 'Same director', genres: ['Sci-Fi'], pitch: 'Cyberpunk de hackers e realidade virtual.' }));
  const nearby = film('nearby', { genres: ['Sci-Fi'], pitch: 'Em um futuro distópico, um hacker luta contra a tecnologia.', imdbRating: 9.9 });
  const result = recommend({ profile: null, themeId: 'cyberpunk-neon-noir' }, createCatalog([...exact, nearby]), FIXED_NOW);
  expect(result.recommendations).toHaveLength(6);
  expect(result.recommendations.every(movie => movie.catalogSlug.startsWith('exact-') && !movie.themeFit)).toBe(true);
});

test('automatic recommendations keep browsing when strong affinity matches are exhausted', () => {
  const catalog = createCatalog([film('seen', { director: 'A' }), film('new', { director: 'B' })]);
  const profile = { username: 'test', films: [{ title: 'seen', slug: 'seen', year: 1995, rating: 5 }] };
  const result = recommend({ profile }, catalog, FIXED_NOW);
  expect(result.recommendations.map(movie => movie.catalogSlug)).toEqual(['new']);
  expect(result.recommendations[0].affinityReason).toBeNull();
  const repeated = recommend({ profile, filters: { excludeRecent: [{ title: 'new', slug: 'new', year: 1995 }] } }, catalog, FIXED_NOW);
  expect(repeated.recommendations.map(movie => movie.catalogSlug)).toEqual(['new']);
  expect(repeated.allowRecentFallback).toBe(true);
});
