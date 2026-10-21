import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { HistoryEntry } from '../../src/application/ports.ts';
import { generateRecommendations, getDailyPick, getSurprisePick, MISSING_RATINGS_NOTICE, ProfileChangedError } from '../../src/application/recommendations.ts';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { withoutRatings } from '../../src/domain/catalog/ratings.ts';
import { memoryRatingsStore } from '../../src/infrastructure/imdb-ratings.ts';
import { recordFilmFeedback } from '../../src/application/feedback.ts';
import type { Recommendation, UserProfile } from '../../src/domain/film.ts';
import { DAILY_MATCHING_VERSION, profileKey } from '../../src/domain/recommend/daily.ts';
import { KEYS } from '../../src/infrastructure/storage/stores.ts';
import { syntheticCatalog, syntheticTasteProfile as tasteProfile } from '../fixtures/synthetic-catalog.ts';
import { createTestContext, FIXED_NOW, type TestContextOptions } from '../helpers.ts';

// The same flows as recommendations.test.ts, on fictional films, so they also
// run in CI without the IMDb catalog.

const catalog = syntheticCatalog();
const context = (options: TestContextOptions = {}) => createTestContext({ catalog, ...options });
const historyEntry = (i: number, movies: Recommendation[] = []): HistoryEntry => ({
  id: `old_${i}`,
  timestamp: FIXED_NOW.toISOString(),
  theme: `Tema ${i}`,
  customPrompt: '',
  movies,
});
const slugs = (films: readonly Recommendation[]) => films.map((film) => film.letterboxdSlug);

// ---------------------------------------------------------------- generateRecommendations

test('synthetic: general recommendations come from the taste and skip watched films', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const result = await generateRecommendations(ctx, {});
  assert.ok(result.recommendations.length > 0);
  assert.equal(result.themeName, 'Recomendação especial');
  assert.ok(!slugs(result.recommendations).includes('obra-favorita'));
  const explained = result.recommendations.filter((film) => film.affinityReason);
  assert.ok(explained.length > 0, 'films by the loved director are explained by the taste');
  for (const film of explained) assert.match(film.affinityReason ?? '', /Obra Favorita/);
});

test('synthetic: a theme returns only films that meet its contract, at most six', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const result = await generateRecommendations(ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.equal(result.recommendations.length, 6);
  for (const slug of slugs(result.recommendations)) assert.match(slug, /^neon-/);
});

test('synthetic: an incomplete or empty synced history is rejected before recommending', async () => {
  const incomplete = await context({ profile: { username: 'audit', totalFilms: 10, films: [{ title: 'Alien', slug: 'alien' }] } });
  await assert.rejects(generateRecommendations(incomplete.ctx, { customPrompt: 'terror' }), /Histórico incompleto: 1 de 10/);
  assert.deepEqual(await incomplete.ctx.history.list(), []);
  const empty = await context({ profile: { username: 'audit', films: [] } });
  await assert.rejects(generateRecommendations(empty.ctx, { customPrompt: 'terror' }), /Não há filmes sincronizados/);
  const guest = await context();
  const browsing = await generateRecommendations(guest.ctx, { customPrompt: 'terror' });
  assert.ok(browsing.recommendations.length > 0);
  for (const film of browsing.recommendations) assert.ok(film.genres.includes('Horror'), `${film.title} must be a horror film`);
});

test('synthetic: films from the last 20 history batches are kept out of themed results', async () => {
  const first = await context();
  const baseline = await generateRecommendations(first.ctx, { themeId: 'cyberpunk-neon-noir' });
  const top = baseline.recommendations[0];
  assert.ok(top);

  const recent = await context({ initial: { [KEYS.history]: [historyEntry(0, [top])] } });
  const withRecent = await generateRecommendations(recent.ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(withRecent.recommendations.length > 0);
  assert.ok(!slugs(withRecent.recommendations).includes(top.letterboxdSlug));

  const older = Array.from({ length: 20 }, (_, i) => historyEntry(i));
  const old = await context({ initial: { [KEYS.history]: [...older, historyEntry(20, [top])] } });
  const withOld = await generateRecommendations(old.ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(slugs(withOld.recommendations).includes(top.letterboxdSlug), 'the 21st batch is no longer excluded');
});

test('synthetic: when every themed film was shown recently, earlier suggestions return with a notice', async () => {
  const shown = catalog.films.filter((film) => film.slug.startsWith('neon-')).map((film) => ({ title: film.title, year: film.year, letterboxdSlug: film.slug }) as Recommendation);
  const { ctx } = await context({ initial: { [KEYS.history]: [historyEntry(0, shown)] } });
  const result = await generateRecommendations(ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(result.recommendations.length > 0);
  assert.equal(result.allowRecentFallback, true);
  assert.match(result.curatorComment, /sugestões anteriores/);
});

test('synthetic: saved settings flow into the filters: minVotes', async () => {
  const { ctx } = await context();
  await ctx.settings.update({ minVotes: 250_000 });
  const result = await generateRecommendations(ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(result.recommendations.length > 0);
  for (const film of result.recommendations) {
    assert.ok((catalog.bySlug(film.letterboxdSlug)?.imdbVotes ?? 0) >= 250_000, `${film.title} must meet the saved popularity floor`);
  }
});

test('synthetic: a per-request minVotes widens one search and leaves the saved setting alone', async () => {
  const { ctx } = await context();
  await ctx.settings.update({ minVotes: 250_000 });
  const widened = await generateRecommendations(ctx, { themeId: 'cyberpunk-neon-noir', filters: { minVotes: 0 } });
  assert.ok(widened.recommendations.some((film) => (catalog.bySlug(film.letterboxdSlug)?.imdbVotes ?? 0) < 250_000));
  assert.equal((await ctx.settings.get()).minVotes, 250_000);
});

test('synthetic: saved settings allow rewatching when avoidWatched is disabled', async () => {
  const profile: UserProfile = { username: 'audit', films: [{ title: 'Alien', slug: 'alien', year: 1979 }] };
  const avoiding = await context({ profile });
  const avoided = await generateRecommendations(avoiding.ctx, { customPrompt: 'Alien' });
  assert.match(avoided.curatorComment, /excluindo os assistidos/);
  assert.ok(!slugs(avoided.recommendations).includes('alien'));

  const allowing = await context({ profile });
  await allowing.ctx.settings.update({ avoidWatched: false });
  const allowed = await generateRecommendations(allowing.ctx, { customPrompt: 'Alien' });
  assert.doesNotMatch(allowed.curatorComment, /excluindo os assistidos/);
  assert.ok(slugs(allowed.recommendations).includes('alien'));
});

test('synthetic: per-request filters are applied on top of the saved settings', async () => {
  const { ctx } = await context();
  const result = await generateRecommendations(ctx, { customPrompt: 'drama', filters: { runtimeFilter: 'under-90', minYear: 1990 } });
  assert.ok(result.recommendations.length > 0);
  for (const film of result.recommendations) {
    assert.ok(film.runtimeMinutes <= 90 && film.year >= 1990, `${film.title} must satisfy the request filters`);
  }
});

test('synthetic: feedback keeps a film out of the next recommendations', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const first = await generateRecommendations(ctx, { customPrompt: 'terror' });
  const target = first.recommendations[0];
  assert.ok(target);
  await recordFilmFeedback(ctx, { film: target, kind: 'not-for-me' });
  const next = await generateRecommendations(ctx, { customPrompt: 'terror' });
  assert.ok(!slugs(next.recommendations).includes(target.letterboxdSlug));
});

test('synthetic: a request for another profile fails with ProfileChangedError', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  await assert.rejects(generateRecommendations(ctx, { username: 'someone-else' }), ProfileChangedError);
});

// ---------------------------------------------------------------- getDailyPick

test('synthetic: the daily pick is a strong taste match, cached for the same day and profile', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  assert.equal(first.username, 'taste');
  assert.equal(first.profileKey, profileKey(tasteProfile));
  assert.equal(first.data.date, '2026-09-17');
  assert.equal(first.data.matchingVersion, DAILY_MATCHING_VERSION);
  assert.match(first.data.film.letterboxdSlug, /^querida-/);
  assert.match(first.data.curatorReason, /Obra Favorita/);
  assert.deepEqual(await getDailyPick(ctx), first);
  assert.equal((await ctx.daily.list('taste')).length, 1);
});

test('synthetic: refresh recomputes the pick and never repeats an earlier one', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  const refreshed = await getDailyPick(ctx, { refresh: true });
  assert.notEqual(refreshed.data.film.letterboxdSlug, first.data.film.letterboxdSlug);
  assert.equal((await ctx.daily.list('taste')).length, 2);
  assert.deepEqual(await getDailyPick(ctx), refreshed);
});

test('synthetic: a surprise is an alternative and leaves the daily pick unchanged', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const daily = await getDailyPick(ctx);
  const surprise = await getSurprisePick(ctx);
  assert.notEqual(surprise.data.film.letterboxdSlug, daily.data.film.letterboxdSlug);
  assert.equal(surprise.data.kind, 'surprise');
  assert.deepEqual(await getDailyPick(ctx), daily);
});

test('synthetic: a changed profile or a new day recomputes the pick', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  const changed = { ...tasteProfile, lastSync: '2026-09-17T12:00:00.000Z' };
  await ctx.profiles.save(changed);
  const next = await getDailyPick(ctx);
  assert.equal(next.profileKey, profileKey(changed));
  assert.notEqual(next.data.film.letterboxdSlug, first.data.film.letterboxdSlug);

  const tomorrow = await context({ profile: tasteProfile, now: new Date('2026-09-18T15:00:00.000Z') });
  await tomorrow.ctx.daily.add({ username: 'taste', date: first.data.date, data: first.data });
  const nextDay = await getDailyPick(tomorrow.ctx);
  assert.equal(nextDay.data.date, '2026-09-18');
  assert.notEqual(nextDay.data.film.letterboxdSlug, first.data.film.letterboxdSlug, 'earlier picks are excluded');
});

test('synthetic: a daily request for another username fails with ProfileChangedError', async () => {
  const { ctx } = await context({ profile: tasteProfile });
  await assert.rejects(getDailyPick(ctx, { username: 'someone-else' }), ProfileChangedError);
  assert.equal((await getDailyPick(ctx, { username: ' TASTE ' })).username, 'taste');
});

test('synthetic: before IMDb ratings are downloaded, the popularity floor is skipped and the user is told why', async () => {
  const unrated = createCatalog(catalog.films.map(withoutRatings));
  const { ctx } = await context({ profile: tasteProfile, catalog: unrated });
  await ctx.settings.update({ minVotes: 50_000 });
  ctx.ratings = { store: memoryRatingsStore(null), source: { download: async () => ({}) } };
  const result = await generateRecommendations(ctx, {});
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.notice.endsWith(MISSING_RATINGS_NOTICE));
  // With ratings in place the saved floor applies again and the notice goes away.
  ctx.ratings.store = memoryRatingsStore({ fetchedAt: FIXED_NOW.toISOString(), ratings: {} });
  const rated = await generateRecommendations(ctx, {});
  assert.equal(rated.recommendations.length, 0);
  assert.ok(!rated.notice.includes(MISSING_RATINGS_NOTICE));
});

test('synthetic: a daily pick chosen before the ratings arrived shows the rating once they exist', async () => {
  const unrated = createCatalog(catalog.films.map(withoutRatings));
  const { ctx } = await context({ profile: tasteProfile, catalog: unrated });
  ctx.ratings = { store: memoryRatingsStore(null), source: { download: async () => ({}) } };
  const first = await getDailyPick(ctx);
  assert.equal(first.data.film.imdbRating, 0);
  // The ratings finished downloading; the catalog now carries them.
  ctx.ratings.store = memoryRatingsStore({ fetchedAt: FIXED_NOW.toISOString(), ratings: {} });
  ctx.catalog = async () => catalog;
  const later = await getDailyPick(ctx);
  assert.equal(later.data.film.letterboxdSlug, first.data.film.letterboxdSlug);
  assert.equal(later.data.film.imdbRating, catalog.bySlug(first.data.film.catalogSlug)?.imdbRating);
  assert.ok(later.data.film.imdbRating > 0);
});
