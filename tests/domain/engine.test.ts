import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { UserProfile } from '../../src/domain/film.ts';
import { recommend, type RecommendationRequest } from '../../src/domain/recommend/engine.ts';
import { passesConstraints } from '../../src/domain/recommend/filters.ts';
import { getThemeById, getThemeCriteria, THEMES_CATALOG } from '../../src/domain/themes/themes.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { emptyProfile, FIXED_NOW, testWithCatalog } from '../helpers.ts';

const catalog = loadCatalog();
const run = (request: RecommendationRequest) => recommend(request, catalog, FIXED_NOW);
const catalogFilm = (slug: string) => catalog.films.find((film) => film.slug === slug);

const mockRawProfile: UserProfile = {
  username: 'cinephile99',
  displayName: 'Amante da Sétima Arte',
  favorites: [
    { title: 'Blade Runner 2049', slug: 'blade-runner-2049', isFavorite: true },
    { title: 'In the Mood for Love', slug: 'in-the-mood-for-love', isFavorite: true },
  ],
  films: [
    { title: 'Blade Runner 2049', year: 2017, rating: 5.0, slug: 'blade-runner-2049', isFavorite: true },
    { title: 'In the Mood for Love', year: 2000, rating: 5.0, slug: 'in-the-mood-for-love', isFavorite: true },
    { title: 'Stalker', year: 1979, rating: 5.0, slug: 'stalker' },
    { title: 'Yi Yi', year: 2000, rating: 4.5, slug: 'yi-yi' },
    { title: 'Memoria', year: 2021, rating: 4.5, slug: 'memoria' },
    { title: 'Generic Action', year: 2022, rating: 1.5, slug: 'generic-action' },
  ],
  totalFilms: 450,
};

testWithCatalog('motor local: temas, filtro de duração, busca livre e máfia italiana', () => {
  const localResult = run({ profile: mockRawProfile, themeId: 'cyberpunk-neon-noir', customPrompt: '', filters: {} });
  assert.ok(localResult.recommendations.length > 0, 'Motor local gerou recomendações com sucesso');
  const hasWatched = localResult.recommendations.some((r) => r.title === 'Blade Runner 2049' || r.title === 'Stalker');
  assert.ok(!hasWatched, 'Motor local nunca recomenda filmes já assistidos');

  const over120Result = run({ profile: mockRawProfile, themeId: 'cyberpunk-neon-noir', customPrompt: '', filters: { runtimeFilter: 'over-120' } });
  assert.ok(over120Result.recommendations.length > 0, 'Motor local gerou recomendações com filtro de 2h+ (over-120)');
  assert.ok(
    over120Result.recommendations.every((r) => (r.runtimeMinutes ?? 0) >= 118),
    'Todos os filmes recomendados no filtro de 2h+ possuem mais de 120 minutos',
  );

  const romanceResult = run({ profile: mockRawProfile, themeId: getThemeById('poetic-romance-fleeting-encounters')?.id, customPrompt: '', filters: {} });
  assert.ok(romanceResult.recommendations.length > 0, 'Motor local gera filmes ao clicar no tema Romance Efêmero');

  const romanceSearchResult = run({ profile: mockRawProfile, themeId: null, customPrompt: 'romance', filters: {} });
  assert.ok(romanceSearchResult.recommendations.length > 0, 'Motor local gera filmes ao buscar "romance" na busca livre');

  const mafiaResult = run({ profile: mockRawProfile, themeId: null, customPrompt: 'mafia italiana', filters: {} });
  assert.ok(mafiaResult.recommendations.length > 0, 'Motor local encontra filmes de máfia italiana');
  const mafiaTitles = mafiaResult.recommendations.map((r) => r.title);
  assert.ok(
    mafiaTitles.some(
      (t) => t.includes('Chefão') || t.includes('Gomorra') || t.includes('Companheiros') || t.includes('Suburra') || t.includes('Traidor') || t.includes('América'),
    ),
    'Filmes de máfia clássicos/italianos incluídos',
  );
});

test('recommendation items expose genres and affinityReason instead of the removed LLM fields', () => {
  const result = run({ profile: mockRawProfile, themeId: 'cyberpunk-neon-noir' });
  for (const item of result.recommendations) {
    assert.ok(Array.isArray(item.genres));
    assert.ok('affinityReason' in item);
    for (const removed of ['connectedToUserFavorites', 'matchScore', 'vibeKeywords', 'modelUsed', 'tokensUsed', 'profileStats']) {
      assert.ok(!(removed in item), `${removed} should no longer be present`);
    }
  }
});

test('all runtime boundaries, missing runtimes, and year constraints are enforced', () => {
  for (const [filter, low, high] of [
    ['under-60', 1, 60],
    ['under-90', 1, 90],
    ['under-105', 1, 105],
    ['under-120', 1, 120],
    ['90-120', 90, 120],
    ['over-120', 120, 500],
    ['over-150', 150, 500],
  ] as const) {
    assert.equal(passesConstraints({ runtime: low }, { runtimeFilter: filter }), true);
    assert.equal(passesConstraints({ runtime: low - 1 }, { runtimeFilter: filter }), false);
    assert.equal(passesConstraints({}, { runtimeFilter: filter }), false);
    if (high < 500) assert.equal(passesConstraints({ runtime: high + 1 }, { runtimeFilter: filter }), false);
  }
  assert.equal(passesConstraints({ year: 1980 }, { minYear: 1990 }), false);
  assert.equal(passesConstraints({ year: 2020 }, { maxYear: 2010 }), false);
  assert.equal(passesConstraints({}, { minYear: 1990 }), false);
});

testWithCatalog('local engine honors the watched preference and enforces duration', () => {
  const input: RecommendationRequest = {
    profile: { ...emptyProfile, films: [{ title: 'Alien', slug: 'alien', year: 1979 }] },
    customPrompt: 'Alien',
    filters: { avoidWatched: true },
  };
  const result = run(input);
  assert.ok(!result.recommendations.some((f) => f.letterboxdSlug === 'alien'));
  const allowed = run({ ...input, filters: { avoidWatched: false } });
  assert.ok(allowed.recommendations.some((f) => f.letterboxdSlug === 'alien'));
  const short = run({ profile: emptyProfile, filters: { runtimeFilter: 'under-90' } });
  assert.ok(short.recommendations.length > 0);
  assert.ok(short.recommendations.every((f) => f.runtimeMinutes <= 90));
});

test('local engine excludes films recommended in recent themed sessions', () => {
  const result = run({
    profile: emptyProfile,
    themeId: 'slow-cinema-contemplative',
    filters: { excludeRecent: [{ title: 'Stalker', year: 1979, letterboxdSlug: 'stalker' }] },
  });
  assert.ok(!result.recommendations.some((film) => film.letterboxdSlug === 'stalker'));
});

testWithCatalog('themed fallback reuses unwatched recent suggestions before returning an empty list', () => {
  const result = run({
    profile: emptyProfile,
    themeId: getThemeById('slow-cinema-contemplative')?.id,
    filters: { excludeRecent: [...catalog.films] },
  });
  assert.ok(result.recommendations.length > 0);
  assert.equal(result.allowRecentFallback, true);
  assert.match(result.curatorComment, /sugestões anteriores/);
});

testWithCatalog('explicit searches return unwatched films even when they appeared in a prior recommendation', () => {
  const result = run({
    profile: {
      ...emptyProfile,
      films: [
        { title: 'Capitã Marvel', year: 2019, slug: 'captain-marvel' },
        { title: 'As Marvels', year: 2023, slug: 'the-marvels' },
        { title: 'Pantera Negra: Wakanda para Sempre', year: 2022, slug: 'black-panther-wakanda-forever' },
      ],
    },
    customPrompt: 'pantera negra',
    filters: { excludeRecent: [{ title: 'Pantera Negra', year: 2018, letterboxdSlug: 'black-panther' }] },
  });
  assert.ok(result.recommendations.some((film) => film.letterboxdSlug === 'black-panther'));
});

testWithCatalog('franchise search recognizes Black Panther as Marvel and ignores incidental word fragments', () => {
  const result = run({ profile: emptyProfile, customPrompt: 'marvel' });
  const titles = result.recommendations.map((film) => film.title);
  assert.ok(titles.some((title) => /Vingadores|Homem-Aranha|Guardiões|Quarteto Fantástico|Capitã Marvel|Pantera Negra/.test(title)));
  assert.ok(!titles.includes('O Homem Elefante'));
});

testWithCatalog('terror search is constrained to the Horror genre, not incidental title matches', () => {
  const result = run({ profile: emptyProfile, customPrompt: 'terror' });
  assert.ok(result.recommendations.length > 0);
  for (const recommendation of result.recommendations) {
    assert.ok(catalogFilm(recommendation.letterboxdSlug)?.genres.includes('Horror'), `${recommendation.title} must be Horror`);
  }
});

testWithCatalog('Portuguese ficção search maps to the catalog Sci-Fi genre', () => {
  const result = run({ profile: emptyProfile, customPrompt: 'ficção' });
  assert.ok(result.recommendations.length > 0);
  for (const recommendation of result.recommendations) {
    assert.ok(catalogFilm(recommendation.letterboxdSlug)?.genres.includes('Sci-Fi'), `${recommendation.title} must be Sci-Fi`);
  }
});

testWithCatalog('minimum popularity setting filters local recommendations by vote count', () => {
  const minVotes = 250000;
  const result = run({ profile: emptyProfile, customPrompt: 'ficção', filters: { minVotes } });
  assert.ok(result.recommendations.length > 0);
  for (const recommendation of result.recommendations) {
    assert.ok(Number(catalogFilm(recommendation.letterboxdSlug)?.imdbVotes || 0) >= minVotes, `${recommendation.title} must meet the popularity floor`);
  }
});

testWithCatalog('genre intent aliases constrain common Portuguese and English searches', () => {
  const cases: [string, string[]][] = [
    ['sci-fi', ['Sci-Fi']],
    ['science fiction', ['Sci-Fi']],
    ['ação', ['Action']],
    ['aventura', ['Adventure']],
    ['drama', ['Drama']],
    ['comédia', ['Comedy']],
    ['romcom', ['Comedy', 'Romance']],
    ['animação', ['Animation']],
    ['documentário', ['Documentary']],
    ['guerra', ['War']],
    ['faroeste', ['Western']],
    ['musical', ['Musical']],
    ['noir', ['Film-Noir']],
    ['neo-noir', ['Film-Noir']],
    ['giallo', ['Horror', 'Mystery']],
    ['artes marciais', ['Action']],
  ];
  for (const [query, expectedGenres] of cases) {
    const result = run({ profile: emptyProfile, customPrompt: query });
    assert.ok(result.recommendations.length > 0, `${query} should resolve to the catalog`);
    for (const recommendation of result.recommendations) {
      const film = catalogFilm(recommendation.letterboxdSlug);
      assert.ok(film, `${recommendation.title} must resolve to a catalog film`);
      for (const genre of expectedGenres) {
        assert.ok(film.genres.includes(genre), `${recommendation.title} must satisfy ${query} → ${genre}`);
      }
    }
  }
});

test('slow cinema never includes action or sport films', () => {
  const result = run({ profile: emptyProfile, themeId: 'slow-cinema-contemplative' });
  assert.ok(!result.recommendations.some((film) => ['warrior', 'american-sniper'].includes(film.letterboxdSlug)));
});

testWithCatalog('every atmosphere has a semantic contract before quality or profile affinity', () => {
  assert.equal(THEMES_CATALOG.length, 15);
  for (const theme of THEMES_CATALOG) {
    const selectedTheme = getThemeById(theme.id);
    const criteria = getThemeCriteria(theme.id);
    assert.ok(criteria, `${theme.id} needs an eligibility contract`);

    const result = run({ profile: emptyProfile, themeId: selectedTheme?.id, filters: { avoidWatched: false } });
    assert.ok(result.recommendations.length > 0, `${theme.id} should retain curated candidates`);

    for (const recommendation of result.recommendations) {
      const film = catalogFilm(recommendation.letterboxdSlug);
      assert.ok(film, `${recommendation.title} must resolve to a catalog film`);
      const genres = new Set((film.genres || []).map((genre) => genre.toLowerCase()));
      const required: string[] = (criteria.requiredAnyGenres || []).map((genre) => genre.toLowerCase());
      const excluded: string[] = (criteria.excludedAnyGenres || []).map((genre) => genre.toLowerCase());
      assert.ok(!required.length || required.some((genre) => genres.has(genre)), `${recommendation.title} misses ${theme.id}'s required genre`);
      assert.ok(!excluded.some((genre) => genres.has(genre)), `${recommendation.title} violates ${theme.id}'s excluded genres`);
    }
  }
});

testWithCatalog('Cyberpunk remains a hard semantic filter even for a Star Wars-heavy profile', () => {
  const result = run({
    profile: {
      ...emptyProfile,
      films: [
        { title: 'Star Wars: Episode III - Revenge of the Sith', year: 2005, rating: 5 },
        { title: 'Star Wars: The Force Awakens', year: 2015, rating: 5 },
        { title: 'Rogue One: A Star Wars Story', year: 2016, rating: 5 },
      ],
    },
    themeId: getThemeById('cyberpunk-neon-noir')?.id,
    filters: { avoidWatched: false },
  });
  assert.ok(result.recommendations.length > 0);
  assert.ok(!result.recommendations.some((film) => /star wars|rogue one/i.test(film.title)));
  for (const recommendation of result.recommendations) {
    const film = catalogFilm(recommendation.letterboxdSlug);
    assert.ok(film);
    assert.ok(film.genres.includes('Sci-Fi'));
    assert.ok(!film.genres.includes('Adventure'));
    assert.ok(!film.genres.includes('Fantasy'));
  }
});

testWithCatalog('notice is empty for a normal result and explains an empty one', () => {
  const found = run({ profile: emptyProfile, themeId: 'cyberpunk-neon-noir', filters: { avoidWatched: false } });
  assert.ok(found.recommendations.length > 0);
  assert.equal(found.notice, '');

  const none = run({ profile: emptyProfile, themeId: 'cyberpunk-neon-noir', filters: { minYear: 3000 } });
  assert.equal(none.recommendations.length, 0);
  assert.match(none.notice, /Nenhum filme novo/);
});

testWithCatalog('taste reasons write ratings with a decimal comma', () => {
  const profile: UserProfile = { username: 'x', films: [{ title: 'Inception', slug: 'inception', year: 2010, rating: 4.5 }] };
  const reasons = run({ profile, customPrompt: 'nolan', filters: {} }).recommendations.map((film) => film.affinityReason ?? '');
  assert.ok(reasons.some((reason) => reason.includes('4,5 estrelas')), reasons.join(' | '));
});
