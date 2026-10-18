import type { CatalogFilm, KeywordEvidence } from '../film.ts';
import { tasteTags } from '../taste/taste-match.ts';
import { createCatalog, type PosterPaths, type RawCatalogFilm } from './catalog.ts';
import { withoutRatings } from './ratings.ts';

/** Source fields no runtime code reads; the packaged catalog leaves them out. */
export const UNPACKAGED_FIELDS = ['themes', 'metadataSources', 'originalLanguage'] as const;

/** One letter per keyword source, so the package does not repeat every keyword's text. */
const SOURCE_CODES: Readonly<Record<KeywordEvidence['source'], string>> = {
  film: 'f', 'film-en': 'e', genre: 'g', director: 'd', derived: 'x', legacy: 'l',
};
const SOURCES_BY_CODE = new Map(Object.entries(SOURCE_CODES).map(([source, code]) => [code, source as KeywordEvidence['source']]));

/**
 * A packaged film. When its evidence lists exactly its keywords, in order,
 * `keywordSources` holds one code per keyword in place of `keywordEvidence`.
 * The evidence was about half of the catalog's bytes.
 */
export type PackagedFilm = CatalogFilm & { keywordSources?: string };

export interface PackagedCatalog {
  /** Films were normalized at build time: createCatalog may skip it. */
  normalized: true;
  films: PackagedFilm[];
  posters: PosterPaths;
}

function compactEvidence(film: CatalogFilm): PackagedFilm {
  const evidence = film.keywordEvidence;
  if (!evidence || evidence.length !== film.keywords.length) return film;
  let codes = '';
  for (const [i, entry] of evidence.entries()) {
    const code = SOURCE_CODES[entry.source];
    if (entry.term !== film.keywords[i] || !code) return film;
    codes += code;
  }
  const { keywordEvidence: _evidence, ...rest } = film;
  return { ...rest, keywordSources: codes };
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
    return compactEvidence(packaged);
  });
  return { normalized: true, films, posters };
}

/**
 * Restores `keywordEvidence` on films read from the package, in place. The
 * terms reuse the keyword strings, so the evidence costs little memory.
 */
export function unpackFilms(films: PackagedFilm[]): CatalogFilm[] {
  for (const film of films) {
    const codes = film.keywordSources;
    if (codes === undefined) continue;
    delete film.keywordSources;
    if (codes.length !== film.keywords.length) throw new Error('O catálogo local está inválido. Reinstale ou recarregue a extensão.');
    const evidence: KeywordEvidence[] = new Array(codes.length);
    for (let i = 0; i < codes.length; i++) {
      const source = SOURCES_BY_CODE.get(codes[i]);
      if (!source) throw new Error('O catálogo local está inválido. Reinstale ou recarregue a extensão.');
      evidence[i] = { term: film.keywords[i], source };
    }
    film.keywordEvidence = evidence;
  }
  return films;
}
