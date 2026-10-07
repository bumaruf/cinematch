import { expect, test } from 'vitest';
import { activeFeedback, listFilmFeedback, recordFilmFeedback } from '../../src/application/feedback.ts';
import { toggleSavedFilm } from '../../src/application/library.ts';
import { generateRecommendations, getDailyPick } from '../../src/application/recommendations.ts';
import { discoveryCatalog } from '../fixtures/catalog.ts';
import { createTestContext, FIXED_NOW } from '../helpers.ts';

async function context() {
  const { ctx } = await createTestContext({ profile: { username: 'test', films: [{ title: 'seen', slug: 'seen', rating: 5 }] } });
  ctx.catalog = discoveryCatalog;
  return ctx;
}

test('feedback excludes a film, can be undone, and never edits synchronized history', async () => {
  const ctx = await context();
  const before = await ctx.profiles.get();
  const film = { title: 'bridge-0', slug: 'bridge-0' };
  await recordFilmFeedback(ctx, { film, kind: 'watched', username: 'test' });
  expect((await listFilmFeedback(ctx))[0].film.catalogSlug).toBe('bridge-0');
  expect((await generateRecommendations(ctx, { customPrompt: 'bridge-0' })).recommendations.some((item) => item.letterboxdSlug === 'bridge-0')).toBe(false);
  expect(await ctx.profiles.get()).toEqual(before);
  await recordFilmFeedback(ctx, { film, kind: null });
  expect(await listFilmFeedback(ctx)).toEqual([]);
  expect((await generateRecommendations(ctx, { customPrompt: 'bridge-0' })).recommendations.some((item) => item.letterboxdSlug === 'bridge-0')).toBe(true);
});

test('today-only feedback expires at the São Paulo day boundary', () => {
  const entries = [{ username: 'test', film: { title: 'X' }, kind: 'later' as const, createdAt: '2026-09-17T23:00:00.000Z' }, { username: 'test', film: { title: 'Y' }, kind: 'not-for-me' as const, createdAt: FIXED_NOW.toISOString() }];
  expect(activeFeedback(entries, new Date('2026-09-18T02:59:59Z')).length).toBe(2);
  expect(activeFeedback(entries, new Date('2026-09-18T03:00:00Z')).map((item) => item.film.title)).toEqual(['Y']);
});

test('feedback is isolated by profile and rejects a delayed action from the previous profile', async () => {
  const ctx = await context();
  await recordFilmFeedback(ctx, { film: { title: 'bridge-0', slug: 'bridge-0' }, kind: 'not-for-me' });
  await ctx.profiles.save({ username: 'other', films: [{ title: 'seen', slug: 'seen', rating: 5 }] });
  expect(await ctx.feedback.list('other')).toEqual([]);
  await expect(recordFilmFeedback(ctx, { film: { title: 'bridge-1' }, kind: 'later', username: 'test' })).rejects.toThrow(/perfil foi alterado/);
  expect((await generateRecommendations(ctx, { customPrompt: 'bridge-0' })).recommendations.length).toBeGreaterThan(0);
});

test('dismissing the daily selection invalidates its cached film immediately', async () => {
  const ctx = await context();
  const first = await getDailyPick(ctx);
  await recordFilmFeedback(ctx, { film: first.data.film, kind: 'later' });
  const next = await getDailyPick(ctx);
  expect(next.data.film.letterboxdSlug).not.toBe(first.data.film.letterboxdSlug);
  expect((await getDailyPick(ctx)).data.film.letterboxdSlug).toBe(next.data.film.letterboxdSlug);
});

test('simultaneous saves and feedback retain every independent update', async () => {
  const ctx = await context();
  await Promise.all(Array.from({ length: 20 }, (_, i) => toggleSavedFilm(ctx, { title: `save-${i}`, year: 2000 + i })));
  expect((await ctx.saved.list()).length).toBe(20);
  await Promise.all(Array.from({ length: 20 }, (_, i) => recordFilmFeedback(ctx, { film: { title: `feedback-${i}`, year: 2000 + i }, kind: 'not-for-me' })));
  expect((await ctx.feedback.list('test')).length).toBe(20);
});
