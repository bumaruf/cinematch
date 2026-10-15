import type { Catalog } from '../catalog/catalog.ts';
import type { CatalogFilm, FilmIdentity, UserProfile } from '../film.ts';
import { analyzeProfile, type AnalyzedProfile } from '../profile/analyze.ts';
import { catalogIdentity, createWatchedIndex, type WatchedIndex } from '../profile/watched.ts';
import { createTasteMatcher, type TasteMatcher } from '../taste/taste-match.ts';

/**
 * Everything derived from one version of a profile that recommendations need.
 * Building it costs more than a recommendation itself, and the taste matcher
 * memoizes each film it scores, so callers may keep it while nothing changes.
 */
export interface PreparedProfile {
  analyzed: AnalyzedProfile;
  watched: WatchedIndex;
  matchTaste: TasteMatcher;
  /** watched.has for a catalog film, memoized: every request asks it of the whole catalog. */
  isWatched(film: CatalogFilm): boolean;
}

export function prepareProfile(
  profile: UserProfile | null,
  catalog: Catalog,
  now: Date,
  { rejected = [] }: { rejected?: readonly FilmIdentity[] } = {},
): PreparedProfile {
  const analyzed = analyzeProfile(profile, catalog, now);
  const watched = createWatchedIndex(analyzed.watchedList);
  const seen = new WeakMap<CatalogFilm, boolean>();
  return {
    analyzed,
    watched,
    matchTaste: createTasteMatcher(profile ?? {}, catalog, { rejected }),
    isWatched(film) {
      let result = seen.get(film);
      if (result === undefined) {
        result = watched.has(catalogIdentity(film));
        seen.set(film, result);
      }
      return result;
    },
  };
}

/** Identifies the inputs of prepareProfile: same key, same prepared profile. */
export function preparationKey(profile: UserProfile | null, rejected: readonly FilmIdentity[] = []): string {
  let hash = 0;
  const mix = (text: string): void => {
    for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  };
  for (const film of profile?.films ?? []) mix(`${film.slug ?? film.title}:${film.rating ?? ''}:${film.isFavorite ? 1 : 0};`);
  for (const film of profile?.favorites ?? []) mix(`f:${film.slug ?? film.title};`);
  for (const film of rejected) mix(`r:${film.imdbId ?? ''}:${film.catalogSlug ?? film.slug ?? film.title};`);
  return `${profile?.username ?? ''}|${profile?.films.length ?? 0}|${hash}`;
}
