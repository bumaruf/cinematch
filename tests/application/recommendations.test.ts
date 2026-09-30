import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { HistoryEntry } from '../../src/application/ports.ts';
import { generateRecommendations, getDailyPick, getSurprisePick, ProfileChangedError } from '../../src/application/recommendations.ts';
import type { Recommendation, UserProfile } from '../../src/domain/film.ts';
import { DAILY_MATCHING_VERSION, NoDailyCandidateError, profileKey } from '../../src/domain/recommend/daily.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { KEYS } from '../../src/infrastructure/storage/stores.ts';
import { createTestContext, FIXED_NOW, testWithCatalog } from '../helpers.ts';

const catalog = loadCatalog();
const tasteProfile: UserProfile = {
  username: 'taste',
  films: [{ title: 'The Dark Knight', slug: 'the-dark-knight', year: 2008, rating: 5 }],
  favorites: [],
  lastSync: '2026-09-01T00:00:00.000Z',
};
const historyEntry = (i: number, movies: Recommendation[] = []): HistoryEntry => ({
  id: `old_${i}`,
  timestamp: FIXED_NOW.toISOString(),
  theme: `Tema ${i}`,
  customPrompt: '',
  movies,
});

// ---------------------------------------------------------------- generateRecommendations

testWithCatalog('without a theme or a prompt, recommendations come from the general taste', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const result = await generateRecommendations(ctx, {});
  assert.ok(result.recommendations.length > 0);
  assert.equal(result.themeName, 'Recomendação especial');
  for (const film of result.recommendations) {
    assert.ok(film.affinityReason, `${film.title} must be explained by the user's taste`);
    assert.notEqual(film.letterboxdSlug, 'the-dark-knight');
  }
});

testWithCatalog('an incomplete or empty synced history is rejected before recommending', async () => {
  const incomplete = await createTestContext({ profile: { username: 'audit', totalFilms: 10, films: [{ title: 'Alien', slug: 'alien' }] } });
  await assert.rejects(generateRecommendations(incomplete.ctx, { customPrompt: 'terror' }), /Histórico incompleto: 1 de 10/);
  assert.deepEqual(await incomplete.ctx.history.list(), []);
  const empty = await createTestContext({ profile: { username: 'audit', films: [] } });
  await assert.rejects(generateRecommendations(empty.ctx, { customPrompt: 'terror' }), /Não há filmes sincronizados/);
  // The guest profile (nothing saved) can still browse.
  const guest = await createTestContext();
  assert.ok((await generateRecommendations(guest.ctx, { customPrompt: 'terror' })).recommendations.length > 0);
});

test('each generation is appended to the history, which keeps at most 30 entries', async () => {
  const { ctx } = await createTestContext({ initial: { [KEYS.history]: Array.from({ length: 30 }, (_, i) => historyEntry(i)) } });
  const result = await generateRecommendations(ctx, { themeId: 'cyberpunk-neon-noir' });
  const history = await ctx.history.list();
  assert.equal(history.length, 30);
  assert.equal(history[0].id, `rec_${FIXED_NOW.getTime()}`);
  assert.equal(history[0].timestamp, FIXED_NOW.toISOString());
  assert.equal(history[0].theme, result.themeName);
  assert.equal(history[0].customPrompt, '');
  assert.deepEqual(history[0].movies, result.recommendations);
  assert.equal(history[1].id, 'old_0');
});

testWithCatalog('films from the last 20 history batches are kept out of themed results', async () => {
  const first = await createTestContext();
  const baseline = await generateRecommendations(first.ctx, { themeId: 'cyberpunk-neon-noir' });
  const top = baseline.recommendations[0];
  assert.ok(top);

  const recent = await createTestContext({ initial: { [KEYS.history]: [historyEntry(0, [top])] } });
  const withRecent = await generateRecommendations(recent.ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(withRecent.recommendations.length > 0);
  assert.ok(!withRecent.recommendations.some((film) => film.letterboxdSlug === top.letterboxdSlug));

  const older = Array.from({ length: 20 }, (_, i) => historyEntry(i));
  const old = await createTestContext({ initial: { [KEYS.history]: [...older, historyEntry(20, [top])] } });
  const withOld = await generateRecommendations(old.ctx, { themeId: 'cyberpunk-neon-noir' });
  assert.ok(withOld.recommendations.some((film) => film.letterboxdSlug === top.letterboxdSlug), 'the 21st batch is no longer excluded');
});

testWithCatalog('saved settings flow into the filters: minVotes', async () => {
  const { ctx } = await createTestContext();
  await ctx.settings.update({ minVotes: 250000 });
  const result = await generateRecommendations(ctx, { customPrompt: 'ficção' });
  assert.ok(result.recommendations.length > 0);
  for (const film of result.recommendations) {
    assert.ok((catalog.bySlug(film.letterboxdSlug)?.imdbVotes ?? 0) >= 250000, `${film.title} must meet the saved popularity floor`);
  }
});

testWithCatalog('saved settings flow into the filters: avoidWatched, while watched films are still never shown', async () => {
  const profile: UserProfile = { username: 'audit', films: [{ title: 'Alien', slug: 'alien', year: 1979 }] };
  const avoiding = await createTestContext({ profile });
  const avoided = await generateRecommendations(avoiding.ctx, { customPrompt: 'Alien' });
  assert.match(avoided.curatorComment, /excluindo os assistidos/);

  const allowing = await createTestContext({ profile });
  await allowing.ctx.settings.update({ avoidWatched: false });
  const allowed = await generateRecommendations(allowing.ctx, { customPrompt: 'Alien' });
  assert.doesNotMatch(allowed.curatorComment, /excluindo os assistidos/);
  // The application layer is the last line of defense: watched films never reach the UI.
  assert.ok(!allowed.recommendations.some((film) => film.letterboxdSlug === 'alien'));
});

testWithCatalog('per-request filters are applied on top of the saved settings', async () => {
  const { ctx } = await createTestContext();
  const result = await generateRecommendations(ctx, { customPrompt: 'drama', filters: { runtimeFilter: 'under-90', minYear: 1990 } });
  assert.ok(result.recommendations.length > 0);
  for (const film of result.recommendations) {
    assert.ok(film.runtimeMinutes <= 90 && film.year >= 1990, `${film.title} must satisfy the request filters`);
  }
});

// ---------------------------------------------------------------- getDailyPick

testWithCatalog('the daily pick is cached for the same day and profile', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  assert.equal(first.username, 'taste');
  assert.equal(first.profileKey, profileKey(tasteProfile));
  assert.equal(first.data.date, '2026-09-17');
  assert.equal(first.data.matchingVersion, DAILY_MATCHING_VERSION);
  assert.equal(first.data.profileUsername, 'taste');
  const second = await getDailyPick(ctx);
  assert.deepEqual(second, first);
  assert.equal((await ctx.daily.list('taste')).length, 1);
});

testWithCatalog('refresh recomputes the pick and never repeats an earlier one', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  const refreshed = await getDailyPick(ctx, { refresh: true });
  assert.notEqual(refreshed.data.film.letterboxdSlug, first.data.film.letterboxdSlug);
  assert.equal((await ctx.daily.list('taste')).length, 2);
  // The newest pick is the one served from the cache afterwards.
  assert.deepEqual(await getDailyPick(ctx), refreshed);
});

testWithCatalog('a surprise is an alternative and leaves the daily pick unchanged', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const daily = await getDailyPick(ctx);
  const surprise = await getSurprisePick(ctx);
  assert.notEqual(surprise.data.film.letterboxdSlug, daily.data.film.letterboxdSlug);
  assert.equal(surprise.data.kind, 'surprise');
  assert.deepEqual(await getDailyPick(ctx), daily);
});

testWithCatalog('a changed profile recomputes the pick', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  const changed = { ...tasteProfile, lastSync: '2026-09-17T12:00:00.000Z' };
  await ctx.profiles.save(changed);
  const next = await getDailyPick(ctx);
  assert.equal(next.profileKey, profileKey(changed));
  assert.notEqual(next.profileKey, first.profileKey);
  assert.equal((await ctx.daily.list('taste')).length, 2);
  assert.notEqual(next.data.film.letterboxdSlug, first.data.film.letterboxdSlug);
});

testWithCatalog('a cached pick from another day or matching version is not reused', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  const first = await getDailyPick(ctx);
  await ctx.daily.add({ username: 'taste', date: '2026-09-17', data: { ...first.data, matchingVersion: DAILY_MATCHING_VERSION - 1 } });
  const next = await getDailyPick(ctx);
  assert.equal(next.data.matchingVersion, DAILY_MATCHING_VERSION);
  assert.equal((await ctx.daily.list('taste')).length, 3);

  const tomorrow = await createTestContext({ profile: tasteProfile, now: new Date('2026-09-18T15:00:00.000Z') });
  await tomorrow.ctx.daily.add({ username: 'taste', date: first.data.date, data: first.data });
  const nextDay = await getDailyPick(tomorrow.ctx);
  assert.equal(nextDay.data.date, '2026-09-18');
  assert.notEqual(nextDay.data.film.letterboxdSlug, first.data.film.letterboxdSlug, 'earlier picks are excluded');
});

testWithCatalog('a request for another username fails with ProfileChangedError', async () => {
  const { ctx } = await createTestContext({ profile: tasteProfile });
  await assert.rejects(getDailyPick(ctx, { username: 'someone-else' }), ProfileChangedError);
  assert.equal((await getDailyPick(ctx, { username: ' TASTE ' })).username, 'taste');
});

test('a profile without preferences gets NoDailyCandidateError instead of an arbitrary film', async () => {
  const { ctx } = await createTestContext();
  await assert.rejects(getDailyPick(ctx), NoDailyCandidateError);
  assert.deepEqual(await ctx.daily.list('convidado'), []);
});
