import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clearProfile, getActiveProfile, importCsvProfile, repairLegacyCsvProfile, syncProfile } from '../../src/application/profile.ts';
import type { UserProfile } from '../../src/domain/film.ts';
import { KEYS } from '../../src/infrastructure/storage/stores.ts';
import { createTestContext, fakeLetterboxd, FIXED_NOW, testWithCatalog } from '../helpers.ts';

const header = 'Date,Name,Year,Letterboxd URI,Rating\n';

test('stored legacy profile is repaired once and its original copy remains available', async () => {
  const original: UserProfile = {
    username: 'audit',
    totalFilms: 2,
    films: [
      { title: 'Obra Única', year: 1910, slug: 'real-id', rating: 3, source: 'films-page' },
      { title: 'Obra Única', year: 1910, slug: 'obra-nica', rating: 5, source: 'csv' },
    ],
  };
  const letterboxd = fakeLetterboxd();
  const { ctx, kv } = await createTestContext({ profile: original, letterboxd });
  assert.equal(await repairLegacyCsvProfile(ctx), true);
  const repaired = await ctx.profiles.get();
  assert.ok(repaired);
  assert.equal(repaired.films.length, 1);
  assert.equal(repaired.totalFilms, 1);
  assert.equal(repaired.csvDuplicatesRemoved, 1);
  assert.equal(repaired.csvIdentityVersion, 2);
  assert.equal(repaired.lastFullSync, null);
  assert.deepEqual((await kv.get<{ profile: UserProfile }>(KEYS.repairBackup))?.profile, original);
  assert.equal(letterboxd.clearProgressCalls, 1);
  // Once repaired, it is not repaired again.
  assert.equal(await repairLegacyCsvProfile(ctx), false);
  assert.deepEqual(await ctx.profiles.get(), repaired);
});

test('repairLegacyCsvProfile does nothing without a legacy csv profile', async () => {
  const empty = await createTestContext();
  assert.equal(await repairLegacyCsvProfile(empty.ctx), false);
  assert.equal(await empty.ctx.profiles.get(), null);
  const web = await createTestContext({ profile: { username: 'web', films: [{ title: 'Alien', slug: 'alien', source: 'films-page' }] } });
  assert.equal(await repairLegacyCsvProfile(web.ctx), false);
  assert.equal(await web.kv.get(KEYS.repairBackup), undefined);
});

test('a failed sync keeps the saved profile', async () => {
  const previous: UserProfile = { username: 'previous', films: [{ title: 'Alien' }], favorites: [] };
  const seen: (UserProfile | null)[] = [];
  const letterboxd = fakeLetterboxd(async (_username, { previous: given }) => {
    seen.push(given);
    throw new Error('Não foi possível carregar o perfil. Os dados anteriores foram preservados.');
  });
  const { ctx } = await createTestContext({ profile: previous, letterboxd });
  await assert.rejects(syncProfile(ctx, { username: 'missing' }), /perfil/);
  assert.deepEqual(await ctx.profiles.get(), previous);
  assert.deepEqual(seen, [previous], 'the saved profile is handed to the sync as `previous`');
  assert.equal(letterboxd.clearProgressCalls, 0);
  await assert.rejects(syncProfile(ctx, { username: '  ' }), /usuário/);
});

test('a pending sync batch does not touch the saved profile; a finished one replaces it', async () => {
  const previous: UserProfile = { username: 'audit', films: [{ title: 'Old' }] };
  const next: UserProfile = { username: 'audit', films: [{ title: 'Alien', slug: 'alien', year: 1979, rating: 5 }], totalFilms: 1 };
  let calls = 0;
  const forceFlags: boolean[] = [];
  const letterboxd = fakeLetterboxd(async (_username, { forceFull }) => {
    forceFlags.push(forceFull);
    return ++calls === 1 ? { pending: true, collected: 10, totalFilms: 20 } : { pending: false, profile: next };
  });
  const { ctx } = await createTestContext({ profile: previous, letterboxd });
  assert.deepEqual(await syncProfile(ctx, { username: 'audit', forceFull: true }), { pending: true, collected: 10, totalFilms: 20 });
  assert.deepEqual(await ctx.profiles.get(), previous);
  const done = await syncProfile(ctx, { username: 'audit' });
  assert.equal(done.pending, false);
  assert.deepEqual(await ctx.profiles.get(), next);
  assert.equal(letterboxd.clearProgressCalls, 1);
  assert.deepEqual(forceFlags, [true, false]);
  assert.ok(!done.pending && done.analyzed.topFilms.some((f) => f.title === 'Alien'));
});

test('importCsvProfile replaces the profile and keeps the previous one under the import backup', async () => {
  const previous: UserProfile = { username: 'audit', films: [{ title: 'Leftover', year: 2001, slug: 'leftover' }], totalFilms: 1 };
  const letterboxd = fakeLetterboxd();
  const { ctx, kv } = await createTestContext({ profile: previous, letterboxd });
  const summary = await importCsvProfile(ctx, [
    { name: 'watched.csv', text: header + '2026-01-01,Alien,1979,https://letterboxd.com/film/alien/,\n2026-01-01,Stalker,1979,https://letterboxd.com/film/stalker/,' },
    { name: 'ratings.csv', text: header + '2026-01-01,Alien,1979,https://letterboxd.com/film/alien/,4.5' },
  ]);
  assert.equal(summary.authoritative, true);
  assert.equal(summary.unmatchedCount, 0);
  const saved = await ctx.profiles.get();
  assert.ok(saved);
  assert.equal(saved.username, 'audit');
  assert.deepEqual(saved.films.map((f) => f.slug).sort(), ['alien', 'stalker']);
  assert.equal(saved.films.find((f) => f.slug === 'alien')?.rating, 4.5);
  assert.equal(saved.totalFilms, 2);
  assert.equal(saved.lastSync, FIXED_NOW.toISOString());
  assert.deepEqual(await kv.get(KEYS.importBackup), { profile: previous, savedAt: FIXED_NOW.toISOString() });
  assert.equal(letterboxd.clearProgressCalls, 1);
  await assert.rejects(importCsvProfile(ctx, []), /CSV/);
  await assert.rejects(importCsvProfile(ctx, [{ name: 'watchlist.csv', text: header }]), /Watchlist/);
});

testWithCatalog('getActiveProfile describes the saved profile; clearProfile removes it', async () => {
  const { ctx } = await createTestContext({ profile: { username: 'audit', films: [{ title: 'Alien', slug: 'alien', year: 1979, rating: 5 }] } });
  const active = await getActiveProfile(ctx);
  assert.ok(active);
  assert.equal(active.analyzed.stats.fiveStarCount, 1);
  assert.equal(active.ratingHistogram.find((b) => b.rating === 5)?.count, 1);
  assert.ok(active.catalogInfo.total >= 9500);
  await clearProfile(ctx);
  assert.equal(await getActiveProfile(ctx), null);
});
