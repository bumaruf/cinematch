import { expect, test, vi } from 'vitest';
import { getRatingsStatus, refreshRatings } from '../../src/application/ratings.ts';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { memoryRatingsStore } from '../../src/infrastructure/imdb-ratings.ts';
import { film } from '../fixtures/catalog.ts';
import { createTestContext, FIXED_NOW } from '../helpers.ts';

async function contextWith(stored: Parameters<typeof memoryRatingsStore>[0] = null) {
  const { ctx } = await createTestContext();
  const catalog = createCatalog([film('a', { imdbId: 'tt1' }), film('b', { imdbId: 'tt2' })]);
  const download = vi.fn(async (ids: ReadonlySet<string>) => Object.fromEntries([...ids].map(id => [id, [7, 100] as const])));
  const store = memoryRatingsStore(stored);
  ctx.catalog = async () => catalog;
  ctx.ratings = { store, source: { download } };
  return { ctx, download, store };
}

test('the first refresh downloads the catalog films and records the date', async () => {
  const { ctx, download } = await contextWith();
  expect(await getRatingsStatus(ctx)).toEqual({ supported: true, fetchedAt: null, rated: 0, stale: true });
  const status = await refreshRatings(ctx);
  expect(download).toHaveBeenCalledExactlyOnceWith(new Set(['tt1', 'tt2']));
  expect(status).toEqual({ supported: true, fetchedAt: FIXED_NOW.toISOString(), rated: 2, stale: false });
});

test('fresh ratings are not downloaded again unless forced, and concurrent refreshes share one download', async () => {
  const { ctx, download } = await contextWith({ fetchedAt: FIXED_NOW.toISOString(), ratings: { tt1: [8, 10] } });
  await refreshRatings(ctx);
  expect(download).not.toHaveBeenCalled();
  await Promise.all([refreshRatings(ctx, { force: true }), refreshRatings(ctx, { force: true })]);
  expect(download).toHaveBeenCalledTimes(1);
});

test('an empty download keeps the previous ratings', async () => {
  const previous = { fetchedAt: '2026-01-01T00:00:00.000Z', ratings: { tt1: [8, 10] as const } };
  const { ctx, store } = await contextWith(previous);
  ctx.ratings!.source.download = async () => ({});
  await expect(refreshRatings(ctx)).rejects.toThrow(/vazio/);
  expect(await store.get()).toBe(previous);
});

test('contexts without a ratings download report it as unsupported', async () => {
  const { ctx } = await createTestContext();
  expect(await refreshRatings(ctx)).toMatchObject({ supported: false });
});
