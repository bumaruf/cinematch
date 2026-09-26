import type { Catalog } from '../catalog/catalog.ts';
import type { CatalogFilm, Recommendation } from '../film.ts';

/**
 * Catalog slugs come from IMDb titles and do not always exist on
 * Letterboxd, so links open a search instead of a film page.
 */
export function letterboxdSearchUrl(film: { title: string; originalTitle?: string }): string {
  return `https://letterboxd.com/search/${encodeURIComponent(film.originalTitle || film.title)}/`;
}

export function toRecommendation(film: CatalogFilm, catalog: Catalog, affinityReason: string | null = null): Recommendation {
  return {
    title: film.title,
    originalTitle: film.originalTitle || film.title,
    year: film.year,
    director: film.director,
    letterboxdSlug: film.slug,
    catalogSlug: film.slug,
    letterboxdUrl: letterboxdSearchUrl(film),
    posterPath: catalog.posterPath(film.imdbId),
    pitch: film.pitch,
    runtimeMinutes: film.runtime,
    country: film.country,
    genres: film.genres,
    imdbRating: film.imdbRating,
    affinityReason,
  };
}
