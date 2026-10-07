import type { CatalogFilm, EnrichedFilm, FilmIdentity, ProfileFilm } from '../film.ts';
import { fold, normalizeSlug, normalizeTitle } from '../text.ts';
import { normalizeGenres } from './genres.ts';

export interface CatalogInfo {
  total: number;
  unknownCountries: number;
  missingImdbIds: number;
}

/** Folded, reusable representation of a film for free-text matching. */
export interface CatalogSearchDocument {
  title: string;
  originalTitle: string;
  director: string;
  country: string;
  pitch: string;
  genres: string;
  keywords: readonly string[];
  searchable: string;
}

export interface Resolution {
  film: CatalogFilm | null;
  /** The title matched several catalog films, so no identity was assumed. */
  ambiguous: boolean;
}

export interface Catalog {
  readonly films: readonly CatalogFilm[];
  readonly info: CatalogInfo;
  /** Resolves a profile entry only when its identity is unambiguous. */
  resolve(film: FilmIdentity): Resolution;
  /** Completes a profile film with metadata from its catalog match. */
  enrich(film: ProfileFilm): EnrichedFilm;
  bySlug(slug: string): CatalogFilm | undefined;
  /** Union of films carrying at least one canonical genre, in catalog order. */
  filmsWithAnyGenre(genres: readonly string[]): readonly CatalogFilm[];
  /** Pre-normalized fields used by repeated free-text searches. */
  searchDocument(film: CatalogFilm): CatalogSearchDocument;
  /** TMDB poster path, or '' when unknown. */
  posterPath(imdbId: string): string;
  /** How many catalog films carry this (folded) keyword. */
  keywordFrequency(keyword: string): number;
}

/** Shape of the generated dataset, before normalization. */
export type RawCatalogFilm = Omit<CatalogFilm, 'country'> & { country: string };

export type PosterPaths = Readonly<Record<string, string | null>>;

function addTo<K, V>(index: Map<K, V[]>, key: K, value: V): void {
  if (!key) return;
  const values = index.get(key);
  if (values) values.push(value);
  else index.set(key, [value]);
}

function uniqueMatch(candidates: readonly CatalogFilm[], year: unknown): CatalogFilm | null {
  const matches = year ? candidates.filter((film) => film.year === Number(year)) : candidates;
  return matches.length === 1 ? matches[0] : null;
}

export function normalizeCatalogFilm(film: RawCatalogFilm): CatalogFilm {
  return {
    ...film,
    genres: normalizeGenres(film.genres),
    country: film.country === 'Internacional' ? '' : film.country,
  };
}

export function createCatalog(rawFilms: readonly RawCatalogFilm[], posters: PosterPaths = {}): Catalog {
  const films = rawFilms.map(normalizeCatalogFilm);
  const bySlug = new Map(films.map((film) => [film.slug, film]));
  const byNormalizedSlug = new Map<string, CatalogFilm[]>();
  const byTitle = new Map<string, CatalogFilm[]>();
  const byYear = new Map<number, CatalogFilm[]>();
  const byGenre = new Map<string, CatalogFilm[]>();
  const catalogPosition = new WeakMap<CatalogFilm, number>();
  const searchDocuments = new WeakMap<CatalogFilm, CatalogSearchDocument>();
  for (const [position, film] of films.entries()) {
    catalogPosition.set(film, position);
    addTo(byNormalizedSlug, normalizeSlug(film.slug), film);
    addTo(byYear, film.year, film);
    for (const title of new Set([film.title, film.originalTitle].filter(Boolean).map(normalizeTitle))) {
      addTo(byTitle, title, film);
    }
    for (const genre of new Set(film.genres.map(fold))) addTo(byGenre, genre, film);

  }

  let frequency: Map<string, number> | null = null;
  const keywordFrequencies = (): Map<string, number> => {
    if (frequency) return frequency;
    frequency = new Map();
    for (const film of films) {
      for (const keyword of new Set(film.keywords.map(fold))) {
        frequency.set(keyword, (frequency.get(keyword) ?? 0) + 1);
      }
    }
    return frequency;
  };

  function resolve(film: FilmIdentity): Resolution {
    const rawSlug = film.catalogSlug || film.slug || film.letterboxdSlug || '';
    const direct = bySlug.get(rawSlug) ?? uniqueMatch(byNormalizedSlug.get(normalizeSlug(rawSlug)) ?? [], film.year);
    if (direct) return { film: direct, ambiguous: false };

    const title = normalizeTitle(film.title);
    if (!title) return { film: null, ambiguous: false };

    const exact = byTitle.get(title) ?? [];
    const exactMatch = uniqueMatch(exact, film.year);
    if (exactMatch) return { film: exactMatch, ambiguous: false };
    if (exact.length > 0) return { film: null, ambiguous: true };

    // Some Letterboxd exports omit franchise prefixes (for example, “The
    // Empire Strikes Back”). Accept a contained alias only when its year and
    // title resolve exactly one catalog film.
    if (title.length >= 8 && film.year) {
      const aliases = (byYear.get(Number(film.year)) ?? []).filter((candidate) =>
        [candidate.title, candidate.originalTitle]
          .filter(Boolean)
          .map(normalizeTitle)
          .some((alias) => alias.includes(title) || title.includes(alias)),
      );
      if (aliases.length === 1) return { film: aliases[0], ambiguous: false };
      if (aliases.length > 1) return { film: null, ambiguous: true };
    }
    return { film: null, ambiguous: false };
  }

  function enrich(film: ProfileFilm): EnrichedFilm {
    const { film: metadata, ambiguous } = resolve(film);
    return {
      ...film,
      catalogSlug: metadata?.slug ?? '',
      catalogTitleAmbiguous: ambiguous,
      director: film.director || metadata?.director || '',
      genres: normalizeGenres(film.genres?.length ? film.genres : (metadata?.genres ?? [])),
      keywords: film.keywords?.length ? film.keywords : (metadata?.keywords ?? []),
      keywordEvidence: film.keywordEvidence ?? metadata?.keywordEvidence,
      pitch: film.pitch || metadata?.pitch || '',
      runtime: film.runtime || metadata?.runtime || null,
      country: film.country || metadata?.country || '',
    };
  }

  return {
    films,
    info: {
      total: films.length,
      unknownCountries: films.filter((film) => !film.country).length,
      missingImdbIds: films.filter((film) => !film.imdbId).length,
    },
    resolve,
    enrich,
    bySlug: (slug) => bySlug.get(slug),
    filmsWithAnyGenre: (genres) => {
      if (genres.length === 0) return films;
      const matches = new Set(genres.flatMap((genre) => byGenre.get(fold(genre)) ?? []));
      return [...matches].sort((a, b) => (catalogPosition.get(a) ?? 0) - (catalogPosition.get(b) ?? 0));
    },
    searchDocument: (film) => {
      let searchDoc = searchDocuments.get(film);
      if (searchDoc) return searchDoc;
      if (!catalogPosition.has(film)) throw new Error('O filme não pertence a este catálogo.');
      const title = fold(film.title);
      const originalTitle = fold(film.originalTitle);
      const director = fold(film.director);
      const country = fold(film.country);
      const pitch = fold(film.pitch);
      const genres = film.genres.map(fold).join(' ');
      const keywords = film.keywords.map(fold);
      searchDoc = {
        title,
        originalTitle,
        director,
        country,
        pitch,
        genres,
        keywords,
        searchable: [title, originalTitle, director, country, pitch, keywords.join(' ')].join(' '),
      };
      searchDocuments.set(film, searchDoc);
      return searchDoc;
    },
    posterPath: (imdbId) => posters[imdbId] ?? '',
    keywordFrequency: (keyword) => keywordFrequencies().get(keyword) ?? 0,
  };
}
