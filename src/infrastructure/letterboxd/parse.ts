/** Parsers for Letterboxd pages. They follow its markup, so they may need updates. */

import { isMemberSegment } from '../../domain/letterboxd.ts';

export interface ParsedFilm {
  title: string;
  slug: string;
  year: number | null;
  rating: number | null;
  source: 'rss' | 'html-griditem' | 'html-poster' | 'html-fallback';
  link?: string;
  isFavorite?: boolean;
}

export interface ProfileMetadata {
  displayName: string;
  bio: string;
  totalFilms: number;
  /** The film count was found, so an empty history is real, not a parse failure. */
  filmCountKnown: boolean;
  thisYearCount: number;
  avatarUrl: string;
  favorites: ParsedFilm[];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

/** Decodes the HTML entities Letterboxd leaves in attributes and text ("Schindler&#039;s List"). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

export function cleanUsername(input: string | null | undefined): string {
  if (!input) return '';
  let user = input.trim();
  const urlMatch = user.match(/letterboxd\.com\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    // A film, list or other site page is not a member ("letterboxd.com/film/…").
    if (!isMemberSegment(urlMatch[1])) return '';
    user = urlMatch[1];
  }
  user = user.replace(/^@/, '').toLowerCase().trim();
  return /^[a-z0-9_-]+$/.test(user) ? user : '';
}

/**
 * Parse RSS feed — most reliable source for exact recent diary ratings.
 */
export function parseRssFeed(xmlText: string): ParsedFilm[] {
  const entries: ParsedFilm[] = [];
  if (!xmlText) return entries;

  const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi);

  for (const itemMatch of itemMatches) {
    const block = itemMatch[1];

    const titleMatch =
      block.match(/<letterboxd:filmTitle[^>]*>\s*([^<]+)\s*<\/letterboxd:filmTitle>/i) ||
      block.match(/<title[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i) ||
      block.match(/<title[^>]*>\s*([^<]+)\s*<\/title>/i);

    const yearMatch = block.match(/<letterboxd:filmYear[^>]*>\s*(\d{4})\s*<\/letterboxd:filmYear>/i);
    const ratingMatch = block.match(/<letterboxd:memberRating[^>]*>\s*([\d.]+)\s*<\/letterboxd:memberRating>/i);
    const linkMatch =
      block.match(/<link[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/link>/i) ||
      block.match(/<link[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/link>/i);

    let rawTitle = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';
    rawTitle = rawTitle.replace(/\s*[-–]\s*[★½\d\s.]+$/, '').trim();

    if (!rawTitle) continue;

    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    const link = linkMatch ? linkMatch[1].trim() : '';

    let slug = '';
    const slugMatch = link.match(/\/film\/([a-zA-Z0-9_-]+)/);
    if (slugMatch) slug = slugMatch[1];

    entries.push({ title: rawTitle, year, rating, link, slug, source: 'rss' });
  }

  return entries;
}

/**
 * Parse HTML film list pages (e.g. /films/, /films/page/N/, /films/by/entry-rating/)
 * Supports both new Letterboxd griditem markup and classic poster-container markup.
 */
export function parseFilmsListHtml(html: string, defaultRating: number | null = null): ParsedFilm[] {
  const films: ParsedFilm[] = [];
  if (!html) return films;

  // Pattern 1: <li class="griditem"> ... </li> (Modern Letterboxd)
  const gridItemRegex = /<li[^>]*class="[^"]*griditem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  for (const gm of html.matchAll(gridItemRegex)) {
    const content = gm[1];

    // Slug
    const slugM = content.match(/data-item-slug="([^"]+)"/) || 
                  content.match(/data-film-slug="([^"]+)"/) ||
                  content.match(/data-target-link="\/film\/([^"/]+)\/"/);
    const slug = slugM ? slugM[1] : '';

    // Title and Year from data-item-name="Title (Year)"
    const nameM = content.match(/data-item-name="([^"]+)"/);
    let title = '';
    let year: number | null = null;
    if (nameM) {
      const rawName = decodeEntities(nameM[1]);
      const yearMatch = rawName.match(/\((\d{4})\)$/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        title = rawName.replace(/\s*\(\d{4}\)$/, '').trim();
      } else {
        title = rawName.trim();
      }
    }
    if (!title) {
      const altM = content.match(/<img[^>]+alt="([^"]+)"/);
      title = altM ? decodeEntities(altM[1]).trim() : (slug ? slug.replace(/-/g, ' ') : '');
    }

    // Rating: rated-10 (5★), rated-9 (4.5★), rated-8 (4★), rated-7 (3.5★)...
    const ratedM = content.match(/rated-(\d+)/);
    const rating = ratedM ? parseInt(ratedM[1], 10) / 2 : defaultRating;

    if (slug || title) {
      films.push({ title, slug, year, rating, source: 'html-griditem' });
    }
  }

  // Pattern 2: <li class="poster-container ..."> (Classic Letterboxd)
  if (films.length === 0) {
    const liRegex = /<li[^>]*class="([^"]*poster-container[^"]*)"([^>]*)>([\s\S]*?)<\/li>/gi;
    for (const liMatch of html.matchAll(liRegex)) {
      const liClassStr   = liMatch[1] || '';
      const liExtraAttrs = liMatch[2] || '';
      const liContent    = liMatch[3] || '';

      let rating = defaultRating;
      const ratedClassMatch =
        liClassStr.match(/rated-(\d+)/) ||
        liExtraAttrs.match(/rated-(\d+)/) ||
        liContent.match(/rated-(\d+)/);
      if (ratedClassMatch) {
        rating = parseInt(ratedClassMatch[1], 10) / 2;
      }

      const slugMatch =
        liContent.match(/data-item-slug="([^"]+)"/) ||
        liContent.match(/data-film-slug="([^"]+)"/) ||
        liContent.match(/data-target-link="\/film\/([^"/]+)\/"/) ||
        liContent.match(/href="\/film\/([^"/]+)\//);

      const altMatch = liContent.match(/<img[^>]+alt="([^"]+)"/);
      const nameM = liContent.match(/data-item-name="([^"]+)"/);

      let title = '';
      let year: number | null = null;
      if (nameM) {
        const rawName = decodeEntities(nameM[1]);
        const yMatch = rawName.match(/\((\d{4})\)$/);
        if (yMatch) {
          year = parseInt(yMatch[1], 10);
          title = rawName.replace(/\s*\(\d{4}\)$/, '').trim();
        } else {
          title = rawName.trim();
        }
      }
      if (!title) {
        title = altMatch ? decodeEntities(altMatch[1]).trim() : (slugMatch ? slugMatch[1].replace(/-/g, ' ') : '');
      }

      const slug = slugMatch ? slugMatch[1] : '';

      if (slug || title) {
        films.push({ title, slug, year, rating, source: 'html-poster' });
      }
    }
  }

  // Pattern 3: Fallback data-film-slug or data-item-slug
  if (films.length === 0) {
    const slugRegex = /(?:data-item-slug|data-film-slug)="([^"]+)"/g;
    for (const slugMatch of html.matchAll(slugRegex)) {
      const slug = slugMatch[1];
      const nearbyHtml = html.substring(slugMatch.index, slugMatch.index + 600);
      const altNearby = nearbyHtml.match(/<img[^>]+alt="([^"]+)"/);
      const title = altNearby ? decodeEntities(altNearby[1]).trim() : slug.replace(/-/g, ' ');

      const nearbyBefore = html.substring(Math.max(0, slugMatch.index - 300), slugMatch.index + 500);
      const ratedNearby = nearbyBefore.match(/rated-(\d+)/);
      const rating = ratedNearby ? parseInt(ratedNearby[1], 10) / 2 : defaultRating;

      if (title && !films.some(f => f.slug === slug)) {
        films.push({ title, slug, year: null, rating, source: 'html-fallback' });
      }
    }
  }

  return films;
}

/**
 * Parse profile HTML for display name, avatar, favorites, and total film count.
 */
export function parseProfileHtml(html: string): ProfileMetadata {
  let displayName = '';
  const bio = '';
  let totalFilms = 0;
  let avatarUrl = '';
  const favorites: ParsedFilm[] = [];

  if (!html) return { displayName, bio, totalFilms, filmCountKnown: false, thisYearCount: 0, avatarUrl, favorites };

  // The live profile wraps the display name in nested spans.
  const nameMatch =
    html.match(/<h1\b[^>]*class=["'][^"']*\bperson-display-name\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1\b[^>]*class=["'][^"']*\btitle-1\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (nameMatch) {
    displayName = decodeEntities(nameMatch[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  }

  // Avatar URL
  const avatarMatch = html.match(/class="[^"]*avatar[^"]*"[\s\S]{0,300}?<img[^>]+src="([^"]+)"/i) ||
    html.match(/<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i);
  if (avatarMatch) avatarUrl = avatarMatch[1].trim();

  // Total Films
  const filmsCountMatch =
    html.match(/href="\/[^/]+\/films\/"[^>]*>\s*<span[^>]*>\s*([\d,]+)\s*<\/span>/i) ||
    html.match(/href="\/[^/]+\/films\/"[^>]*>\s*([\d,]+)\s*Films?/i) ||
    html.match(/([\d,]+)\s*Films?/i);
  if (filmsCountMatch) {
    totalFilms = parseInt(filmsCountMatch[1].replace(/,/g, ''), 10);
  }

  // This Year Films count (e.g. "89 this year")
  let thisYearCount = 0;
  const thisYearMatch =
    html.match(/href="\/[^/]+(?:\/year\/|\/films\/diary\/for\/|\/diary\/for\/)\d{4}\/"[^>]*>\s*<span[^>]*>\s*([\d,]+)\s*<\/span>/i) ||
    html.match(/href="\/[^/]+(?:\/year\/|\/films\/diary\/for\/|\/diary\/for\/)\d{4}\/"[^>]*>\s*([\d,]+)\s*this\s*year/i) ||
    html.match(/([\d,]+)\s*this\s*year/i);
  if (thisYearMatch) {
    thisYearCount = parseInt(thisYearMatch[1].replace(/,/g, ''), 10);
  }

  // Use item metadata: LazyPoster images may not exist in the fetched HTML.
  const favSectionMatch = html.match(/<section\b[^>]*id=["']favourites["'][^>]*>([\s\S]*?)<\/section>/i) ||
    html.match(/<section\b[^>]*class=["'][^"']*favourites[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  if (favSectionMatch) {
    for (const film of parseFilmsListHtml(favSectionMatch[1]).slice(0, 4)) {
      favorites.push({ ...film, isFavorite: true });
    }
  }

  return { displayName, bio, totalFilms, filmCountKnown: Boolean(filmsCountMatch), thisYearCount, avatarUrl, favorites };
}
