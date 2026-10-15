// node --expose-gc tools/diagnostics/performance.ts report.json [private-profile.json] [baseline.json]
// Fixed clock, no network, identical requests on each run. Keep private reports ignored.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { UserProfile } from '../../src/domain/film.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { THEMES_CATALOG } from '../../src/domain/themes/themes.ts';

const started = performance.now();
const { loadCatalog } = await import('../../src/infrastructure/catalog.ts');
const importedMs = performance.now() - started;
const indexedAt = performance.now();
const catalog = loadCatalog();
const indexedMs = performance.now() - indexedAt;
if (!catalog.info.total) throw new Error('Gere o catálogo real antes desta medição.');
const now = new Date('2026-10-12T15:00:00Z');
const profile: UserProfile = process.argv[3] && process.argv[3] !== '-'
  ? JSON.parse(readFileSync(process.argv[3], 'utf8'))
  : { username: 'benchmark', films: catalog.films.slice(0, 936).map((film, i) => ({
    title: film.title, year: film.year, slug: film.slug, rating: [5, 4.5, 3, 2, null][i % 5],
  })) };
const requests = [
  { name: 'general' },
  ...THEMES_CATALOG.map(theme => ({ name: theme.id, themeId: theme.id })),
  ...['comédia', 'suspense ou ficção científica sem terror até 100 minutos', 'memória', '"Harry Potter"', 'depois de 2020 antes de 1990']
    .map(customPrompt => ({ name: customPrompt, customPrompt })),
];
const cases = requests.map(({ name, ...query }) => {
  const samplesMs: number[] = [];
  let result: ReturnType<typeof recommend> | undefined;
  for (let i = 0; i < 3; i++) {
    const at = performance.now();
    result = recommend({ profile, ...query, filters: { avoidWatched: true, minVotes: 0 } }, catalog, now);
    samplesMs.push(Math.round((performance.now() - at) * 10) / 10);
  }
  return { name, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[1], result };
});
globalThis.gc?.();
const report = { catalog: catalog.info, profileSize: profile.films.length,
  importMs: Math.round(importedMs), indexMs: Math.round(indexedMs), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1e6), cases };
if (process.argv[4]) {
  const baseline = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  assert.deepEqual(report.catalog, baseline.catalog, 'Compare the same catalog');
  assert.equal(report.profileSize, baseline.profileSize, 'Compare the same profile');
  assert.deepEqual(cases.map(({ name, result }) => ({ name, result })),
    baseline.cases.map(({ name, result }: { name: string; result: unknown }) => ({ name, result })),
    'Recommendations, ordering, explanations and filter notices must remain unchanged');
  console.log(`Results preserved in all ${cases.length} scenarios.`);
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, cases: cases.map(({ result, ...timing }) => ({ ...timing, count: result?.recommendations.length })) }, null, 2));
