import { createCatalog, type Catalog, type PosterPaths, type RawCatalogFilm } from '../domain/catalog/catalog.ts';

interface CatalogData { films: RawCatalogFilm[]; posters: PosterPaths; normalized?: boolean }

/** One local read/index per worker lifetime, shared by concurrent requests. */
export function createPackagedCatalogLoader(url: string, request: typeof fetch = fetch): () => Promise<Catalog> {
  let pending: Promise<Catalog> | undefined;
  return () => pending ??= (async () => {
    const response = await request(url);
    if (!response.ok || !response.body) throw new Error('Não foi possível carregar o catálogo local. Tente novamente.');
    const data: CatalogData = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if (!Array.isArray(data.films) || !data.posters || typeof data.posters !== 'object') {
      throw new Error('O catálogo local está inválido. Reinstale ou recarregue a extensão.');
    }
    return createCatalog(data.films, data.posters, { normalized: data.normalized === true });
  })().catch((error: unknown) => {
    // A failed read must not poison every subsequent request until Chrome restarts.
    pending = undefined;
    throw error;
  });
}
