import type { CatalogFilm, FilmIdentity } from '../film.ts';
import { levenshtein, normalizeSlug, normalizeTitle, slugKey } from '../text.ts';

export interface WatchedEntry {
  title: string;
  year: number | null;
  slug: string;
  catalogSlug: string;
  catalogTitleAmbiguous: boolean;
  rating?: number | null;
  normalizedTitle: string;
}

export interface WatchedIndex {
  has(candidate: FilmIdentity): boolean;
}

const yearsCompatible = (a: number, b: number): boolean => Math.abs(a - b) <= 1;

export function catalogIdentity(film: CatalogFilm): FilmIdentity {
  return {
    title: film.title,
    originalTitle: film.originalTitle,
    year: film.year,
    letterboxdSlug: film.slug,
    catalogSlug: film.slug,
  };
}

/** Builds a watched entry from any record that has a title. */
export function toWatchedEntry(film: FilmIdentity & { rating?: number | null; catalogTitleAmbiguous?: boolean }): WatchedEntry {
  return {
    title: film.title ?? '',
    year: film.year ? Number.parseInt(String(film.year), 10) : null,
    slug: slugKey(film.letterboxdSlug || film.slug),
    catalogSlug: slugKey(film.catalogSlug),
    catalogTitleAmbiguous: Boolean(film.catalogTitleAmbiguous),
    rating: film.rating,
    normalizedTitle: normalizeTitle(film.title),
  };
}

/**
 * Decides whether a candidate is one of the given films. Slugs are
 * authoritative; titles only match when release years are compatible, so a
 * remake with the same title stays eligible.
 */
export function createWatchedIndex(entries: readonly WatchedEntry[]): WatchedIndex {
  const exactSlugs = new Set(entries.flatMap((entry) => [entry.slug, entry.catalogSlug]).filter(Boolean));
  const bySlug = new Map<string, WatchedEntry[]>();
  const byYear = new Map<number, WatchedEntry[]>();
  const unknownYear: WatchedEntry[] = [];
  for (const entry of entries) {
    for (const slug of new Set([entry.slug, entry.catalogSlug].filter(Boolean).map(normalizeSlug))) {
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), entry]);
    }
    if (!entry.year) unknownYear.push(entry);
    else byYear.set(entry.year, [...(byYear.get(entry.year) ?? []), entry]);
  }

  function has(candidate: FilmIdentity): boolean {
    const slug = slugKey(candidate.letterboxdSlug || candidate.slug);
    const catalogSlug = slugKey(candidate.catalogSlug);
    const year = candidate.year ? Number.parseInt(String(candidate.year), 10) : null;
    const slugs = [slug, catalogSlug].filter(Boolean);

    if (!year && slugs.some((value) => exactSlugs.has(value))) return true;

    // Letterboxd sometimes adds a release-year suffix to otherwise identical
    // slugs. Match that variant only when the known years are compatible.
    for (const normalized of new Set(slugs.map(normalizeSlug))) {
      for (const watched of bySlug.get(normalized) ?? []) {
        if (!year || !watched.year || yearsCompatible(year, watched.year)) return true;
      }
    }

    const title = normalizeTitle(candidate.title);
    const originalTitle = normalizeTitle(candidate.originalTitle);
    const pool = year
      ? [...(byYear.get(year - 1) ?? []), ...(byYear.get(year) ?? []), ...(byYear.get(year + 1) ?? []), ...unknownYear]
      : entries;

    for (const watched of pool) {
      if (year && watched.year && !yearsCompatible(year, watched.year)) continue;
      if (watched.catalogTitleAmbiguous) continue;
      // With unambiguous catalog identities on both sides, different slugs
      // are different films even if their Brazilian titles collide.
      if (catalogSlug && watched.catalogSlug && normalizeSlug(catalogSlug) !== normalizeSlug(watched.catalogSlug)) continue;
      const watchedTitle = watched.normalizedTitle;
      if (!watchedTitle) continue;

      if (title === watchedTitle || originalTitle === watchedTitle) return true;

      if (year && watched.year && yearsCompatible(year, watched.year) && watchedTitle.length >= 4) {
        const titles = [title, originalTitle].filter((value) => value.length >= 4);
        if (titles.some((value) => value.includes(watchedTitle) || watchedTitle.includes(value))) return true;
      }

      // Close spelling for typos and slight title differences.
      if (title.length >= 5 && watchedTitle.length >= 5 && Math.abs(title.length - watchedTitle.length) <= 2) {
        const distance = levenshtein(title, watchedTitle);
        if (distance <= 1 || (distance <= 2 && title.length >= 10)) return true;
      }
    }
    return false;
  }

  return { has };
}
