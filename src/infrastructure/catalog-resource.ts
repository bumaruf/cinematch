import { createCatalog, type Catalog, type PosterPaths, type RawCatalogFilm } from '../domain/catalog/catalog.ts';
import { unpackFilms, type PackagedFilm } from '../domain/catalog/packaged.ts';
import { applyRatings, type StoredRatings } from '../domain/catalog/ratings.ts';

interface CatalogData { films: RawCatalogFilm[] | PackagedFilm[]; posters: PosterPaths; normalized?: boolean }

/**
 * One local read per worker lifetime, shared by concurrent requests. The
 * index is rebuilt only when the ratings this browser downloaded change
 * (`ratings` must return the same object until then).
 */
export function createPackagedCatalogLoader(
  url: string,
  request: typeof fetch = fetch,
  ratings: () => Promise<StoredRatings | null> = async () => null,
): () => Promise<Catalog> {
  let data: Promise<CatalogData> | undefined;
  let built: { ratings: StoredRatings | null; catalog: Catalog } | undefined;
  const read = () => data ??= (async () => {
    const response = await request(url);
    if (!response.ok || !response.body) throw new Error('Não foi possível carregar o catálogo local. Tente novamente.');
    const parsed: CatalogData = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if (!Array.isArray(parsed.films) || !parsed.posters || typeof parsed.posters !== 'object') {
      throw new Error('O catálogo local está inválido. Reinstale ou recarregue a extensão.');
    }
    if (parsed.normalized === true) unpackFilms(parsed.films as PackagedFilm[]);
    return parsed;
  })().catch((error: unknown) => {
    // A failed read must not poison every subsequent request until Chrome restarts.
    data = undefined;
    throw error;
  });
  let pending: Promise<Catalog> | undefined;
  const load = async (): Promise<Catalog> => {
    // The file is read while the ratings are looked up. Without ratings the
    // catalog still works; scores fall back to the engine's prior.
    const [parsed, current] = await Promise.all([read(), ratings().catch(() => null)]);
    if (built?.ratings !== current) {
      built = { ratings: current, catalog: createCatalog(applyRatings(parsed.films, current?.ratings), parsed.posters, { normalized: parsed.normalized === true }) };
    }
    return built.catalog;
  };
  // Concurrent requests share one load.
  return () => pending ??= load().finally(() => { pending = undefined; });
}
