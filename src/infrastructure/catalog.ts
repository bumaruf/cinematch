import { EXPANDED_FILM_DATABASE } from '../data/films-dataset.js';
import { POSTER_PATHS_BY_IMDB_ID } from '../data/poster-catalog.js';
import { createCatalog, type Catalog } from '../domain/catalog/catalog.ts';

let catalog: Catalog | null = null;

/** Synchronous adapter for Node diagnostics and tests; not imported by the worker. */
export function loadCatalog(): Catalog {
  catalog ??= createCatalog(EXPANDED_FILM_DATABASE, POSTER_PATHS_BY_IMDB_ID);
  return catalog;
}
