import type { AppContext } from '../src/application/context.ts';
import type { ArtworkSource, LetterboxdSync } from '../src/application/ports.ts';
import type { UserProfile } from '../src/domain/film.ts';
import { loadCatalog } from '../src/infrastructure/catalog.ts';
import { memoryKeyValueStore } from '../src/infrastructure/storage/key-value.ts';
import {
  dailyPickStore,
  historyStore,
  profileStore,
  savedFilmsStore,
  settingsStore,
} from '../src/infrastructure/storage/stores.ts';
import { test } from 'vitest';

/**
 * The film catalog is derived from IMDb's non-commercial datasets and is not
 * versioned; a fresh clone has an empty stub (npm run catalog:stub). Tests
 * that check recommendations against real films run only with the catalog.
 */
export const catalogAvailable = loadCatalog().films.length > 0;
export const testWithCatalog = test.skipIf(!catalogAvailable);

/** 2026-09-17 at noon in São Paulo. */
export const FIXED_NOW = new Date('2026-09-17T15:00:00.000Z');

export const emptyProfile: UserProfile = { username: 'test', films: [], favorites: [] };

export interface FakeLetterboxd extends LetterboxdSync {
  clearProgressCalls: number;
}

export function fakeLetterboxd(syncBatch?: LetterboxdSync['syncBatch']): FakeLetterboxd {
  const fake: FakeLetterboxd = {
    clearProgressCalls: 0,
    syncBatch: syncBatch ?? (async () => {
      throw new Error('syncBatch não esperado neste teste.');
    }),
    async clearProgress() {
      fake.clearProgressCalls++;
    },
  };
  return fake;
}

export const fakeArtwork: ArtworkSource = { artworkUrl: async () => '' };

export interface TestContextOptions {
  initial?: Record<string, unknown>;
  profile?: UserProfile | null;
  now?: Date | (() => Date);
  letterboxd?: LetterboxdSync;
  artwork?: ArtworkSource;
}

/** A fully in-memory AppContext; every call gets its own storage. */
export async function createTestContext(options: TestContextOptions = {}) {
  const kv = memoryKeyValueStore(options.initial ?? {});
  const nowOption = options.now ?? FIXED_NOW;
  const now = typeof nowOption === 'function' ? nowOption : () => nowOption;
  const clock = { now };
  const ctx: AppContext = {
    catalog: loadCatalog,
    clock,
    profiles: profileStore(kv, clock.now),
    settings: settingsStore(kv),
    history: historyStore(kv),
    saved: savedFilmsStore(kv),
    daily: dailyPickStore(kv),
    letterboxd: options.letterboxd ?? fakeLetterboxd(),
    artwork: options.artwork ?? fakeArtwork,
  };
  if (options.profile) await ctx.profiles.save(options.profile);
  return { ctx, kv };
}
