import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseOgImage, letterboxdArtwork } from '../../src/infrastructure/letterboxd/artwork.ts';
import {
  fetchLetterboxdPage,
  isVerificationPage,
  LetterboxdBlockedError,
  LetterboxdError,
  LetterboxdNotFoundError,
  type PageFetcher,
} from '../../src/infrastructure/letterboxd/http.ts';
import { cleanUsername, decodeEntities, parseFilmsListHtml, parseProfileHtml, parseRssFeed } from '../../src/infrastructure/letterboxd/parse.ts';
import { collectFullProfile } from '../../src/infrastructure/letterboxd/sync.ts';

const profileHtml = (count: number) => `<h1 class="person-display-name">Test User</h1><a href="/test/films/"><span>${count}</span></a>`;

test('ordinary Cloudflare telemetry does not hide readable Letterboxd pages', () => {
  assert.equal(isVerificationPage(profileHtml(12) + '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'), false);
  assert.equal(isVerificationPage('<title>Just a moment...</title>'), true);
});
const filmHtml = (slug: string, title = slug, year = 2000) =>
  `<li class="griditem"><div data-item-slug="${slug}" data-item-name="${title} (${year})"><span class="rated-8"></span></div></li>`;
const fixture = () => readFileSync(new URL('../fixtures/profile-nested-name.html', import.meta.url), 'utf8');

/** collectFullProfile without batching: a single call must finish or reject. */
async function extract(username: string, fetchPage: PageFetcher) {
  const result = await collectFullProfile(username, fetchPage, { checkpoint: null, sleep: async () => {} });
  assert.equal(result.pending, false);
  if (result.pending) throw new Error('unreachable');
  return result.profile;
}

const fakeFetch = (status: number, body = '') =>
  (async () => ({ status, ok: status >= 200 && status < 300, text: async () => body })) as unknown as typeof fetch;

test('parser RSS mapeia título, nota, ano e slug; username é higienizado', () => {
  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:letterboxd="https://letterboxd.com">
    <channel>
      <title>Letterboxd - user reviews</title>
      <item>
        <title>Stalker, 1979 - ★★★★★</title>
        <link>https://letterboxd.com/cinephile/film/stalker/</link>
        <letterboxd:filmTitle>Stalker</letterboxd:filmTitle>
        <letterboxd:filmYear>1979</letterboxd:filmYear>
        <letterboxd:memberRating>5.0</letterboxd:memberRating>
      </item>
      <item>
        <title>Drive My Car, 2021 - ★★★★½</title>
        <link>https://letterboxd.com/cinephile/film/drive-my-car/</link>
        <letterboxd:filmTitle>Drive My Car</letterboxd:filmTitle>
        <letterboxd:filmYear>2021</letterboxd:filmYear>
        <letterboxd:memberRating>4.5</letterboxd:memberRating>
      </item>
      <item>
        <title>Generic Movie, 2020 - ★★</title>
        <link>https://letterboxd.com/cinephile/film/generic-movie/</link>
        <letterboxd:filmTitle>Generic Movie</letterboxd:filmTitle>
        <letterboxd:filmYear>2020</letterboxd:filmYear>
        <letterboxd:memberRating>2.0</letterboxd:memberRating>
      </item>
    </channel>
  </rss>`;
  const parsedRss = parseRssFeed(sampleRss);
  assert.equal(parsedRss.length, 3, 'Parser RSS extraiu todos os 3 filmes');
  assert.ok(parsedRss[0].title === 'Stalker' && parsedRss[0].rating === 5.0 && parsedRss[0].slug === 'stalker', 'Parser RSS mapeou nota 5.0 e slug');
  assert.ok(parsedRss[1].rating === 4.5 && parsedRss[1].year === 2021, 'Parser RSS mapeou nota 4.5 e ano');
  assert.equal(cleanUsername('https://letterboxd.com/cinefilo/'), 'cinefilo', 'Higienização de URL/Username');
});

test('unknown or blocked profiles reject instead of returning empty successful syncs', async () => {
  await assert.rejects(
    collectFullProfile('test', async (url) => {
      throw new LetterboxdNotFoundError(url);
    }),
    /perfil/,
  );
  await assert.rejects(collectFullProfile('test', async () => '<html>Access denied</html>'), /inválida/);
  await assert.rejects(collectFullProfile('test', async () => '<h1 class="person-display-name">Test</h1>'), /contagem/);
});

test('mid-pagination network failures and truncated collections reject', async () => {
  const page: PageFetcher = async (url) => {
    if (url.endsWith('/test/')) return profileHtml(2);
    if (url.endsWith('/films/')) return filmHtml('one');
    if (url.includes('/page/2/')) throw new Error('HTTP 503');
    return '';
  };
  await assert.rejects(collectFullProfile('test', page), /interrompida/);
  await assert.rejects(
    collectFullProfile('test', async (url) => (url.includes('/page/2/') ? '<ul class="poster-list"></ul>' : page(url))),
    /incompleto/,
  );
});

test('valid empty profiles and complete paginated profiles can sync', async () => {
  const empty = await extract('test', async (url) => (url.endsWith('/test/') ? profileHtml(0) : '<ul class="poster-list"></ul>'));
  assert.equal(empty.films.length, 0);
  const complete = await extract('https://letterboxd.com/test/', async (url) => {
    if (url.endsWith('/test/')) return profileHtml(2);
    if (url.endsWith('/films/')) return filmHtml('one');
    if (url.includes('/page/2/')) return filmHtml('two');
    return '';
  });
  assert.equal(complete.films.length, 2);
  assert.equal(complete.username, 'test');
});

// Reduced fixture reproducing the markup of a rendered public profile.
test('live profile markup with nested display-name spans parses correctly', () => {
  const profile = parseProfileHtml(fixture());
  assert.equal(profile.displayName, 'Ana Exemplo');
  assert.equal(profile.totalFilms, 930);
  assert.equal(profile.filmCountKnown, true);
  assert.equal(profile.thisYearCount, 89);
  assert.equal(profile.favorites[0].title, 'The Dark Knight');
  assert.equal(profile.favorites[0].year, 2008);
  assert.equal(profile.favorites[0].slug, 'the-dark-knight');
});

test('nested profile markup passes full synchronization instead of being rejected', async () => {
  const source = fixture().replace('>930<', '>1<');
  const profile = await extract('cinefila', async (url) => {
    if (url.endsWith('/cinefila/')) return source;
    if (url.endsWith('/films/')) return filmHtml('the-dark-knight', 'The Dark Knight', 2008);
    return '';
  });
  assert.equal(profile.displayName, 'Ana Exemplo');
  assert.equal(profile.films.length, 1);
  assert.equal(profile.films[0].rating, 4);
});

test('verification pages explain how to retry without accepting them as profiles', async () => {
  await assert.rejects(
    collectFullProfile('cinefila', async () => '<html><head><title>Just a moment...</title></head><body>Checking browser</body></html>'),
    /mesmo navegador/,
  );
});

test('fetchLetterboxdPage maps HTTP statuses to typed errors', async () => {
  const url = 'https://letterboxd.com/test/';
  for (const status of [403, 429]) {
    const error = await fetchLetterboxdPage(url, fakeFetch(status)).catch((e: unknown) => e);
    assert.ok(error instanceof LetterboxdBlockedError, `${status} → LetterboxdBlockedError`);
    assert.ok(error instanceof LetterboxdError);
  }
  const notFound = await fetchLetterboxdPage(url, fakeFetch(404)).catch((e: unknown) => e);
  assert.ok(notFound instanceof LetterboxdNotFoundError);
  assert.equal((notFound as LetterboxdNotFoundError).url, url);
  assert.ok(!String((notFound as Error).message).startsWith('SKIP_404'));
  const serverError = await fetchLetterboxdPage(url, fakeFetch(500)).catch((e: unknown) => e);
  assert.ok(serverError instanceof Error);
  assert.ok(!(serverError instanceof LetterboxdError), '500 is a plain, retryable Error');
  assert.match((serverError as Error).message, /HTTP 500/);
  assert.equal(await fetchLetterboxdPage(url, fakeFetch(200, '<html>ok</html>')), '<html>ok</html>');
});

test('parseOgImage reads og:image in either attribute order and decodes &amp;', () => {
  assert.equal(parseOgImage('<meta property="og:image" content="https://a.ltrbxd.com/x.jpg?v=1&amp;k=2">'), 'https://a.ltrbxd.com/x.jpg?v=1&k=2');
  assert.equal(parseOgImage(`<meta content='https://a.ltrbxd.com/y.jpg' property='og:image' />`), 'https://a.ltrbxd.com/y.jpg');
  assert.equal(parseOgImage('<meta property="og:title" content="Alien">'), '');
});

test('letterboxdArtwork fetches the film page once, caches it and swallows failures', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => '<meta property="og:image" content="https://img/alien.jpg">' };
  }) as unknown as typeof fetch;
  const artwork = letterboxdArtwork(fetchImpl);
  assert.equal(await artwork.artworkUrl('Alien'), 'https://img/alien.jpg');
  assert.equal(await artwork.artworkUrl('alien'), 'https://img/alien.jpg');
  assert.deepEqual(calls, ['https://letterboxd.com/film/alien/']);
  assert.equal(await artwork.artworkUrl('!!!'), '');
  const failing = letterboxdArtwork((async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch);
  assert.equal(await failing.artworkUrl('alien'), '');
});

test('a film logged during the sync is not lost when it pushes another to the next page', async () => {
  // The profile reported 72 films; a new one took the first slot of page 1
  // and pushed the oldest to page 2.
  const page1 = ['new', ...Array.from({ length: 71 }, (_, i) => `film-${i}`)];
  const profile = await extract('test', async (url) => {
    if (url.endsWith('/test/')) return profileHtml(72);
    if (url.endsWith('/films/')) return page1.map((slug) => filmHtml(slug)).join('');
    if (url.includes('/page/2/')) return filmHtml('oldest');
    return '<ul class="poster-list"></ul>';
  });
  assert.equal(profile.films.length, 73);
  assert.ok(profile.films.some((film) => film.slug === 'oldest'));
  assert.equal(profile.totalFilms, 73);
});

test('a page past the end that repeats the last full page ends a complete collection', async () => {
  const page1 = Array.from({ length: 72 }, (_, i) => filmHtml(`film-${i}`)).join('');
  const profile = await extract('test', async (url) => {
    if (url.endsWith('/test/')) return profileHtml(72);
    if (url.endsWith('/films/') || url.includes('/page/2/')) return page1;
    return '<ul class="poster-list"></ul>';
  });
  assert.equal(profile.films.length, 72);
});

test('titles and display names decode HTML entities', () => {
  assert.equal(decodeEntities('Schindler&#039;s List &amp; &#x2014; &quot;x&quot; &unknown;'), `Schindler's List & — "x" &unknown;`);
  const [film] = parseFilmsListHtml('<li class="griditem"><div data-item-slug="schindlers-list" data-item-name="Schindler&#039;s List (1993)"></div></li>');
  assert.equal(film.title, "Schindler's List");
  assert.equal(film.year, 1993);
  const [poster] = parseFilmsListHtml('<li class="poster-container"><img alt="Amélie &amp; Co" /><a href="/film/amelie/"></a></li>');
  assert.equal(poster.title, 'Amélie & Co');
  const [rss] = parseRssFeed('<item><title>Tom &amp; Jerry - ★★★</title><link>https://letterboxd.com/u/film/tom-and-jerry/</link></item>');
  assert.equal(rss.title, 'Tom & Jerry');
  assert.equal(parseProfileHtml('<h1 class="person-display-name">Ana &#039;Cine&#039; &amp; Co</h1>').displayName, "Ana 'Cine' & Co");
});

test('an unrated favorite keeps no rating instead of an invented 5', async () => {
  const favorites = '<section id="favourites"><li class="griditem"><div data-item-slug="fav" data-item-name="Fav (2001)"></div></li><li class="griditem"><div data-item-slug="rated" data-item-name="Rated (2002)"></div></li></section>';
  const profile = await extract('test', async (url) => {
    if (url.endsWith('/test/')) return profileHtml(2) + favorites;
    if (url.endsWith('/films/')) {
      return '<li class="griditem"><div data-item-slug="fav" data-item-name="Fav (2001)"></div></li>' + filmHtml('rated', 'Rated', 2002);
    }
    return '<ul class="poster-list"></ul>';
  });
  const bySlug = new Map(profile.films.map((film) => [film.slug, film]));
  assert.equal(bySlug.get('fav')?.rating, null);
  assert.equal(bySlug.get('fav')?.isFavorite, true);
  assert.equal(bySlug.get('rated')?.rating, 4);
  assert.equal(bySlug.get('rated')?.isFavorite, true);
});
