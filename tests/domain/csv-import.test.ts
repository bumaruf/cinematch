import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { ProfileFilm, UserProfile } from '../../src/domain/film.ts';
import { importProfileSnapshot, mergeProfileFilms, needsCsvRepair, parseProfileCsv } from '../../src/domain/profile/csv-import.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { FIXED_NOW } from '../helpers.ts';

const catalog = loadCatalog();
const header = 'Date,Name,Year,Letterboxd URI,Rating\n';
const profileOf = (films: ProfileFilm[]) => ({ films }) as UserProfile;

test('watched snapshot removes previous import leftovers and cannot grow from unmatched ratings or diary records', () => {
  const base = profileOf([
    { title: 'Real', year: 2000, slug: 'real', rating: 4 },
    { title: 'Leftover', year: 2001, slug: 'leftover' },
  ]);
  const incoming: ProfileFilm[] = [
    { title: 'Real', year: 2000, slug: 'real', source: 'csv-watched', rating: null },
    { title: 'Real', year: 2000, slug: 'real', source: 'csv-ratings', rating: 2 },
    { title: 'Different alias', year: 2001, slug: '', letterboxdUri: 'https://boxd.it/unknown', source: 'csv-diary', rating: 3 },
  ];
  const result = importProfileSnapshot(catalog, base, incoming, FIXED_NOW);
  assert.equal(result.profile.totalFilms, 1);
  assert.equal(result.profile.films[0].rating, 2);
  assert.equal(result.unmatched.length, 1);
  assert.equal(importProfileSnapshot(catalog, result.profile, incoming, FIXED_NOW).profile.totalFilms, 1);
  assert.equal(base.films.length, 2);
});

test('ratings-only import cannot expand an existing watched history', () => {
  const result = importProfileSnapshot(
    catalog,
    profileOf([{ title: 'Real', slug: 'real', year: 2000 }]),
    [{ title: 'Unmatched', year: 2001, slug: 'unmatched', source: 'csv-ratings', rating: 3 }],
    FIXED_NOW,
  );
  assert.equal(result.profile.totalFilms, 1);
  assert.equal(result.unmatched.length, 1);
});

test('missing release year remains unknown and does not prevent importing other films', () => {
  const records = parseProfileCsv(
    header + '2026-01-01,Unknown year,,https://boxd.it/abc,4\n2026-01-01,Known year,2000,https://boxd.it/def,3',
    'ratings.csv',
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].year, null);
  assert.equal(records[0].rating, 4);
  assert.equal(mergeProfileFilms(catalog, [], records).films.length, 2);
});

test('quoted decimal comma is accepted and invalid fields are identified in errors', () => {
  assert.equal(parseProfileCsv(header + '2026-01-01,Example,2000,https://boxd.it/abc,"3,5"', 'ratings.csv')[0].rating, 3.5);
  assert.throws(() => parseProfileCsv(header + '2026-01-01,Example,no-year,https://boxd.it/abc,3', 'ratings.csv'), /Example.*ano inválido/);
  assert.throws(() => parseProfileCsv(header + '2026-01-01,Example,2000,https://boxd.it/abc,9', 'ratings.csv'), /Example.*nota inválida/);
});

test('short URLs do not create invented slugs; repeated imports update ratings downwards without adding duplicates', () => {
  const records = parseProfileCsv(header + '2026-01-01,The Empire Strikes Back,1980,https://boxd.it/27Vw,2', 'ratings.csv');
  assert.equal(records[0].slug, '');
  const old: ProfileFilm[] = [{ title: 'The Empire Strikes Back', year: 1980, slug: 'the-empire-strikes-back', rating: 5, source: 'films-page' }];
  const merged = mergeProfileFilms(catalog, old, records);
  assert.equal(merged.films.length, 1);
  assert.equal(merged.films[0].rating, 2);
  assert.equal(merged.addedCount, 0);
  assert.equal(merged.updatedRatingCount, 1);
  assert.equal(mergeProfileFilms(catalog, merged.films, records).films.length, 1);
  assert.equal(old[0].rating, 5);
});

test('legacy fabricated slugs collapse into web identities; different release years remain separate', () => {
  const result = mergeProfileFilms(catalog, [
    { title: 'Obra Única', year: 1910, slug: 'real-film-1910', rating: 3, source: 'films-page' },
    { title: 'Obra Única', year: 1910, slug: 'obra-nica', rating: 5, source: 'csv' },
    { title: 'Obra Única', year: 2010, slug: 'obra-nica', rating: 4, source: 'csv' },
  ]);
  assert.equal(result.removedCount, 1);
  assert.equal(result.films.length, 2);
  assert.equal(result.films[0].rating, 3);
});

test('watched, ratings and diary have deterministic precedence regardless of selection order', () => {
  const watched = parseProfileCsv(header + '2026-01-01,Example,2000,https://boxd.it/abc,', 'watched.csv');
  const rated = parseProfileCsv(header + '2026-01-01,Example,2000,https://boxd.it/abc,1.5', 'ratings.csv');
  const diary = parseProfileCsv(
    header.trim() + ',Watched Date\n2026-01-01,Example,2000,https://boxd.it/abc,5,2025-01-01\n2026-01-01,Example,2000,https://boxd.it/abc,4,2026-01-01',
    'diary.csv',
  );
  for (const records of [[...watched, ...rated, ...diary], [...diary, ...rated, ...watched]]) {
    const result = mergeProfileFilms(catalog, [], records);
    assert.equal(result.films.length, 1);
    assert.equal(result.films[0].rating, 1.5);
  }
  assert.equal(mergeProfileFilms(catalog, [], diary).films[0].rating, 4);
});

test('CSV handles BOM, commas, escaped quotes and multiline cells; rejects watchlist and invalid ratings', () => {
  const parsed = parseProfileCsv('﻿' + header + '2026-01-01,"A, ""strange""\nfilm",2000,https://boxd.it/abc,4', 'ratings.csv');
  assert.equal(parsed[0].title, 'A, "strange"\nfilm');
  assert.throws(() => parseProfileCsv(header, 'watchlist.csv'), /Watchlist/);
  assert.throws(() => parseProfileCsv(header + '2026-01-01,X,2000,https://boxd.it/abc,9', 'ratings.csv'), /inválidos/);
});

test('different authoritative slugs with the same unknown title/year are not silently combined', () => {
  const result = mergeProfileFilms(
    catalog,
    [{ title: 'Obra desconhecida', year: 1910, slug: 'work-a' }],
    [{ title: 'Obra desconhecida', year: 1910, slug: 'work-b', source: 'csv-ratings', rating: 3 }],
  );
  assert.equal(result.films.length, 2);
});

test('needsCsvRepair only flags legacy csv profiles that were never repaired', () => {
  assert.equal(needsCsvRepair(null), false);
  assert.equal(needsCsvRepair(profileOf([{ title: 'A', source: 'films-page' }])), false);
  assert.equal(needsCsvRepair(profileOf([{ title: 'A', source: 'csv' }])), true);
  assert.equal(needsCsvRepair({ ...profileOf([{ title: 'A', source: 'csv' }]), csvIdentityVersion: 2 }), false);
});
