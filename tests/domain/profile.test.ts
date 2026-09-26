import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { FilmIdentity, ProfileFilm, UserProfile } from '../../src/domain/film.ts';
import { analyzeProfile } from '../../src/domain/profile/analyze.ts';
import { createWatchedIndex } from '../../src/domain/profile/watched.ts';
import { analyzeYearPhase } from '../../src/domain/profile/year-phase.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { emptyProfile, FIXED_NOW, testWithCatalog } from '../helpers.ts';

const catalog = loadCatalog();

function watched(candidate: FilmIdentity, films: ProfileFilm[]): boolean {
  const analyzed = analyzeProfile({ ...emptyProfile, films }, catalog, FIXED_NOW);
  return createWatchedIndex(analyzed.watchedList).has(candidate);
}

test('analyzeProfile identifica top filmes, descartados, contagem de 5★ e lista de assistidos', () => {
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
  const analyzed = analyzeProfile(mockRawProfile, catalog, FIXED_NOW);
  assert.ok(analyzed.topFilms.length >= 4, 'Top filmes (4.5★ - 5.0★ + Favoritos) identificados');
  assert.ok(
    analyzed.dislikedFilms.length === 1 && analyzed.dislikedFilms[0].title === 'Generic Action',
    'Filmes descartados com nota baixa identificados',
  );
  assert.ok(analyzed.stats.fiveStarCount >= 3, 'Contagem de 5 estrelas calculada');
  // `watchedTitles` was removed; the watched list carries the same titles.
  const titles = analyzed.watchedList.map((film) => film.title);
  assert.ok(titles.includes('Stalker') && titles.includes('Blade Runner 2049'), 'Lista de títulos assistidos montada');
  assert.ok(analyzed.watchedList.length >= 6, 'Lista de assistidos contém todos os filmes do perfil');
});

test('analyzeYearPhase identifica contagem, gênero e diretor predominantes do ano', () => {
  const mockYearProfile: UserProfile = {
    username: 'cinematest',
    displayName: 'Cinéfilo Teste',
    thisYearCount: 45,
    thisYearFilms: [
      { title: 'Alien', director: 'Ridley Scott', genres: ['Sci-Fi', 'Horror'], rating: 5.0 },
      { title: 'Blade Runner', director: 'Ridley Scott', genres: ['Sci-Fi'], rating: 4.5 },
      { title: 'O Iluminado', director: 'Stanley Kubrick', genres: ['Horror'], rating: 5.0 },
    ],
    films: [
      { title: 'Stalker', rating: 5.0 },
      { title: 'Solaris', rating: 4.5 },
    ],
    favorites: [],
  };
  const yearPhase = analyzeYearPhase(mockYearProfile, catalog, FIXED_NOW);
  assert.equal(yearPhase.thisYearCount, 45, 'Contagem do ano ("This Year") capturada corretamente');
  assert.ok(yearPhase.topGenres.length > 0 && yearPhase.topGenres[0].genre === 'Sci-Fi', 'Gênero predominante do ano identificado');
  assert.ok(
    yearPhase.topDirectors.length > 0 && yearPhase.topDirectors[0].director === 'Ridley Scott',
    'Diretor mais assistido do ano identificado',
  );
});

test('remakes survive title matching; same film and same slug remain blocked', () => {
  const films = [{ title: 'Suspiria', year: 1977, slug: 'suspiria-1977' }];
  assert.equal(watched({ title: 'Suspiria', year: 2018, letterboxdSlug: 'suspiria-2018' }, films), false);
  assert.equal(watched({ title: 'Suspiria', year: 1977 }, films), true);
  assert.equal(watched({ title: 'Outro título', letterboxdSlug: 'suspiria-1977' }, films), true);
  assert.equal(watched({ title: 'Suspiria' }, films), true);
});

test('year-suffixed Letterboxd slugs block the same watched film without blocking remakes', () => {
  const films = [{ title: 'A Bruxa', year: 2015, slug: 'the-witch-2015' }];
  assert.equal(watched({ title: 'The Witch', originalTitle: 'The Witch', year: 2015, letterboxdSlug: 'the-witch' }, films), true);
  assert.equal(watched({ title: 'The Witch', year: 1966, letterboxdSlug: 'the-witch' }, films), false);
});

test('watched validation blocks translated titles, accents, punctuation, and slug variants', () => {
  const films = [
    { title: "The World's End", year: 2013, slug: 'the-worlds-end' },
    { title: 'Amélie', year: 2001, slug: 'amelie' },
    { title: 'Cidade de Deus', year: 2002, slug: 'cidade-de-deus' },
  ];
  assert.equal(
    watched({ title: 'O Fim do Mundo', originalTitle: "The World's End", year: 2013, letterboxdSlug: 'the-world-s-end' }, films),
    true,
  );
  assert.equal(watched({ title: 'Amelie', year: 2001, letterboxdSlug: 'amelie-2001' }, films), true);
  assert.equal(watched({ title: 'Cidade de Deus', year: 2002, letterboxdSlug: 'cidade_de_deus' }, films), true);
});

test('watched validation blocks shortened alternate titles from the catalog original title', () => {
  const films = [{ title: 'The Empire Strikes Back', year: 1980 }];
  assert.equal(
    watched(
      {
        title: 'O Império Contra-Ataca',
        originalTitle: 'Star Wars: Episode V - The Empire Strikes Back',
        year: 1980,
        letterboxdSlug: 'star-wars-episode-v-the-empire-strikes-back',
      },
      films,
    ),
    true,
  );
});

testWithCatalog('profile entries resolve to canonical catalog slugs only when unambiguous', () => {
  assert.equal(catalog.resolve({ title: 'The Empire Strikes Back', year: 1980 }).film?.slug, 'star-wars-episode-v-the-empire-strikes-back');
  assert.equal(catalog.resolve({ title: 'O Abrigo', year: 2011 }).film, null);
  assert.equal(catalog.resolve({ title: 'O Abrigo', year: 2011 }).ambiguous, true);
});

testWithCatalog('distinct canonical slugs prevent translated-title collisions from blocking films', () => {
  const films = [{ title: 'O Abrigo', year: 2011, slug: 'take-shelter' }];
  assert.equal(
    watched({ title: 'O Abrigo', originalTitle: 'The Divide', year: 2011, letterboxdSlug: 'the-divide', catalogSlug: 'the-divide' }, films),
    false,
  );
});

testWithCatalog('profile preserves supplied metadata and enriches scraped films from the local catalog', () => {
  const p = analyzeProfile(
    {
      ...emptyProfile,
      films: [
        { title: 'Custom', rating: 5, director: 'Custom Director', genres: ['Custom Genre'] },
        { title: 'Alien', slug: 'alien', year: 1979, rating: 5 },
      ],
    },
    catalog,
    FIXED_NOW,
  );
  assert.equal(p.topFilms[0].director, 'Custom Director');
  assert.deepEqual(p.topFilms[0].genres, ['Custom Genre']);
  assert.equal(p.topFilms[1].director, 'Ridley Scott');
  assert.ok(p.topFilms[1].genres.length);
  const year = analyzeYearPhase({ thisYearFilms: [{ title: 'Alien', slug: 'alien' }] }, catalog, FIXED_NOW);
  assert.equal(year.topDirectors[0].director, 'Ridley Scott');
});

test('dislike count reflects all low ratings, independent of the 30-item recommendation context limit', () => {
  const analyzed = analyzeProfile(
    { films: Array.from({ length: 50 }, (_, i) => ({ title: `Unknown film ${i}`, rating: 1 })) } as UserProfile,
    catalog,
    FIXED_NOW,
  );
  assert.equal(analyzed.stats.dislikedCount, 50);
  assert.equal(analyzed.dislikedFilms.length, 30);
});

test('pinned favorites do not fabricate five-star ratings or inflate the five-star count', () => {
  const result = analyzeProfile(
    {
      films: [{ title: 'Example', slug: 'example-xyz', rating: 3, isFavorite: true }],
      favorites: [{ title: 'Other', slug: 'other-xyz' }],
    } as UserProfile,
    catalog,
    FIXED_NOW,
  );
  assert.equal(result.stats.fiveStarCount, 0);
  assert.equal(result.topFilms.find((f) => f.slug === 'example-xyz')?.rating, 3);
  assert.equal(result.topFilms.find((f) => f.slug === 'other-xyz')?.rating, null);
});
