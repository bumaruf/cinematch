import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statSync } from 'node:fs';
import type { Plugin } from 'vite';
import { packageCatalog } from '../../src/domain/catalog/packaged.ts';

/** Package data as data: MV3 service workers cannot use dynamic import(). */
export function catalogAsset(): Plugin {
  const moduleId = 'virtual:cinematch-catalog-url';
  const resolvedId = `\0${moduleId}`;
  const resourcePath = '/@cinematch/catalog.json.gz';
  let root: string;
  let serving = false;
  let cached: { stamp: string; bytes: Buffer } | undefined;
  async function contents() {
    const sources = ['src/data/films-dataset.js', 'src/data/poster-catalog.js'].map(path => resolve(root, path));
    const stamps = sources.map(path => statSync(path).mtimeMs);
    const stamp = stamps.join('|');
    if (cached?.stamp === stamp) return { sources, bytes: cached.bytes };
    // Refresh data regenerated while the dev server runs, without a new module
    // and gzip allocation for every request of an unchanged catalog.
    const modules = await Promise.all(sources.map((path, i) => import(`${pathToFileURL(path).href}?catalog=${stamps[i]}`)));
    // Normalized, trimmed and with precomputed taste tags: work every
    // service worker start would otherwise repeat.
    const bytes = gzipSync(JSON.stringify(packageCatalog(modules[0].EXPANDED_FILM_DATABASE, modules[1].POSTER_PATHS_BY_IMDB_ID)));
    cached = { stamp, bytes };
    return { sources, bytes };
  }
  return {
    name: 'cinematch-catalog-asset',
    configResolved(config) { root = config.root; serving = config.command === 'serve'; },
    resolveId(id) { if (id === moduleId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return;
      if (serving) return `export default new URL(${JSON.stringify(resourcePath)}, import.meta.url).href;`;
      const { sources, bytes } = await contents();
      for (const path of sources) this.addWatchFile(path);
      const reference = this.emitFile({ type: 'asset', name: 'catalog.json.gz', source: bytes });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    configureServer(server) {
      server.middlewares.use(resourcePath, async (_request, response, next) => {
        try {
          const { bytes } = await contents();
          response.setHeader('Content-Type', 'application/gzip');
          response.end(bytes);
        } catch (error) { next(error); }
      });
    },
  };
}
