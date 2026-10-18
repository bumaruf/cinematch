import type { CatalogFilm } from '../film.ts';
import { tasteTags } from '../taste/taste-match.ts';
import { createCatalog, type PosterPaths, type RawCatalogFilm } from './catalog.ts';
import { withoutRatings } from './ratings.ts';

/** Source fields no runtime code reads; the packaged catalog leaves them out. */
export const UNPACKAGED_FIELDS = ['themes', 'metadataSources', 'originalLanguage'] as const;

export interface PackagedCatalog {
  /** Films were normalized at build time: createCatalog may skip it. */
  normalized: true;
  films: CatalogFilm[];
  posters: PosterPaths;
}

/**
 * What the extension ships: normalized films without unused fields, with
 * the taste tags each worker start used to recompute for the whole catalog.
 * IMDb scores never ship: each browser downloads them (see ratings.ts).
 * Pure, so the build can run it and tests can compare it with runtime results.
 */
export function packageCatalog(rawFilms: readonly RawCatalogFilm[], posters: PosterPaths): PackagedCatalog {
  const catalog = createCatalog(rawFilms.map(withoutRatings), posters);
  const films = catalog.films.map((film) => {
    const packaged: CatalogFilm = { ...film, tasteTags: [...tasteTags(film, catalog)] };
    for (const field of UNPACKAGED_FIELDS) delete packaged[field];
    return packaged;
  });
  return { normalized: true, films, posters };
}
