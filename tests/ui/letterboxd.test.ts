import { expect, test } from 'vitest';
import { usernameFromLetterboxdUrl } from '../../src/domain/letterboxd.ts';

test('member pages return the member', () => {
  expect(usernameFromLetterboxdUrl('https://letterboxd.com/someone/')).toBe('someone');
  expect(usernameFromLetterboxdUrl('https://letterboxd.com/some_one/films/page/2/')).toBe('some_one');
});

test('site, crew and company pages are not members', () => {
  for (const path of [
    'film/heat/', 'films/popular/', 'actor/al-pacino/', 'director/michael-mann/', 'studio/a24/',
    'crew/', 'hq/', 'sign-in/', 'create-account/', 'tmdb/949/', 'imdb/tt0113277/', 'podcast/', 'showdown/',
  ]) expect(usernameFromLetterboxdUrl(`https://letterboxd.com/${path}`), path).toBeNull();
});

test('other hosts and invalid URLs are ignored', () => {
  expect(usernameFromLetterboxdUrl('https://example.com/someone/')).toBeNull();
  expect(usernameFromLetterboxdUrl('https://letterboxd.com.evil.test/someone/')).toBeNull();
  expect(usernameFromLetterboxdUrl('not a url')).toBeNull();
  expect(usernameFromLetterboxdUrl(undefined)).toBeNull();
});
