import { expect, test } from 'vitest';
import { auditMetadata, mergeVerifiedRuntime, parseBasicsRuntime } from '../../tools/catalog/metadata-audit.js';

test('IMDb verification distinguishes a real 100 minutes from an invented duration', () => {
  const columns = { tconst: 0, runtimeMinutes: 1 };
  expect(parseBasicsRuntime('tt1\t100', columns)).toEqual({ imdbId: 'tt1', runtime: 100 });
  for (const value of ['\\N', '-1', '100abc', '0', '1.5']) expect(parseBasicsRuntime(`tt1\t${value}`, columns).runtime).toBe(0);
  expect(mergeVerifiedRuntime({ imdbId: 'tt1', runtime: 100 }, { imdbId: 'tt1', runtime: 0 })).toMatchObject({ runtime: 0, runtimeKnown: false });
  expect(mergeVerifiedRuntime({ imdbId: 'tt1', runtime: 100 }, { imdbId: 'tt1', runtime: 100 })).toMatchObject({ runtime: 100, runtimeKnown: true });
});

test('verification requires identical IDs and preserves a verified TMDB duration absent from IMDb', () => {
  const film = { imdbId: 'tt1', runtime: 82, metadataSources: { runtime: 'tmdb' } };
  expect(mergeVerifiedRuntime(film, { imdbId: 'tt2', runtime: 120 })).toBe(film);
  expect(mergeVerifiedRuntime(film, { imdbId: 'tt1', runtime: 0 })).toBe(film);
  expect(auditMetadata([film]).unverifiedRuntimes).toBe(0);
});
