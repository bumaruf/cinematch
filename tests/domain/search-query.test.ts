import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { parseSearchQuery } from '../../src/domain/recommend/query.ts';
import { film } from '../fixtures/catalog.ts';
import { createTestContext, FIXED_NOW } from '../helpers.ts';
import { generateRecommendations } from '../../src/application/recommendations.ts';

const run = (prompt: string, films: ReturnType<typeof film>[], filters = {}) =>
  recommend({ profile: null, customPrompt: prompt, filters }, createCatalog(films), FIXED_NOW);
const ids = (result: ReturnType<typeof run>) => result.recommendations.map(film => film.catalogSlug).sort();

test('OR offers both genres without leaking horror, long films or unknown runtimes', () => {
  const prompt = 'quero suspense ou ficção científica, sem terror, com no máximo 1h40';
  const result = run(prompt, [
    film('thriller', { genres: ['Thriller'], runtime: 100 }),
    film('scifi', { genres: ['Sci-Fi'], runtime: 99 }),
    film('horror', { genres: ['Thriller', 'Horror'], runtime: 90 }),
    film('long', { genres: ['Sci-Fi'], runtime: 101 }),
    film('unknown', { genres: ['Thriller'], runtime: 90, runtimeKnown: false }),
    film('incidental-title', { title: 'Suspense ou ficção científica', genres: ['Drama'], runtime: 90 }),
  ]);
  expect(ids(result)).toEqual(['scifi', 'thriller']);
  expect(result.interpretation).toEqual(expect.arrayContaining(['suspense ou ficção científica', 'Sem terror', 'Até 100 min']));
  expect(parseSearchQuery(prompt).lexicalTokens).toEqual([]);
});

test('AND still requires both genres and OR preserves compound aliases', () => {
  const films = [film('comedy', { genres: ['Comedy'] }), film('romance', { genres: ['Romance'] }),
    film('romcom', { genres: ['Comedy', 'Romance'] }), film('drama')];
  expect(ids(run('comédia e romance', films))).toEqual(['romcom']);
  expect(ids(run('romcom ou drama', films))).toEqual(['drama', 'romcom']);
});

test('genre-country alternatives keep their pairings instead of producing a cross product', () => {
  const films = [
    film('italian-thriller', { genres: ['Thriller'], country: 'Italy' }),
    film('french-drama', { genres: ['Drama'], country: 'France' }),
    film('french-thriller', { genres: ['Thriller'], country: 'France' }),
    film('italian-drama', { genres: ['Drama'], country: 'Italy' }),
  ];
  expect(ids(run('suspense italiano ou drama francês', films))).toEqual(['french-drama', 'italian-thriller']);
});

test('a shared country after a comma applies to every alternative', () => {
  const films = [film('japanese-thriller', { genres: ['Thriller'], country: 'Japan' }),
    film('japanese-scifi', { genres: ['Sci-Fi'], country: 'Japan' }), film('us-scifi', { genres: ['Sci-Fi'] })];
  expect(ids(run('suspense ou ficção científica, japonês', films))).toEqual(['japanese-scifi', 'japanese-thriller']);
  expect(ids(run('drama italiano ou francês', [film('it', { country: 'Italy' }), film('fr', { country: 'France' }), film('us'),
    film('french-horror', { country: 'France', genres: ['Horror'] })]))).toEqual(['fr', 'it']);
});

test.each([
  'sem terror, comédia francesa',
  'sem terror; comédia francesa',
  'não quero terror. Prefiro comédia francesa',
  'sem terror mas comédia francesa',
  'sem terror nem romance, comédia francesa',
])('negation has a local scope: %s', prompt => {
  const result = run(prompt, [film('yes', { genres: ['Comedy'], country: 'France' }),
    film('horror', { genres: ['Comedy', 'Horror'], country: 'France' }), film('us', { genres: ['Comedy'] })]);
  expect(ids(result)).toEqual(['yes']);
  expect(result.interpretation).toContain('Sem terror');
});

test('negative lists exclude every listed genre and country', () => {
  const result = run('drama, sem terror ou comédia, sem americano nem japonês', [
    film('yes', { country: 'France' }), film('horror', { genres: ['Drama', 'Horror'], country: 'France' }),
    film('comedy', { genres: ['Drama', 'Comedy'], country: 'France' }), film('us'), film('jp', { country: 'Japan' }),
  ]);
  expect(ids(result)).toEqual(['yes']);
});

test('not only and optional origin are not mistaken for exclusions', () => {
  const films = [film('both', { genres: ['Thriller', 'Sci-Fi'], country: 'Japan' }),
    film('thriller', { genres: ['Thriller'] }), film('scifi', { genres: ['Sci-Fi'], country: 'France' })];
  expect(ids(run('não só suspense, mas também ficção científica', films))).toEqual(['both']);
  expect(ids(run('suspense, não precisa ser americano', films))).toEqual(['both', 'thriller']);
  expect(parseSearchQuery('suspense, não precisa ser americano').lexicalTokens).toEqual([]);
});

test('an excluded alternative can be eliminated without invalidating the remaining one', () => {
  const films = [film('comedy', { genres: ['Comedy'] }), film('drama')];
  expect(ids(run('comédia ou drama, sem comédia', films))).toEqual(['drama']);
  expect(ids(run('romcom ou drama, sem romance', films))).toEqual(['drama']);
});

test.each([
  ['até 1h40', 100], ['até 1 hora e 40 minutos', 100], ['até 2 horas', 120],
  ['menos de 90 minutos', 89], ['até 100 min até 120 min', 100], ['até 120 min até 100 min', 100],
])('duration boundaries are interpreted and intersected: %s', (prompt, maxRuntime) => {
  const result = run(`drama ${prompt}`, [film('yes', { runtime: maxRuntime }), film('long', { runtime: maxRuntime + 1 })]);
  expect(ids(result)).toEqual(['yes']);
  expect(parseSearchQuery(`drama ${prompt}`).lexicalTokens).toEqual([]);
});

test.each(['entre 90 e 120 minutos', 'de 90 a 120 min', 'entre 1h30 e 2h', 'entre 90 minutos e 2 horas'])('duration ranges: %s', prompt => {
  const result = run(`drama ${prompt}`, [film('short', { runtime: 89 }), film('min', { runtime: 90 }),
    film('max', { runtime: 120 }), film('long', { runtime: 121 }), film('unknown', { runtime: 100, runtimeKnown: false })]);
  expect(ids(result)).toEqual(['max', 'min']);
  expect(parseSearchQuery(prompt).constraints).toEqual({ minRuntime: 90, maxRuntime: 120 });
});

test.each(['depois de 1980 a partir de 1990 até 1995 antes de 2000', 'antes de 2000 até 1995 a partir de 1990 depois de 1980'])('year limits never overwrite tighter ones: %s', prompt => {
  expect(parseSearchQuery(prompt).constraints).toEqual({ minYear: 1990, maxYear: 1995 });
  expect(ids(run(`drama ${prompt}`, [film('min', { year: 1990 }), film('max', { year: 1995 }),
    film('old', { year: 1989 }), film('new', { year: 1996 })]))).toEqual(['max', 'min']);
});

test.each([
  ['terror sem terror', /exige e exclui/],
  ['comédia ou drama, sem comédia e drama', /exige e exclui/],
  ['drama brasileiro sem brasileiro', /exige e exclui/],
  ['depois de 2020 antes de 2000', /períodos.*não se cruzam/],
  ['entre 2000 e 1990', /períodos.*não se cruzam/],
  ['mais de 120 min até 90 min', /duração.*não se cruzam/],
  ['entre 120 e 90 minutos', /duração.*não se cruzam/],
  ['até 1h90', /60 ou mais minutos/],
])('contradictions explain the problem without silently relaxing the request: %s', (prompt, message) => {
  const result = run(prompt, [film('tempting', { imdbRating: 10, genres: ['Drama', 'Horror', 'Comedy'], country: 'Brazil' })]);
  expect(result.recommendations).toEqual([]);
  expect(result.notice).toMatch(message);
  expect(result.allowRecentFallback).toBe(false);
});

test('conflicts include the refinement form and keep filters unchanged', () => {
  expect(run('drama até 90 min', [film('x')], { runtimeFilter: 'over-120' }).notice).toMatch(/duração.*não se cruzam/);
  expect(run('drama anos 90', [film('x')], { minYear: 2000 }).notice).toMatch(/períodos.*não se cruzam/);
});

test('OR results still respect watched, feedback and popularity', () => {
  const catalog = createCatalog([film('watched', { genres: ['Thriller'] }), film('rejected', { genres: ['Sci-Fi'] }),
    film('unpopular', { genres: ['Thriller'], imdbVotes: 99 }), film('yes', { genres: ['Sci-Fi'] })]);
  const result = recommend({ profile: { username: 'test', films: [{ title: 'watched', slug: 'watched' }] },
    excludedFilms: [{ title: 'rejected', slug: 'rejected' }], filters: { avoidWatched: true, minVotes: 1000 },
    customPrompt: 'suspense ou ficção científica' }, catalog, FIXED_NOW);
  expect(ids(result)).toEqual(['yes']);
});

test('quoted titles retain punctuation and bypass intent parsing', () => {
  const result = run('“Comédia ou terror, 1984”', [film('title', { title: 'Comédia ou terror, 1984', year: 2001, genres: ['Drama'] })]);
  expect(ids(result)).toEqual(['title']);
});

test.each([
  ['não mais de 120 min', { maxRuntime: 120 }], ['não menos de 90 minutos', { minRuntime: 90 }],
  ['não quero filmes depois de 2000', { maxYear: 2000 }], ['não antes de 1990', { minYear: 1990 }],
])('directly negated comparisons keep their actual meaning: %s', (prompt, constraints) => {
  expect(parseSearchQuery(prompt).constraints).toEqual(constraints);
  expect(parseSearchQuery(prompt).issues).toEqual([]);
});

test.each(['drama sem violência', 'drama sem filmes com violência', 'não quero explosões, suspense'])('unsupported exclusions cannot turn into positive search signals: %s', prompt => {
  const result = run(prompt, [film('violence', { title: 'Violência e explosões', genres: ['Drama', 'Thriller'], pitch: 'violência e explosões' })]);
  expect(result.recommendations).toEqual([]);
  expect(result.notice).toMatch(/Não consigo verificar a exclusão/);
});

test('an excluded decade is explained instead of requiring that decade', () => {
  const result = run('drama sem filmes dos anos 90', [film('x')]);
  expect(result.recommendations).toEqual([]);
  expect(result.notice).toMatch(/excluir um ano ou intervalo/);
});

test.each(['drama anos 90 ou anos 2000', 'drama até 90 min ou mais de 120 min'])('temporal alternatives are identified as unsupported instead of misread as intersections: %s', prompt => {
  const result = run(prompt, [film('x')]);
  expect(result.recommendations).toEqual([]);
  expect(result.notice).toMatch(/períodos ou durações com “ou”/);
});

test('shared time limits surrounding genre alternatives do not become temporal OR', () => {
  const result = run('até 100 min, suspense ou ficção científica, anos 90', [
    film('yes', { genres: ['Sci-Fi'] }), film('old', { genres: ['Thriller'], year: 1980 }),
    film('long', { genres: ['Sci-Fi'], runtime: 101 }),
  ]);
  expect(ids(result)).toEqual(['yes']);
});

test('a consumed temporal negation does not exclude a later genre', () => {
  expect(ids(run('não mais de 120 min, suspense', [film('yes', { genres: ['Thriller'] }), film('drama')]))).toEqual(['yes']);
  expect(ids(run('não depois de 2000 suspense', [film('yes', { genres: ['Thriller'] }), film('drama')]))).toEqual(['yes']);
});

test.each(['suspense ou', 'drama sem'])('incomplete operators request a correction: %s', prompt => {
  const result = run(prompt, [film('x')]);
  expect(result.recommendations).toEqual([]);
  expect(result.notice).toMatch(/incompleta/);
});

test('the application persists the applied OR interpretation and conflict result', async () => {
  const { ctx } = await createTestContext();
  ctx.catalog = async () => createCatalog([film('thriller', { genres: ['Thriller'] }), film('scifi', { genres: ['Sci-Fi'] })]);
  const prompt = 'suspense ou ficção científica, até 1h40';
  const found = await generateRecommendations(ctx, { customPrompt: prompt });
  expect(ids(found)).toEqual(['scifi', 'thriller']);
  let history = await ctx.history.list();
  expect(history[0].customPrompt).toBe(prompt);
  expect(history[0].evaluationContext?.interpretation).toEqual(found.interpretation);
  const conflict = await generateRecommendations(ctx, { customPrompt: 'até 90 min', filters: { runtimeFilter: 'over-120' } });
  expect(conflict.notice).toMatch(/duração.*não se cruzam/);
  history = await ctx.history.list();
  expect(history[0].movies).toEqual([]);
  expect(history[0].evaluationContext?.filters.runtimeFilter).toBe('over-120');
});

test('subject words suggest genres without requiring them', () => {
  const query = parseSearchQuery('amor com assassinato');
  expect(query.themeHints).toEqual([['romance'], ['crime', 'thriller']]);
  expect(query.genres.size).toBe(0);
  expect(query.lexicalTokens).toEqual(['amor', 'assassinato']);
  expect(query.interpretation).toEqual(['Tema: favorecer romance', 'Tema: favorecer crime e suspense']);
  expect(parseSearchQuery('drama sem assassinato').themeHints).toEqual([]);
  // An explicit genre is already a requirement, not a hint.
  expect(parseSearchQuery('romance com assassinato').themeHints).toEqual([['crime', 'thriller']]);
});

test('a romance that is also a crime film ranks above one that is not', () => {
  const pitch = 'Um amor intenso marcado por um assassinato misterioso na cidade grande.';
  const catalog = createCatalog([
    film('only-romance', { genres: ['Romance', 'Drama'], pitch, imdbRating: 8.5 }),
    film('romance-crime', { genres: ['Romance', 'Crime'], pitch, imdbRating: 7 }),
    film('only-crime', { genres: ['Crime'], pitch, imdbRating: 8.5 }),
  ]);
  const result = recommend({ profile: null, customPrompt: 'amor com assassinato' }, catalog, FIXED_NOW);
  expect(result.recommendations[0].catalogSlug).toBe('romance-crime');
});
