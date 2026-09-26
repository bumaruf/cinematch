import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeGenres } from '../../src/domain/catalog/genres.ts';
import { getThemeById, getThemeCriteria, searchThemes, THEMES_CATALOG } from '../../src/domain/themes/themes.ts';
import { createTasteMatcher } from '../../src/domain/taste/taste-match.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { emptyProfile, testWithCatalog } from '../helpers.ts';

const catalog = loadCatalog();

test('catálogo de temas: contagem, busca por ID e busca por palavra-chave', () => {
  assert.ok(THEMES_CATALOG.length >= 15, `Catálogo contém ${THEMES_CATALOG.length} temas cadastrados`);
  const cyberpunkTheme = getThemeById('cyberpunk-neon-noir');
  assert.ok(cyberpunkTheme && cyberpunkTheme.title.includes('Cyberpunk'), 'Recuperação de tema por ID');
  assert.ok(!('criteria' in (cyberpunkTheme ?? {})), 'getThemeById no longer carries criteria');
  assert.ok(getThemeCriteria('cyberpunk-neon-noir'), 'criteria come from getThemeCriteria');

  const searchResults = searchThemes('melancolia');
  assert.ok(
    searchResults.length > 0 && searchResults.some((t) => t.title.includes('Melancolia') || t.vibe.includes('melancolia')),
    'Busca por palavra-chave em temas',
  );
});

testWithCatalog('catalog access normalizes mixed genres without mutating the downloaded source', () => {
  assert.ok(catalog.info.total >= 9500);
  assert.deepEqual(normalizeGenres(['Ação', 'Comédia Dramática', 'Sci-Fi']), ['Action', 'Comedy', 'Drama', 'Sci-Fi']);
});

test('catalog poster mapping includes The Empire Strikes Back', () => {
  assert.equal(catalog.posterPath('tt0080684'), '/nNAeTmF4CtdSgMDplXTDPOpYzsX.jpg');
});

const tasteProfile = { ...emptyProfile, films: [{ title: 'The Dark Knight', slug: 'the-dark-knight', year: 2008, rating: 5 }] };

testWithCatalog('generic action tags never establish affinity for KGF, Pushpa or Black Friday', () => {
  const match = createTasteMatcher(tasteProfile, catalog);
  for (const slug of ['k-g-f-chapter-2', 'pushpa-the-rise-part-1', 'black-friday']) {
    const film = catalog.bySlug(slug);
    assert.ok(film);
    assert.equal(match(film).eligible, false);
  }
  const kgf = catalog.bySlug('k-g-f-chapter-2');
  assert.ok(kgf);
  const fan = createTasteMatcher({ films: [{ title: 'K.G.F: Chapter 1', slug: 'k-g-f-chapter-1', rating: 5 }] }, catalog);
  assert.equal(fan(kgf).eligible, true);
  const disliked = createTasteMatcher({ films: [{ title: 'K.G.F: Chapter 1', slug: 'k-g-f-chapter-1', rating: 1 }] }, catalog);
  assert.equal(disliked(kgf).eligible, false);
});
