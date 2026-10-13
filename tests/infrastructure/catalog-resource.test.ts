import { gzipSync } from 'node:zlib';
import { expect, test, vi } from 'vitest';
import { createPackagedCatalogLoader } from '../../src/infrastructure/catalog-resource.ts';
import { film } from '../fixtures/catalog.ts';

const url = 'chrome-extension://test/assets/catalog.json.gz';
const data = { films: [film('local', { country: 'Internacional' })], posters: { 'tt-local': '/local.jpg' } };
const compressed = (value: unknown = data) => new Response(new Uint8Array(gzipSync(JSON.stringify(value))));

test('catalog remains unloaded until needed, sharing a single read/index across concurrent requests', async () => {
  let respond!: (response: Response) => void;
  const request = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
  const load = createPackagedCatalogLoader(url, request);
  expect(request).not.toHaveBeenCalled();
  const first = load();
  const concurrent = load();
  expect(first).toBe(concurrent);
  expect(request).toHaveBeenCalledExactlyOnceWith(url);
  respond(compressed());
  const catalog = await first;
  expect(await concurrent).toBe(catalog);
  expect(await load()).toBe(catalog);
  expect(catalog.films[0].country).toBe('');
  expect(catalog.resolve({ imdbId: 'tt-local' }).film?.slug).toBe('local');
  expect(catalog.posterPath('tt-local')).toBe('/local.jpg');
});

test.each([
  ['unavailable file', () => new Response('', { status: 404 })],
  ['truncated gzip', () => new Response(new Uint8Array([31, 139, 8]))],
  ['invalid catalog', () => compressed({ films: null, posters: {} })],
])('a failed load (%s) rejects every waiter and can be retried', async (_name, failed) => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(failed()).mockResolvedValueOnce(compressed());
  const load = createPackagedCatalogLoader(url, request);
  const rejected = await Promise.allSettled([load(), load()]);
  expect(rejected.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect((await load()).info.total).toBe(1);
  expect(request).toHaveBeenCalledTimes(2);
});

test('each worker starts fresh, and the empty development stub is supported', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => compressed({ films: [], posters: {} }));
  const first = createPackagedCatalogLoader(url, request);
  const restarted = createPackagedCatalogLoader(url, request);
  expect((await first()).info.total).toBe(0);
  expect((await restarted()).info.total).toBe(0);
  expect(request).toHaveBeenCalledTimes(2);
});
