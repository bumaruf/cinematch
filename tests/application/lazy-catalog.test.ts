import { expect, test, vi } from 'vitest';
import { getActiveProfile, repairLegacyCsvProfile } from '../../src/application/profile.ts';
import { getSettings, listHistory, listSavedFilms, getPopupSession } from '../../src/application/library.ts';
import { generateRecommendations } from '../../src/application/recommendations.ts';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { createTestContext } from '../helpers.ts';
import { memoryKeyValueStore } from '../../src/infrastructure/storage/key-value.ts';
import { profileAnalysisStore } from '../../src/infrastructure/storage/stores.ts';
import { film } from '../fixtures/catalog.ts';

test('settings, history, empty saved films and an absent profile do not load the catalog', async () => {
  const { ctx } = await createTestContext();
  ctx.catalog = vi.fn(async () => { throw new Error('Unnecessary catalog load'); });
  await getSettings(ctx);
  expect(await listHistory(ctx)).toEqual([]);
  expect(await listSavedFilms(ctx)).toEqual([]);
  expect(await getActiveProfile(ctx)).toBeNull();
  expect(await getPopupSession(ctx)).toBeNull();
  expect(await repairLegacyCsvProfile(ctx)).toBe(false);
  expect(ctx.catalog).not.toHaveBeenCalled();
});

test('a recommendation waits for local data and still blocks watched films', async () => {
  const { ctx } = await createTestContext({ profile: { username: 'test', films: [{ title: 'seen', slug: 'seen' }] } });
  let provide!: (catalog: ReturnType<typeof createCatalog>) => void;
  ctx.catalog = () => new Promise(resolve => { provide = resolve; });
  const result = generateRecommendations(ctx, {});
  await vi.waitFor(() => expect(provide).toBeTypeOf('function'));
  provide(createCatalog([film('seen'), film('new')]));
  expect((await result).recommendations.map(movie => movie.catalogSlug)).toEqual(['new']);
});

test('a restarted worker answers the profile analysis from session storage without the catalog', async () => {
  const profile = { username: 'test', films: [{ title: 'seen', slug: 'seen', rating: 4 }] };
  const session = memoryKeyValueStore();
  const { ctx } = await createTestContext({ profile });
  ctx.profileAnalysis = profileAnalysisStore(session);
  ctx.catalog = async () => createCatalog([film('seen', { genres: ['Drama'] })]);
  const first = await getActiveProfile(ctx);

  ctx.catalog = vi.fn(async () => { throw new Error('Unnecessary catalog load'); });
  expect(await getActiveProfile(ctx)).toEqual(first);
  expect(ctx.catalog).not.toHaveBeenCalled();

  // Any change to the profile computes the analysis again.
  await ctx.profiles.save({ ...profile, films: [...profile.films, { title: 'new', slug: 'new', rating: 5 }] });
  await expect(getActiveProfile(ctx)).rejects.toThrow('Unnecessary catalog load');
});
