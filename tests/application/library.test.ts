import { test } from 'vitest';
import assert from 'node:assert/strict';
import { getFilmArtwork, getPopupSession, getSettings, listSavedFilms, savePopupSession, toggleSavedFilm, updateSettings } from '../../src/application/library.ts';
import { DEFAULT_SETTINGS, KEYS } from '../../src/infrastructure/storage/stores.ts';
import { createTestContext, FIXED_NOW, testWithCatalog } from '../helpers.ts';

test('favoritar um filme salva nos bookmarks e favoritar de novo remove', async () => {
  const { ctx } = await createTestContext();
  const movie = { title: 'Solaris', year: 1972, slug: 'solaris-1972', letterboxdUrl: 'https://letterboxd.com/film/solaris/' };
  const on = await toggleSavedFilm(ctx, movie);
  assert.deepEqual(on, { isSaved: true, totalSaved: 1 });
  assert.equal((await ctx.saved.list())[0].savedAt, FIXED_NOW.toISOString());
  const off = await toggleSavedFilm(ctx, movie);
  assert.deepEqual(off, { isSaved: false, totalSaved: 0 });
  await assert.rejects(toggleSavedFilm(ctx, { title: '' }), /Filme inválido/);
});

test('a legacy saved entry with only `slug` still matches the same film by letterboxdSlug', async () => {
  const { ctx } = await createTestContext({
    initial: { [KEYS.saved]: [{ title: 'Solaris (legacy)', slug: 'solaris', savedAt: '2025-01-01T00:00:00.000Z' }] },
  });
  const result = await toggleSavedFilm(ctx, { title: 'Solaris', year: 1972, letterboxdSlug: 'Solaris' });
  assert.deepEqual(result, { isSaved: false, totalSaved: 0 });
});

testWithCatalog('listing saved films completes poster and metadata from the catalog', async () => {
  const { ctx } = await createTestContext({
    initial: {
      [KEYS.saved]: [
        { title: 'The Empire Strikes Back', year: 1980, slug: 'star-wars-episode-v-the-empire-strikes-back', savedAt: '2025-01-01T00:00:00.000Z' },
      ],
    },
  });
  const [film] = await listSavedFilms(ctx);
  assert.equal(film.posterPath, '/nNAeTmF4CtdSgMDplXTDPOpYzsX.jpg');
  assert.ok(film.director);
  assert.ok(film.genres?.length);
  assert.ok(film.runtimeMinutes);
  assert.match(film.letterboxdUrl ?? '', /^https:\/\/letterboxd\.com\/search\//);
});

test('updateSettings accepts only valid values and getSettings starts from defaults', async () => {
  const { ctx } = await createTestContext();
  assert.deepEqual(await getSettings(ctx), DEFAULT_SETTINGS);
  const updated = await updateSettings(ctx, { avoidWatched: false, minVotes: -5, includeUnderrated: 'yes' as unknown as boolean });
  assert.deepEqual(updated, { ...DEFAULT_SETTINGS, avoidWatched: false });
  assert.deepEqual(await updateSettings(ctx, { minVotes: 5000 }), { ...DEFAULT_SETTINGS, avoidWatched: false, minVotes: 5000 });
});

test('getFilmArtwork delegates to the artwork source', async () => {
  const { ctx } = await createTestContext({ artwork: { artworkUrl: async (slug) => `https://img/${slug}.jpg` } });
  assert.equal(await getFilmArtwork(ctx, 'alien'), 'https://img/alien.jpg');
});

test('the popup session keeps the current list for this browser session', async () => {
  const { ctx } = await createTestContext();
  const session = {
    username: 'test',
    view: 'results' as const,
    prompt: '',
    result: { title: 'Cinema lento', note: 'Uma seleção', films: [{ title: 'Stalker', originalTitle: 'Stalker', year: 1979, director: 'Andrei Tarkovsky', letterboxdSlug: 'stalker', catalogSlug: 'stalker', letterboxdUrl: 'https://letterboxd.com/film/stalker/', posterPath: '', pitch: '', runtimeMinutes: 163, country: 'USSR', genres: [], imdbRating: 8.1, affinityReason: null }] },
  };
  await savePopupSession(ctx, session);
  assert.deepEqual(await getPopupSession(ctx), session);
  const draft = { username: 'test', view: 'home' as const, prompt: 'terror' };
  await savePopupSession(ctx, draft);
  assert.deepEqual(await getPopupSession(ctx), draft);
  await assert.rejects(savePopupSession(ctx, { ...session, result: { ...session.result, title: '' } }), /Resultado inválido/);
});
