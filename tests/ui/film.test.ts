import assert from 'node:assert/strict';
import { test } from 'vitest';
import { trailerSearchUrl } from '../../src/ui/shared/film.ts';

test('trailer search identifies the film and asks for the official trailer', () => {
  const url = new URL(
    trailerSearchUrl({
      title: 'Cidade de Deus',
      originalTitle: 'City of God',
      year: 2002,
      director: 'Fernando Meirelles',
    }),
  );

  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.pathname, '/results');
  assert.equal(url.searchParams.get('search_query'), 'City of God 2002 Fernando Meirelles official trailer');
});

test('trailer search falls back to the displayed title when metadata is missing', () => {
  const url = new URL(trailerSearchUrl({ title: 'Parasita' }));
  assert.equal(url.searchParams.get('search_query'), 'Parasita official trailer');
});
