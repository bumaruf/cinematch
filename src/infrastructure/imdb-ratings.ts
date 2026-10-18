import type { RatingsSource, RatingsStore } from '../application/ports.ts';
import { collectRatings, type StoredRatings } from '../domain/catalog/ratings.ts';

/** IMDb's daily ratings file (~8 MB): IMDb id, average rating and votes. */
export const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';

function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Splits a text stream into lines without holding the whole file as a string. */
async function* lines(stream: ReadableStream<string>): AsyncGenerator<string[]> {
  const reader = stream.getReader();
  let rest = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const parts = (rest + value).split('\n');
    rest = parts.pop() ?? '';
    yield parts;
  }
  if (rest) yield [rest];
}

/** Downloads the file from IMDb in the user's browser and keeps the catalog's films. */
export function imdbRatingsSource(request: typeof fetch = (...args) => fetch(...args)): RatingsSource {
  return {
    async download(imdbIds) {
      const response = await request(IMDB_RATINGS_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Não foi possível baixar as notas do IMDb (HTTP ${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // A server may already have decoded the gzip transfer.
      const body = new Blob([bytes]).stream();
      const text = (isGzip(bytes) ? body.pipeThrough(new DecompressionStream('gzip')) : body).pipeThrough(new TextDecoderStream());
      const ratings: Record<string, [number, number]> = {};
      for await (const batch of lines(text)) collectRatings(batch, imdbIds, ratings);
      return ratings;
    },
  };
}

const CACHE_NAME = 'cinematch-imdb-ratings';
// Cache Storage only keys http(s) requests; this address is never fetched.
const CACHE_KEY = 'https://cinematch.invalid/imdb-ratings.json';

function isStoredRatings(value: unknown): value is StoredRatings {
  const candidate = value as StoredRatings | null;
  return typeof candidate?.fetchedAt === 'string' && typeof candidate.ratings === 'object' && candidate.ratings !== null;
}

/**
 * Keeps the ratings in Cache Storage, outside chrome.storage.local's quota,
 * which profiles and their backups already use. The same object is returned
 * until a new download is saved, so the catalog index is rebuilt only then.
 */
export function cacheRatingsStore(storage: CacheStorage = caches): RatingsStore {
  let current: Promise<StoredRatings | null> | undefined;
  return {
    get: () => current ??= (async () => {
      const response = await (await storage.open(CACHE_NAME)).match(CACHE_KEY);
      const value: unknown = response ? await response.json().catch(() => null) : null;
      return isStoredRatings(value) ? value : null;
    })().catch((error: unknown) => {
      current = undefined;
      throw error;
    }),
    async save(ratings) {
      const cache = await storage.open(CACHE_NAME);
      await cache.put(CACHE_KEY, new Response(JSON.stringify(ratings), { headers: { 'Content-Type': 'application/json' } }));
      current = Promise.resolve(ratings);
    },
  };
}

export function memoryRatingsStore(initial: StoredRatings | null = null): RatingsStore {
  let current = initial;
  return {
    get: async () => current,
    async save(ratings) { current = ratings; },
  };
}
