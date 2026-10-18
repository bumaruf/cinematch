import { gzipSync } from 'node:zlib';
import { expect, test, vi } from 'vitest';
import { cacheRatingsStore, IMDB_RATINGS_URL, imdbRatingsSource } from '../../src/infrastructure/imdb-ratings.ts';

const tsv = ['tconst\taverageRating\tnumVotes', 'tt0000001\t5.7\t2100', 'tt0111161\t9.3\t3000000', 'tt0068646\t9.2\t2100000'].join('\n');

test.each([
  ['gzip file', () => new Uint8Array(gzipSync(tsv))],
  ['already decoded transfer', () => new TextEncoder().encode(tsv)],
])('the ratings file (%s) is read keeping only the catalog films', async (_name, body) => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(body()));
  const ratings = await imdbRatingsSource(request).download(new Set(['tt0111161', 'tt0068646']));
  expect(request).toHaveBeenCalledWith(IMDB_RATINGS_URL, { cache: 'no-store' });
  expect(ratings).toEqual({ tt0111161: [9.3, 3000000], tt0068646: [9.2, 2100000] });
});

test('a failed download is reported', async () => {
  const source = imdbRatingsSource(async () => new Response('', { status: 503 }));
  await expect(source.download(new Set())).rejects.toThrow(/503/);
});

function fakeCaches(): CacheStorage {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, response: Response) => { entries.set(key, response); },
  };
  return { open: async () => cache } as unknown as CacheStorage;
}

test('saved ratings survive a worker restart, and the same object is returned until a new download', async () => {
  const storage = fakeCaches();
  const store = cacheRatingsStore(storage);
  expect(await store.get()).toBeNull();
  const saved = { fetchedAt: '2026-10-18T00:00:00.000Z', ratings: { tt1: [8, 10] as const } };
  await store.save(saved);
  expect(await store.get()).toBe(saved);
  const restarted = cacheRatingsStore(storage);
  const first = await restarted.get();
  expect(first).toEqual(saved);
  expect(await restarted.get()).toBe(first);
});
