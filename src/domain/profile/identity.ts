import type { FilmIdentity } from '../film.ts';
import { normalizeSlug, normalizeTitle } from '../text.ts';

/** Explicit user actions need exact identities, never typo/substring matching. */
export function createFilmIdentityIndex(films: readonly FilmIdentity[]) {
  const bySlug = new Map<string, FilmIdentity[]>();
  const byTitle = new Map<string, FilmIdentity[]>();
  const slugsOf = (film: FilmIdentity): string[] => [...new Set([film.catalogSlug, film.letterboxdSlug, film.slug].filter(Boolean).map(normalizeSlug))];
  const yearsMatch = (a: FilmIdentity, b: FilmIdentity): boolean => !a.year || !b.year || Number(a.year) === Number(b.year);
  for (const film of films) {
    for (const slug of slugsOf(film)) bySlug.set(slug, [...(bySlug.get(slug) ?? []), film]);
    for (const title of new Set([film.title, film.originalTitle].filter(Boolean).map(normalizeTitle))) byTitle.set(title, [...(byTitle.get(title) ?? []), film]);
  }
  return {
    has(candidate: FilmIdentity): boolean {
      const candidateSlugs = slugsOf(candidate);
      for (const slug of candidateSlugs) if ((bySlug.get(slug) ?? []).some((film) => yearsMatch(candidate, film))) return true;
      for (const title of new Set([candidate.title, candidate.originalTitle].filter(Boolean).map(normalizeTitle))) {
        if ((byTitle.get(title) ?? []).some((film) => yearsMatch(candidate, film) && (!candidateSlugs.length || !slugsOf(film).length))) return true;
      }
      return false;
    },
  };
}
