import { expect, test } from 'vitest';
import { chromeKeyValueStore, memoryKeyValueStore } from '../../src/infrastructure/storage/key-value.ts';
import { dailyPickStore, historyStore, settingsStore } from '../../src/infrastructure/storage/stores.ts';

test('history, daily selections and independent settings survive concurrent writes', async () => {
  const kv = memoryKeyValueStore();
  const history = historyStore(kv);
  const daily = dailyPickStore(kv);
  const settings = settingsStore(kv);
  await Promise.all(Array.from({ length: 20 }, (_, i) => history.append({ id: String(i), timestamp: '', theme: '', customPrompt: '', movies: [] })));
  expect((await history.list()).length).toBe(20);
  await Promise.all(Array.from({ length: 20 }, (_, i) => daily.add({ username: 'test', date: String(i), data: {} as never })));
  expect((await daily.list('test')).length).toBe(20);
  await Promise.all([settings.update({ avoidWatched: false }), settings.update({ minVotes: 1000 })]);
  expect(await settings.get()).toMatchObject({ avoidWatched: false, minVotes: 1000 });
});

test('separate Chrome adapters serialize updates to the same storage area', async () => {
  let value = 0;
  const area = { get: async () => { const snapshot = value; await Promise.resolve(); return { count: snapshot }; }, set: async (items: Record<string, number>) => { value = items.count; } } as unknown as chrome.storage.StorageArea;
  const first = chromeKeyValueStore(area);
  const second = chromeKeyValueStore(area);
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).update<number>('count', (previous) => (previous ?? 0) + 1)));
  expect(value).toBe(20);
});

test('a failed storage write does not poison subsequent updates', async () => {
  let fail = true;
  let value = 0;
  const area = { get: async () => ({ count: value }), set: async (items: Record<string, number>) => { if (fail) { fail = false; throw new Error('quota'); } value = items.count; } } as unknown as chrome.storage.StorageArea;
  const kv = chromeKeyValueStore(area);
  const results = await Promise.allSettled([kv.update<number>('count', (previous) => (previous ?? 0) + 1), kv.update<number>('count', (previous) => (previous ?? 0) + 1)]);
  expect(results.map((item) => item.status)).toEqual(['rejected', 'fulfilled']);
  expect(value).toBe(1);
});
