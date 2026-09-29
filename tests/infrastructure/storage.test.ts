import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { HistoryEntry, StoredDailyPick } from '../../src/application/ports.ts';
import type { Recommendation } from '../../src/domain/film.ts';
import { memoryKeyValueStore } from '../../src/infrastructure/storage/key-value.ts';
import {
  dailyPickStore,
  DEFAULT_SETTINGS,
  historyStore,
  KEYS,
  PROFILE_FILMS_LIMIT,
  profileStore,
  removeObsoleteData,
  settingsStore,
} from '../../src/infrastructure/storage/stores.ts';
import { FIXED_NOW } from '../helpers.ts';

const entry = (id: string, theme: string, movies: Partial<Recommendation>[] = []): HistoryEntry => ({
  id,
  timestamp: FIXED_NOW.toISOString(),
  theme,
  customPrompt: '',
  movies: movies as Recommendation[],
});

test('memory key-value store round-trips values and isolates callers from mutations', async () => {
  const kv = memoryKeyValueStore();
  const value = { foo: 'bar', count: 42 };
  await kv.set({ test_key: value });
  value.count = 0;
  const read = await kv.get<{ foo: string; count: number }>('test_key');
  assert.ok(read && read.foo === 'bar' && read.count === 42, 'Storage set/get funciona corretamente');
  await kv.remove('test_key');
  assert.equal(await kv.get('test_key'), undefined);
});

test('history store persists entries, newest first, keeping at most 30', async () => {
  const history = historyStore(memoryKeyValueStore());
  await history.append({
    ...entry('rec_1', 'Cyberpunk & Neo-Noir Chuvoso', [{ title: 'Dark City', year: 1998, letterboxdSlug: 'dark-city' }]),
    customPrompt: 'Filmes com clima de Blade Runner',
  });
  const saved = await history.list();
  assert.ok(saved.length >= 1 && saved[0].theme === 'Cyberpunk & Neo-Noir Chuvoso', 'Histórico de curadoria persistido');
  for (let i = 2; i <= 35; i++) await history.append(entry(`rec_${i}`, `Tema ${i}`));
  const all = await history.list();
  assert.equal(all.length, 30);
  assert.equal(all[0].id, 'rec_35');
});

test('quick-pick history retains multiple choices from the same day', async () => {
  const daily = dailyPickStore(memoryKeyValueStore());
  const username = 'quick-pick-history-test';
  const pick = (slug: string) => ({ date: '2026-09-18', film: { letterboxdSlug: slug } }) as unknown as StoredDailyPick;
  await daily.add({ username, date: '2026-09-18', data: pick('first-choice') });
  await daily.add({ username, date: '2026-09-18', data: pick('second-choice') });
  await daily.add({ username: 'someone-else', date: '2026-09-18', data: pick('other-user') });
  assert.deepEqual(
    (await daily.list(username)).slice(0, 2).map((e) => e.data.film.letterboxdSlug),
    ['second-choice', 'first-choice'],
  );
  assert.equal((await daily.list(username.toUpperCase())).length, 2);
});

test('legacy AI keys and settings are removed without touching other settings', async () => {
  const kv = memoryKeyValueStore({
    lb_curator_api_key: 'sk-old',
    lb_curator_model: 'gpt-4o-mini',
    [KEYS.settings]: { model: 'gpt-4o-mini', engineMode: 'openai', temperature: 0.7, minVotes: 50000 },
    [KEYS.profile]: { username: 'kept', films: [] },
  });
  await removeObsoleteData(kv);
  assert.equal(await kv.get('lb_curator_api_key'), undefined);
  assert.equal(await kv.get('lb_curator_model'), undefined);
  assert.deepEqual(await kv.get(KEYS.settings), { minVotes: 50000 });
  assert.deepEqual(await kv.get(KEYS.profile), { username: 'kept', films: [] });
});

test('settings store returns defaults and merges partial updates', async () => {
  const kv = memoryKeyValueStore();
  const settings = settingsStore(kv);
  assert.deepEqual(await settings.get(), DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, { avoidWatched: true, includeUnderrated: true, minVotes: 0 });
  assert.deepEqual(await settings.update({ minVotes: 1000 }), { ...DEFAULT_SETTINGS, minVotes: 1000 });
  assert.deepEqual(await settingsStore(kv).get(), { ...DEFAULT_SETTINGS, minVotes: 1000 });
  const partial = settingsStore(memoryKeyValueStore({ [KEYS.settings]: { avoidWatched: false } }));
  assert.deepEqual(await partial.get(), { ...DEFAULT_SETTINGS, avoidWatched: false });
});

test('profile store keeps backups on replace and clears everything profile-related', async () => {
  const kv = memoryKeyValueStore();
  const profiles = profileStore(kv, () => FIXED_NOW);
  const first = { username: 'a', films: [] };
  const second = { username: 'b', films: [] };
  await profiles.save(first);
  await profiles.replace(second, first, 'import');
  assert.deepEqual(await profiles.get(), second);
  assert.deepEqual(await kv.get(KEYS.importBackup), { profile: first, savedAt: FIXED_NOW.toISOString() });
  await profiles.replace(first, second, 'repair');
  assert.deepEqual(await kv.get(KEYS.repairBackup), { profile: second, savedAt: FIXED_NOW.toISOString() });
  await kv.set({ [KEYS.syncCheckpoint]: { username: 'a' } });
  await profiles.clear();
  assert.equal(await profiles.get(), null);
  for (const key of [KEYS.syncCheckpoint, KEYS.importBackup, KEYS.repairBackup]) assert.equal(await kv.get(key), undefined);
});

test('profile storage rejects imports that exceed the local safety limit', async () => {
  const profiles = profileStore(memoryKeyValueStore());
  const films = Array.from({ length: PROFILE_FILMS_LIMIT + 1 }, (_, index) => ({ title: `Filme ${index}`, slug: `filme-${index}` }));
  assert.throws(() => profiles.save({ username: 'muito-grande', films, favorites: [] }), /excede o limite local/);
});
