import assert from 'node:assert/strict';
import { test } from 'vitest';
import { selectCatalogCandidates, yearlyQuota } from '../../tools/catalog/selection.js';

const film = (id: string, year: number, genres: string[] = ['Drama'], rating = 7, numVotes = 1000) => ({
  tconst: id,
  year,
  genres,
  rating,
  numVotes,
});

test('historical quotas grow with feature-film production', () => {
  assert.equal(yearlyQuota(1895), 10);
  assert.equal(yearlyQuota(1925), 30);
  assert.equal(yearlyQuota(1940), 60);
  assert.equal(yearlyQuota(1970), 100);
  assert.equal(yearlyQuota(1990), 140);
  assert.equal(yearlyQuota(2005), 220);
  assert.equal(yearlyQuota(2015), 300);
  assert.equal(yearlyQuota(2026), 320);
});

test('selection protects older years from recent blockbuster vote totals', () => {
  const movies = [
    ...Array.from({ length: 20 }, (_, index) => film(`old-${index}`, 1900, ['Drama'], 6.5 + index / 100, 500 + index)),
    ...Array.from({ length: 30 }, (_, index) => film(`new-${index}`, 2020, ['Action'], 8, 1_000_000 + index)),
  ];
  const selected = selectCatalogCandidates(movies, 20, 2026);
  assert.equal(selected.filter((movie) => movie.year === 1900).length, 10);
  assert.equal(new Set(selected.map((movie) => movie.tconst)).size, selected.length);
});

test('selection is deterministic and respects the requested limit', () => {
  const movies = Array.from({ length: 100 }, (_, index) => film(`film-${index}`, 1980 + (index % 40), index % 3 ? ['Drama'] : ['Animation'], 6 + (index % 20) / 10, 500 + index * 10));
  const first = selectCatalogCandidates(movies, 50, 2026).map((movie) => movie.tconst);
  const second = selectCatalogCandidates([...movies].reverse(), 50, 2026).map((movie) => movie.tconst);
  assert.equal(first.length, 50);
  assert.deepEqual(first, second);
});
