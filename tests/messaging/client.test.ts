import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { send, syncProfileFully } from '../../src/messaging/client.ts';

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

function installRuntime(reply: (message: { action: string; payload: unknown }, index: number) => unknown) {
  const messages: { action: string; payload: unknown }[] = [];
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      id: 'test-extension',
      sendMessage: async (message: { action: string; payload: unknown }) => {
        messages.push(message);
        return reply(message, messages.length - 1);
      },
    },
  };
  return messages;
}

test('page client routes generation through the background worker', async () => {
  const messages = installRuntime(() => ({ ok: true, data: { themeName: 'x', curatorComment: '', recommendations: [], allowRecentFallback: false } }));
  const payload = { customPrompt: 'romance', filters: {} };
  await send('generateRecommendations', payload);
  assert.deepEqual(messages, [{ action: 'generateRecommendations', payload }]);
});

test('client continues batches and only forces restart on the first request', async () => {
  const messages = installRuntime((_message, index) =>
    index === 0
      ? { ok: true, data: { pending: true, collected: 216, totalFilms: 300 } }
      : { ok: true, data: { pending: false, profile: { totalFilms: 300 } } },
  );
  const progress: string[] = [];
  const result = await syncProfileFully('audit', { forceFull: true, onProgress: (message) => progress.push(message) });
  assert.equal(result.profile.totalFilms, 300);
  assert.deepEqual(
    messages.map((m) => (m.payload as { forceFull: boolean }).forceFull),
    [true, false],
  );
  assert.deepEqual(progress, ['216 de 300 filmes coletados…']);
});

test('send rejects with the worker error, or when the worker does not answer', async () => {
  installRuntime(() => ({ ok: false, error: 'Filme inválido.' }));
  await assert.rejects(send('getSettings'), /Filme inválido/);
  installRuntime(() => undefined);
  await assert.rejects(send('getSettings'), /não respondeu/);
});
