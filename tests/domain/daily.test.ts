import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { UserProfile } from '../../src/domain/film.ts';
import { dateKey, DAILY_MATCHING_VERSION, NoDailyCandidateError, pickDaily, profileKey } from '../../src/domain/recommend/daily.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { emptyProfile, FIXED_NOW, testWithCatalog } from '../helpers.ts';

const catalog = loadCatalog();
const daily = (profile: UserProfile, date = dateKey(FIXED_NOW), excludedSlugs: string[] = []) =>
  pickDaily(profile, catalog, { date, now: FIXED_NOW, excludedSlugs });

const tasteProfile: UserProfile = { ...emptyProfile, films: [{ title: 'The Dark Knight', slug: 'the-dark-knight', year: 2008, rating: 5 }] };

testWithCatalog('recomendação do dia: qualidade, justificativa, nunca assistido, determinismo', () => {
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
  const seen = ['Alien', 'Blade Runner', 'O Iluminado', 'Stalker', 'Solaris'];

  const dailyRec1 = daily(mockYearProfile, '2026-09-17');
  assert.ok(dailyRec1 && dailyRec1.film && dailyRec1.film.title, 'Recomendação do Dia gerada com sucesso');
  assert.ok(dailyRec1.film.imdbRating >= 7.0, 'Recomendação do Dia atende ao critério de alta qualidade (IMDb >= 7.0)');
  assert.ok(dailyRec1.curatorReason && seen.some((title) => dailyRec1.curatorReason.includes(title)), 'Justificativa cita um filme do perfil');
  assert.ok(!seen.includes(dailyRec1.film.title), 'Recomendação do Dia nunca recomenda filme já assistido');

  const dailyRec1Again = daily(mockYearProfile, '2026-09-17');
  assert.equal(dailyRec1.film.title, dailyRec1Again.film.title, 'Recomendação do Dia é 100% determinística para a mesma data');

  const dailyRec2 = daily(mockYearProfile, '2026-09-18');
  assert.ok(dailyRec2 && dailyRec2.film, 'Recomendação do Dia para data seguinte gerada com sucesso');
});

test('daily curation never backfills a profile without preferences with an arbitrary film', () => {
  assert.throws(() => daily(emptyProfile), NoDailyCandidateError);
  assert.throws(() => daily(emptyProfile), /afinidade suficiente/);
});

testWithCatalog('daily picks exclude films recommended on recent previous days', () => {
  const first = daily(tasteProfile, '2026-09-17');
  const second = daily(tasteProfile, '2026-09-18', [first.film.letterboxdSlug]);
  assert.notEqual(second.film.letterboxdSlug, first.film.letterboxdSlug);
});

testWithCatalog('daily match scores are evidence-based instead of a fixed percentage', () => {
  const pick = daily(
    {
      username: 'daily-evidence',
      films: [
        { title: 'The Dark Knight', year: 2008, rating: 5, slug: 'the-dark-knight' },
        { title: 'The Godfather', year: 1972, rating: 5, slug: 'the-godfather' },
        { title: 'Star Wars', year: 1977, rating: 4.5, slug: 'star-wars' },
      ],
      favorites: [],
    },
    '2026-09-17',
  );
  // The fixed-percentage `matchScore` field no longer exists at all.
  assert.equal((pick.film as unknown as Record<string, unknown>).matchScore, undefined);
  assert.ok(pick.film.affinityReason);
});

testWithCatalog('daily picks include the same poster path used by regular recommendations', () => {
  const pick = daily(tasteProfile, '2026-09-17');
  const film = catalog.bySlug(pick.film.letterboxdSlug);
  assert.ok(film);
  assert.equal(pick.film.posterPath, catalog.posterPath(film.imdbId) || '');
});

test('daily cache identity changes when a profile changes, even for the same username', () => {
  const base: UserProfile = { username: 'same-user', films: [{ title: 'The Godfather', slug: 'the-godfather', rating: 5 }], lastSync: '2026-09-23T10:00:00.000Z' };
  const same = { ...base, films: [...base.films] };
  const changedHistory = { ...base, films: [...base.films, { title: 'Alien', slug: 'alien', rating: 4 }], lastSync: '2026-09-23T10:05:00.000Z' };
  const anotherPerson = { ...base, username: 'another-user' };
  assert.equal(profileKey(base), profileKey(same));
  assert.notEqual(profileKey(base), profileKey(changedHistory));
  assert.notEqual(profileKey(base), profileKey(anotherPerson));
});

testWithCatalog('daily payload records the matching version it was computed with', () => {
  assert.equal(daily(tasteProfile, '2026-09-17').matchingVersion, DAILY_MATCHING_VERSION);
});

test('dateKey uses the São Paulo calendar day', () => {
  assert.equal(dateKey(FIXED_NOW), '2026-09-17');
  assert.equal(dateKey(new Date('2026-09-18T02:00:00.000Z')), '2026-09-17');
});
