import type { SavedFilm } from '../../application/ports.ts';
import type { Recommendation } from '../../domain/film.ts';
import { letterboxdSearchUrl } from '../../domain/recommend/recommendation.ts';
import { send } from '../../messaging/client.ts';
import { safeUrl } from './html.ts';

/** Anything the UI shows as a film: a recommendation or a saved entry. */
export type FilmLike = Partial<Recommendation> & Pick<SavedFilm, 'title'> & { slug?: string; year?: number | null };

export function letterboxdLink(film: FilmLike): string {
  return safeUrl(film.letterboxdUrl || letterboxdSearchUrl(film));
}

/** A focused YouTube search avoids guessing which upload is the official trailer. */
export function trailerSearchUrl(film: FilmLike): string {
  const identity = [film.originalTitle || film.title, film.year, film.director].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${identity} official trailer`)}`;
}

export function differentOriginalTitle(film: FilmLike): string {
  return film.originalTitle && film.originalTitle.toLowerCase() !== film.title.toLowerCase() ? film.originalTitle : '';
}

/** "Dir. X · 120 min · Brasil", skipping unknown parts. */
export function filmMeta(film: FilmLike, { separator = ' · ', includeYear = false, includeOriginal = false } = {}): string {
  const original = includeOriginal ? differentOriginalTitle(film) : '';
  return [
    includeYear ? film.year : '',
    original ? `Original: ${original}` : '',
    film.director ? `Dir. ${film.director}` : '',
    film.runtimeMinutes ? `${film.runtimeMinutes} min` : '',
    film.country,
  ]
    .filter(Boolean)
    .join(separator);
}

const TMDB_PATH = /^\/[A-Za-z0-9._-]+$/;

export function tmdbPosterUrl(path: string | undefined, size: 'w185' | 'w342' = 'w342'): string {
  const value = String(path ?? '').trim();
  return TMDB_PATH.test(value) ? `https://image.tmdb.org/t/p/${size}${value}` : '';
}

function posterKey(film: FilmLike): string {
  return String(film.letterboxdSlug || film.catalogSlug || film.slug || film.title || '');
}

function place(container: HTMLElement, key: string, src: string, alt: string, onError?: () => void, onLoad?: (src: string) => void): void {
  const image = new Image();
  image.alt = alt;
  image.width = 342;
  image.height = 513;
  // Detached images must load before the handler inserts them.
  image.loading = 'eager';
  image.className = 'size-full object-cover animate-[rise_0.3s_ease-out] motion-reduce:animate-none';
  image.addEventListener(
    'load',
    () => {
      if (container.dataset.posterKey !== key) return;
      container.replaceChildren(image);
      onLoad?.(src);
    },
    { once: true },
  );
  if (onError) image.addEventListener('error', () => container.dataset.posterKey === key && onError(), { once: true });
  image.src = src;
}

/**
 * Fills a poster container: the catalog's TMDB poster first, then the
 * Letterboxd page artwork. The container keeps its fallback otherwise, and a
 * late response never overwrites a container reused for another film.
 */
export function hydratePoster(
  container: HTMLElement | null,
  film: FilmLike,
  size: 'w185' | 'w342' = 'w342',
  onLoad?: (src: string) => void,
): void {
  if (!container) return;
  const key = posterKey(film);
  container.dataset.posterKey = key;
  const alt = `Pôster de ${film.title}`;
  const fromLetterboxd = async (): Promise<void> => {
    const slug = film.letterboxdSlug || film.slug;
    if (!slug) return;
    try {
      const url = await send('getFilmArtwork', { slug });
      if (url && container.dataset.posterKey === key) place(container, key, safeUrl(url, ''), alt, undefined, onLoad);
    } catch {
      // Keep the neutral fallback.
    }
  };
  const tmdb = tmdbPosterUrl(film.posterPath, size);
  if (tmdb) place(container, key, tmdb, alt, () => void fromLetterboxd(), onLoad);
  else void fromLetterboxd();
}
