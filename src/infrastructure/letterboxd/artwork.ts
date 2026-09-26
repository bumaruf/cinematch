import type { ArtworkSource } from '../../application/ports.ts';
import { LETTERBOXD_ORIGIN } from './http.ts';

const CACHE_LIMIT = 200;

export function parseOgImage(html: string): string {
  const match =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return match?.[1]?.replace(/&amp;/g, '&') ?? '';
}

/** Poster of a film page, for films the local catalog has no TMDB poster for. */
export function letterboxdArtwork(fetchImpl: typeof fetch = fetch): ArtworkSource {
  const cache = new Map<string, string>();
  return {
    async artworkUrl(slug) {
      const safeSlug = String(slug || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '');
      if (!safeSlug) return '';
      const cached = cache.get(safeSlug);
      if (cached !== undefined) return cached;
      try {
        const response = await fetchImpl(`${LETTERBOXD_ORIGIN}/film/${safeSlug}/`);
        if (!response.ok) return '';
        const url = parseOgImage(await response.text());
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        cache.set(safeSlug, url);
        return url;
      } catch {
        return '';
      }
    },
  };
}
