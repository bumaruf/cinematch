import { test } from 'vitest';
import assert from 'node:assert/strict';
import { syncProfile } from '../../src/application/profile.ts';
import type { SyncCheckpoint } from '../../src/application/ports.ts';
import type { UserProfile } from '../../src/domain/film.ts';
import { LetterboxdBlockedError, type PageFetcher } from '../../src/infrastructure/letterboxd/http.ts';
import { createLetterboxdSync } from '../../src/infrastructure/letterboxd/sync.ts';
import { memoryKeyValueStore } from '../../src/infrastructure/storage/key-value.ts';
import { KEYS, syncCheckpointStore } from '../../src/infrastructure/storage/stores.ts';
import { createTestContext, FIXED_NOW } from '../helpers.ts';

const profile = (count: number) => `<h1 class="person-display-name">Audit</h1><a href="/audit/films/"><span>${count}</span></a>`;
const film = (id: number, rating = 8) =>
  `<li class="griditem"><div data-item-slug="film-${id}" data-item-name="Film ${id} (2000)"><span class="rated-${rating}"></span></div></li>`;
const noSleep = async () => {};
const nowMs = () => FIXED_NOW.getTime();

/** An AppContext whose Letterboxd sync is the real one, over a fake network. */
async function syncContext(fetchPage: PageFetcher, { previous = null as UserProfile | null, initial = {} as Record<string, unknown> } = {}) {
  const kv = memoryKeyValueStore(initial);
  const checkpoints = syncCheckpointStore(kv);
  const letterboxd = createLetterboxdSync({ fetchPage, checkpoints, now: nowMs, sleep: noSleep });
  const { ctx } = await createTestContext({ letterboxd, profile: previous });
  return { ctx, kv };
}

async function finished(result: Awaited<ReturnType<typeof syncProfile>>) {
  assert.equal(result.pending, false);
  if (result.pending) throw new Error('unreachable');
  return result.profile;
}

test('10,080 films finish across durable batches; later page interruption resumes without losing the old profile', async () => {
  const old: UserProfile = { username: 'audit', films: [{ slug: 'old', title: 'Old' }], totalFilms: 1 };
  let fail = true;
  const visited: number[] = [];
  const fetchPage: PageFetcher = async (url) => {
    if (url.endsWith('/audit/')) return profile(10080);
    if (url.includes('/rss/')) return '<rss></rss>';
    if (url.includes('/year/')) return '';
    const page = Number(url.match(/page\/(\d+)/)?.[1] || 1);
    visited.push(page);
    if (page === 4 && fail) throw new Error('HTTP 403');
    return Array.from({ length: 72 }, (_, i) => film((page - 1) * 72 + i)).join('');
  };
  const { ctx } = await syncContext(fetchPage, { previous: old });
  const first = await syncProfile(ctx, { username: 'audit' });
  assert.equal(first.pending, true);
  assert.equal(first.pending && first.collected, 216);
  await assert.rejects(syncProfile(ctx, { username: 'audit' }), /403/);
  assert.deepEqual(await ctx.profiles.get(), old);
  fail = false;
  let result;
  do {
    result = await syncProfile(ctx, { username: 'audit' });
  } while (result.pending);
  const synced = await finished(result);
  assert.equal(synced.films.length, 10080);
  assert.equal(synced.syncMode, 'full');
  assert.equal(visited.filter((p) => p === 1).length, 1);
  assert.equal(new Set(synced.films.map((f) => f.slug)).size, 10080);
  assert.deepEqual(await ctx.profiles.get(), synced);
});

test('incremental update merges newly watched films and current ratings, preserving full-review date', async () => {
  const lastFullSync = FIXED_NOW.toISOString();
  const { ctx } = await syncContext(
    async (url) => {
      if (url.endsWith('/audit/')) return profile(2);
      if (url.includes('/rss/')) return '<rss></rss>';
      if (url.endsWith('/films/')) return film(1, 10) + film(2);
      throw new Error(`Unexpected URL: ${url}`);
    },
    { previous: { username: 'audit', totalFilms: 1, lastFullSync, films: [{ slug: 'film-1', title: 'Film 1', year: 2000, rating: 2 }] } },
  );
  const result = await finished(await syncProfile(ctx, { username: 'audit' }));
  assert.equal(result.syncMode, 'recent');
  assert.equal(result.films.length, 2);
  assert.equal(result.films.find((f) => f.slug === 'film-1')?.rating, 5);
  assert.equal(result.lastFullSync, lastFullSync);
});

test('weekly review and explicit full review refresh old ratings and remove absent films', async () => {
  for (const forceFull of [false, true]) {
    const { ctx } = await syncContext(
      async (url) => {
        if (url.endsWith('/audit/')) return profile(1);
        if (url.endsWith('/films/')) return film(1, 4);
        return '<rss></rss>';
      },
      {
        previous: {
          username: 'audit',
          totalFilms: 2,
          lastFullSync: new Date(nowMs() - (forceFull ? 0 : 8 * 86400000)).toISOString(),
          films: [{ slug: 'film-1', title: 'Film 1', rating: 5 }, { slug: 'film-2', title: 'Film 2' }],
        },
      },
    );
    const result = await finished(await syncProfile(ctx, { username: 'audit', forceFull }));
    assert.equal(result.syncMode, 'full');
    assert.equal(result.films.length, 1);
    assert.equal(result.films[0].rating, 2);
  }
});

test('changed count invalidates a checkpoint and restarts collection', async () => {
  const stale: SyncCheckpoint = {
    username: 'audit',
    totalFilms: 100,
    startedAt: nowMs(),
    nextPage: 4,
    collectedSlugs: ['stale'],
    films: [{ slug: 'stale', title: 'Stale' }],
  };
  const { ctx } = await syncContext(
    async (url) => {
      if (url.endsWith('/audit/')) return profile(1);
      if (url.endsWith('/films/')) return film(1);
      return '<rss></rss>';
    },
    { initial: { [KEYS.syncCheckpoint]: stale } },
  );
  const result = await finished(await syncProfile(ctx, { username: 'audit' }));
  assert.deepEqual(result.films.map((f) => f.slug), ['film-1']);
});

test('a transient network failure retries and incomplete incremental coverage falls back to full collection', async () => {
  let attempts = 0;
  const { ctx } = await syncContext(
    async (url) => {
      if (url.endsWith('/audit/')) {
        if (++attempts === 1) throw new Error('Failed to fetch');
        return profile(3);
      }
      if (url.endsWith('/films/')) return film(1) + film(2);
      if (url.includes('/page/2/')) return film(3);
      return '<rss></rss>';
    },
    { previous: { username: 'audit', totalFilms: 1, lastFullSync: FIXED_NOW.toISOString(), films: [{ slug: 'film-1', title: 'Film 1' }] } },
  );
  const result = await finished(await syncProfile(ctx, { username: 'audit' }));
  assert.equal(result.syncMode, 'full');
  assert.equal(result.films.length, 3);
  assert.ok(attempts >= 2);
});

test('createLetterboxdSync retries a plain Error at most twice, with backoff through the injected sleep', async () => {
  const kv = memoryKeyValueStore();
  let calls = 0;
  const sleeps: number[] = [];
  const sync = createLetterboxdSync({
    fetchPage: async () => {
      calls++;
      throw new Error('Failed to fetch');
    },
    checkpoints: syncCheckpointStore(kv),
    now: nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await assert.rejects(sync.syncBatch('audit', { previous: null, forceFull: false, onProgress: () => {} }), /Failed to fetch/);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('createLetterboxdSync does not retry when Letterboxd blocks the request', async () => {
  const kv = memoryKeyValueStore();
  let calls = 0;
  const sleeps: number[] = [];
  const sync = createLetterboxdSync({
    fetchPage: async () => {
      calls++;
      throw new LetterboxdBlockedError();
    },
    checkpoints: syncCheckpointStore(kv),
    now: nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await assert.rejects(sync.syncBatch('audit', { previous: null, forceFull: false, onProgress: () => {} }), /bloqueou/);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test('clearProgress drops the saved checkpoint', async () => {
  const kv = memoryKeyValueStore({ [KEYS.syncCheckpoint]: { username: 'audit' } });
  const sync = createLetterboxdSync({ fetchPage: async () => '', checkpoints: syncCheckpointStore(kv), now: nowMs, sleep: noSleep });
  await sync.clearProgress();
  assert.equal(await kv.get(KEYS.syncCheckpoint), undefined);
});
