import { afterEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import type { SyncProgress } from '../../src/application/ports.ts';
import { listen } from '../../src/background/composition.ts';
import { createHandlers, type Platform } from '../../src/background/router.ts';
import type { UserProfile } from '../../src/domain/film.ts';
import { fetchLetterboxdPage } from '../../src/infrastructure/letterboxd/http.ts';
import { createLetterboxdSync } from '../../src/infrastructure/letterboxd/sync.ts';
import { memoryKeyValueStore } from '../../src/infrastructure/storage/key-value.ts';
import { DEFAULT_SETTINGS, syncCheckpointStore } from '../../src/infrastructure/storage/stores.ts';
import { isRequestMessage, type ResponseMessage } from '../../src/messaging/contract.ts';
import { createTestContext, FIXED_NOW } from '../helpers.ts';

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
  vi.restoreAllMocks();
});

function fakePlatform() {
  const events = { progress: [] as SyncProgress[], dashboards: [] as (string | undefined)[], exclusive: 0 };
  const platform: Platform = {
    broadcastProgress: (progress) => events.progress.push(progress),
    openDashboard: async (hash) => {
      events.dashboards.push(hash);
    },
    exclusiveSync: (fn) => {
      events.exclusive++;
      return fn();
    },
  };
  return { platform, events };
}

type Listener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean;

/** Installs a fake chrome.runtime.onMessage and returns a sender for it. */
function installRuntime() {
  let listener: Listener | undefined;
  (globalThis as { chrome?: unknown }).chrome = { runtime: { onMessage: { addListener: (fn: Listener) => (listener = fn) } } };
  return (message: unknown) =>
    new Promise<{ handled: boolean; response?: ResponseMessage }>((resolve) => {
      assert.ok(listener, 'listen() registered a listener');
      const handled = listener(message, {}, (response) => resolve({ handled, response: response as ResponseMessage }));
      if (!handled) resolve({ handled });
    });
}

test('background preserves the saved profile on sync failure', async () => {
  const previous: UserProfile = { username: 'previous', films: [{ title: 'Alien' }], favorites: [] };
  const fetch404 = (async () => ({ status: 404, ok: false, text: async () => '' })) as unknown as typeof fetch;
  const kv = memoryKeyValueStore();
  const letterboxd = createLetterboxdSync({
    fetchPage: (url) => fetchLetterboxdPage(url, fetch404),
    checkpoints: syncCheckpointStore(kv),
    now: () => FIXED_NOW.getTime(),
    sleep: async () => {},
  });
  const { ctx } = await createTestContext({ profile: previous, letterboxd });
  const { platform, events } = fakePlatform();
  const send = installRuntime();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  listen(createHandlers(ctx, platform));

  const response = await send({ action: 'syncProfile', payload: { username: 'missing' } });
  assert.equal(response.handled, true);
  assert.equal(response.response?.ok, false);
  assert.match(!response.response?.ok ? response.response?.error ?? '' : '', /perfil/);
  assert.deepEqual(await ctx.profiles.get(), previous);
  assert.equal(events.exclusive, 1, 'syncs run under the exclusive lock');

  // Unknown (and removed) actions are not request messages and get no answer.
  assert.equal(isRequestMessage({ action: 'TEST_API_KEY', payload: {} }), false);
  assert.equal((await send({ action: 'TEST_API_KEY', payload: {} })).handled, false);
});

test('listen wraps handler results as { ok: true, data } and failures as { ok: false, error }', async () => {
  const { ctx } = await createTestContext();
  const { platform, events } = fakePlatform();
  const send = installRuntime();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  listen(createHandlers(ctx, platform));

  assert.deepEqual(await send({ action: 'getSettings' }), { handled: true, response: { ok: true, data: DEFAULT_SETTINGS } });
  assert.deepEqual(await send({ action: 'toggleSavedFilm', payload: {} }), { handled: true, response: { ok: false, error: 'Filme inválido.' } });
  assert.deepEqual(await send({ action: 'getActiveProfile' }), { handled: true, response: { ok: true, data: null } });
  assert.deepEqual(await send({ action: 'openDashboard', payload: { hash: 'saved' } }), { handled: true, response: { ok: true, data: undefined } });
  assert.deepEqual(events.dashboards, ['saved']);
});

test('isRequestMessage rejects malformed and unknown messages', () => {
  assert.equal(isRequestMessage(null), false);
  assert.equal(isRequestMessage('getSettings'), false);
  assert.equal(isRequestMessage({}), false);
  assert.equal(isRequestMessage({ action: 'SYNC_USER_PROFILE' }), false);
  assert.equal(isRequestMessage({ event: 'syncProgress', progress: { message: 'x' } }), false);
  assert.equal(isRequestMessage({ action: 'getSettings' }), true);
});
