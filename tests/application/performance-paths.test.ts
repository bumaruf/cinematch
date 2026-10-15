import { expect, test } from 'vitest';
import { getActiveProfile, getProfileSummary } from '../../src/application/profile.ts';
import { generateRecommendations, getDailyPick, warmUp } from '../../src/application/recommendations.ts';
import { recordFilmFeedback } from '../../src/application/feedback.ts';
import { preparationKey } from '../../src/domain/recommend/prepared.ts';
import type { UserProfile } from '../../src/domain/film.ts';
import { discoveryCatalog } from '../fixtures/catalog.ts';
import { createTestContext } from '../helpers.ts';

const profile: UserProfile = { username: 'perf', films: [{ title: 'seen', slug: 'seen', rating: 5 }, { title: 'known-0', slug: 'known-0', rating: 3 }], favorites: [] };

async function context() {
  const { ctx, kv } = await createTestContext({ profile });
  let catalogCalls = 0;
  const catalog = discoveryCatalog();
  ctx.catalog = async () => { catalogCalls++; return catalog; };
  return { ctx, kv, catalogCalls: () => catalogCalls };
}

test('the profile summary answers without loading the catalog', async () => {
  const { ctx, catalogCalls } = await context();
  const summary = await getProfileSummary(ctx);
  expect(summary).toEqual({ profile: expect.objectContaining({ username: 'perf', filmCount: 2 }), avgRating: 4 });
  expect(summary?.profile).not.toHaveProperty('films');
  expect(catalogCalls()).toBe(0);
});

test('the active profile response leaves the history in the worker', async () => {
  const { ctx } = await context();
  const active = await getActiveProfile(ctx);
  expect(active?.profile).not.toHaveProperty('films');
  expect(active?.analyzed).not.toHaveProperty('watchedList');
  expect(active?.analyzed.topFilms[0]).toEqual({ title: 'seen', year: null, rating: 5, slug: 'seen', isFavorite: false });
  expect(JSON.stringify(active).length).toBeLessThan(5000);
});

test('concurrent daily pick requests compute and store a single pick', async () => {
  const { ctx } = await context();
  const [a, b] = await Promise.all([getDailyPick(ctx), getDailyPick(ctx)]);
  expect(a.data.film.letterboxdSlug).toBe(b.data.film.letterboxdSlug);
  expect(await ctx.daily.list('perf')).toHaveLength(1);
});

test('warming up loads the catalog and returns at once', async () => {
  const { ctx, catalogCalls } = await context();
  expect(warmUp(ctx)).toBeUndefined();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(catalogCalls()).toBeGreaterThan(0);
});

test('the cached profile preparation follows ratings and "Não combina comigo"', async () => {
  const base = preparationKey(profile);
  expect(preparationKey({ ...profile })).toBe(base);
  expect(preparationKey({ ...profile, films: [{ ...profile.films[0], rating: 4 }, profile.films[1]] })).not.toBe(base);
  expect(preparationKey(profile, [{ title: 'known-1', slug: 'known-1' }])).not.toBe(base);

  const { ctx } = await context();
  const first = await generateRecommendations(ctx, {});
  const top = first.recommendations[0];
  await recordFilmFeedback(ctx, { film: top, kind: 'not-for-me' });
  const second = await generateRecommendations(ctx, {});
  expect(second.recommendations.map((film) => film.catalogSlug)).not.toContain(top.catalogSlug);
});
