import type { Catalog } from '../catalog/catalog.ts';
import type { ProfileFilm, UserProfile } from '../film.ts';
import { foldWords, slugKey } from '../text.ts';

export type CsvKind = 'watched' | 'ratings' | 'diary';
export type CsvSource = `csv-${CsvKind}`;

export interface CsvFilm extends ProfileFilm {
  title: string;
  year: number | null;
  rating: number | null;
  slug: string;
  letterboxdUri: string;
  source: CsvSource;
  watchedDate: string | null;
}

export interface MergeResult {
  films: ProfileFilm[];
  removedCount: number;
  addedCount: number;
  updatedRatingCount: number;
  unmatched: ProfileFilm[];
}

export interface SnapshotResult extends MergeResult {
  /** watched.csv was present, so it defines which films were watched. */
  authoritative: boolean;
  profile: UserProfile;
}

/** Legacy imports (source 'csv') invented slugs from titles. */
export const CSV_IDENTITY_VERSION = 3;

const LETTERBOXD_HOSTS = ['letterboxd.com', 'www.letterboxd.com', 'boxd.it'];

function csvRows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((value) => value.trim())) result.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV com aspas não fechadas. Exporte o arquivo novamente.');
  row.push(cell);
  if (row.some((value) => value.trim())) result.push(row);
  return result;
}

/** Parses a Letterboxd export (watched.csv, ratings.csv or diary.csv). */
export function parseProfileCsv(text: string, filename: string): CsvFilm[] {
  const kind = String(filename)
    .toLowerCase()
    .match(/^(watched|ratings|diary)\.csv$/)?.[1] as CsvKind | undefined;
  if (!kind) {
    throw new Error('Selecione watched.csv, ratings.csv ou diary.csv. Watchlist e listas não são histórico de assistidos.');
  }
  const [header = [], ...data] = csvRows(text);
  const headers = header.map((value) => value.trim().toLowerCase());
  const name = headers.indexOf('name');
  const year = headers.indexOf('year');
  const rating = headers.indexOf('rating');
  const uri = headers.indexOf('letterboxd uri');
  const date = headers.indexOf('watched date');
  if (name < 0 || year < 0 || uri < 0 || (kind === 'ratings' && rating < 0)) {
    throw new Error(`Cabeçalho inválido em ${filename}.`);
  }

  return data.map((row, i) => {
    const title = row[name]?.trim() ?? '';
    const rawYear = row[year]?.trim() || '';
    // A missing release year is unknown, not year zero or an invalid film.
    const releaseYear = rawYear ? Number(rawYear) : null;
    const rawRating = rating >= 0 ? row[rating]?.trim() || '' : '';
    const value = rawRating ? Number(rawRating.replace(',', '.')) : null;
    const invalid = !title
      ? 'título vazio'
      : releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1800 || releaseYear > 2200)
        ? `ano inválido: "${rawYear}"`
        : value !== null && (!Number.isFinite(value) || value < 0.5 || value > 5 || (value * 2) % 1)
          ? `nota inválida: "${rawRating}" (esperado: 0,5 a 5, em passos de 0,5)`
          : '';
    if (invalid) {
      throw new Error(`Dados inválidos em ${filename}, registro ${i + 2}${title ? ` (${title})` : ''}: ${invalid}. Nada foi importado.`);
    }
    let url: URL;
    try {
      url = new URL(row[uri]);
    } catch {
      throw new Error(`Link inválido em ${filename}, registro ${i + 2}.`);
    }
    if (!LETTERBOXD_HOSTS.includes(url.hostname)) throw new Error('O CSV contém links que não são do Letterboxd.');
    return {
      title,
      year: releaseYear,
      rating: kind === 'watched' ? null : value,
      slug: url.pathname.match(/^\/film\/([^/]+)\/?$/)?.[1] || '',
      letterboxdUri: url.href,
      source: `csv-${kind}` as const,
      watchedDate: date >= 0 ? row[date] : null,
    };
  });
}

interface Identified extends ProfileFilm {
  slug: string;
  catalogSlug: string;
  identity: string;
  titleIdentity: string;
}

function identify(film: ProfileFilm, catalog: Catalog): Identified {
  // Old imports invented slugs from titles. They are not authoritative IDs.
  const slug = film.source === 'csv' ? '' : slugKey(film.slug || film.letterboxdSlug);
  const resolved = catalog.resolve({ ...film, slug, catalogSlug: '', letterboxdSlug: '' });
  const match = resolved.film && (!film.year || resolved.film.year === Number(film.year)) ? resolved.film : null;
  return {
    ...film,
    slug,
    catalogSlug: match?.slug || '',
    identity: match ? `catalog:${match.slug}` : slug ? `slug:${slug}` : film.letterboxdUri ? `uri:${film.letterboxdUri}` : '',
    titleIdentity: !resolved.ambiguous && film.year ? `${foldWords(film.title)}:${film.year}` : '',
  };
}

const SOURCE_PRIORITY: Record<string, number> = { 'csv-watched': 0, 'csv-diary': 1, 'csv-ratings': 2 };

/**
 * Merges imported films into existing ones, deduplicating by catalog
 * identity, slug, Letterboxd URI and (unambiguous) title + year.
 */
export function mergeProfileFilms(
  catalog: Catalog,
  existing: readonly ProfileFilm[],
  incoming: readonly ProfileFilm[] = [],
  { allowNew = true } = {},
): MergeResult {
  const result: Identified[] = [];
  const identities = new Map<string, number>();
  const titles = new Map<string, Set<number>>();
  const unmatched: ProfileFilm[] = [];
  let removedCount = 0;
  let addedCount = 0;
  let updatedRatingCount = 0;

  const add = (raw: ProfileFilm, imported: boolean): void => {
    const film = identify(raw, catalog);
    const keys = [
      ...new Set(
        [film.identity, film.slug ? `slug:${film.slug}` : '', film.letterboxdUri ? `uri:${film.letterboxdUri}` : ''].filter(Boolean),
      ),
    ];
    let index = keys.map((key) => identities.get(key)).find((value) => value !== undefined);
    if (index === undefined && film.titleIdentity) {
      const candidates = [...(titles.get(film.titleIdentity) ?? [])].filter((i) => {
        const other = result[i];
        if (film.catalogSlug && other.catalogSlug && film.catalogSlug !== other.catalogSlug) return false;
        // Two real different slugs can be distinct films with the same title/year.
        return !(film.slug && other.slug && film.slug !== other.slug && !film.catalogSlug && !other.catalogSlug);
      });
      if (candidates.length === 1) index = candidates[0];
    }
    if (index === undefined) {
      if (imported && !allowNew) {
        unmatched.push(raw);
        return;
      }
      index = result.length;
      result.push(film);
      if (imported) addedCount++;
    } else {
      const old = result[index];
      if (!imported) removedCount++;
      // ratings.csv is the current rating snapshot; diary only fills missing
      // ratings, and watched.csv must never erase them.
      if (film.rating != null && ((imported && film.source === 'csv-ratings') || old.rating == null)) {
        if (old.rating !== film.rating) updatedRatingCount++;
        old.rating = film.rating;
      }
      old.slug ||= film.slug;
      old.catalogSlug ||= film.catalogSlug;
      old.letterboxdUri ||= film.letterboxdUri;
      old.isFavorite = Boolean(old.isFavorite || film.isFavorite);
    }
    for (const key of keys) identities.set(key, index);
    if (film.titleIdentity) {
      const set = titles.get(film.titleIdentity) ?? new Set<number>();
      set.add(index);
      titles.set(film.titleIdentity, set);
    }
  };

  // Prefer web records when repairing legacy duplicates; they retain real slugs.
  [...existing].sort((a, b) => Number(a.source === 'csv') - Number(b.source === 'csv')).forEach((film) => add(film, false));
  [...incoming]
    .sort(
      (a, b) =>
        (SOURCE_PRIORITY[a.source ?? ''] ?? 0) - (SOURCE_PRIORITY[b.source ?? ''] ?? 0) ||
        String(b.watchedDate || '').localeCompare(String(a.watchedDate || '')),
    )
    .forEach((film) => add(film, true));

  return {
    films: result.map(({ identity: _identity, titleIdentity: _titleIdentity, ...film }) => film),
    removedCount,
    addedCount,
    updatedRatingCount,
    unmatched,
  };
}

/**
 * watched.csv is a membership snapshot, not another batch to append. Ratings
 * and diary files enrich that snapshot; unmatched entries are reported.
 */
export function importProfileSnapshot(
  catalog: Catalog,
  base: UserProfile,
  incoming: readonly ProfileFilm[],
  now: Date,
): SnapshotResult {
  const watched = incoming.filter((film) => film.source === 'csv-watched');
  const authoritative = watched.length > 0;
  const baseline = authoritative ? mergeProfileFilms(catalog, [], watched).films : base.films;
  const metadata = authoritative ? mergeProfileFilms(catalog, baseline, base.films, { allowNew: false }).films : baseline;
  const merged = mergeProfileFilms(
    catalog,
    metadata,
    incoming.filter((film) => film.source !== 'csv-watched'),
    { allowNew: baseline.length === 0 },
  );
  return {
    ...merged,
    authoritative,
    profile: {
      ...base,
      films: merged.films,
      totalFilms: merged.films.length,
      csvIdentityVersion: CSV_IDENTITY_VERSION,
      lastFullSync: null,
      lastSync: now.toISOString(),
    },
  };
}

/** Repairs duplicates left by legacy CSV imports (identity version < 2). */
export function needsCsvRepair(profile: UserProfile | null): profile is UserProfile {
  return Boolean(
    profile && !((profile.csvIdentityVersion ?? 0) >= 2) && profile.films?.some((film) => film.source === 'csv'),
  );
}
