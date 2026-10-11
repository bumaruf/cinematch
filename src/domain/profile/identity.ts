import type { FilmIdentity } from '../film.ts';
import { fold, normalizeSlug, normalizeTitle } from '../text.ts';

/** Explicit user actions need exact identities, never typo/substring matching. */
export function createFilmIdentityIndex(films: readonly FilmIdentity[]) {
  const imdbIds = new Set(films.map(film => fold(film.imdbId)).filter(Boolean));
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
      const imdbId = fold(candidate.imdbId);
      if (imdbId && imdbIds.has(imdbId)) return true;
      const compatible = (film: FilmIdentity): boolean => (!imdbId || !film.imdbId || imdbId === fold(film.imdbId)) && yearsMatch(candidate, film);
      const candidateSlugs = slugsOf(candidate);
      for (const slug of candidateSlugs) if ((bySlug.get(slug) ?? []).some(compatible)) return true;
      for (const title of new Set([candidate.title, candidate.originalTitle].filter(Boolean).map(normalizeTitle))) {
        if ((byTitle.get(title) ?? []).some((film) => compatible(film) && (!candidateSlugs.length || !slugsOf(film).length))) return true;
      }
      return false;
    },
  };
}
