import type { CatalogFilm, KeywordEvidence } from '../film.ts';

/**
 * IMDb ratings by IMDb id, as [rating, votes]. The extension never ships them:
 * each user's browser downloads IMDb's ratings file for its own use (IMDb's
 * datasets are licensed for personal, non-commercial use only).
 */
export type FilmRatings = Readonly<Record<string, readonly [rating: number, votes: number]>>;

export interface StoredRatings {
  /** ISO date of the download. */
  fetchedAt: string;
  ratings: FilmRatings;
}

/** IMDb refreshes the file daily; a monthly download keeps scores current enough. */
export const RATINGS_MAX_AGE_DAYS = 30;

export function ratingsAreStale(stored: StoredRatings | null, now: Date): boolean {
  if (!stored) return true;
  const fetched = Date.parse(stored.fetchedAt);
  return !Number.isFinite(fetched) || now.getTime() - fetched > RATINGS_MAX_AGE_DAYS * 86_400_000;
}

/**
 * Collects the ratings of the given films from lines of IMDb's
 * title.ratings.tsv ("tconst\taverageRating\tnumVotes"). The header and
 * malformed lines are skipped.
 */
export function collectRatings(lines: Iterable<string>, imdbIds: ReadonlySet<string>, into: Record<string, [number, number]> = {}): Record<string, [number, number]> {
  for (const line of lines) {
    const [id, rating, votes] = line.split('\t');
    if (!id || !imdbIds.has(id)) continue;
    const score = Number(rating);
    const count = Number(votes);
    if (Number.isFinite(score) && Number.isInteger(count) && score >= 0 && score <= 10 && count >= 0) into[id] = [score, count];
  }
  return into;
}

/** Keywords that describe a score, never the film itself; only ratings justify them. */
export function ratingKeywords(rating: number, votes: number): string[] {
  const keywords: string[] = [];
  if (rating >= 8.0) keywords.push('aclamado');
  if (rating >= 8.5) keywords.push('obra-prima', 'masterpiece');
  if (rating >= 9.0) keywords.push('cult');
  if (votes >= 500_000) keywords.push('popular');
  return keywords;
}

const RATING_KEYWORDS = new Set(['aclamado', 'obra-prima', 'masterpiece', 'cult', 'popular']);

function isRatingKeyword(term: string, evidence: readonly KeywordEvidence[] | undefined): boolean {
  if (!RATING_KEYWORDS.has(term.toLowerCase())) return false;
  // Without provenance, a score word is assumed to come from a score.
  const source = evidence?.find((entry) => entry.term.toLowerCase() === term.toLowerCase())?.source;
  return !source || source === 'derived';
}

/** The film without its IMDb score or the keywords derived from it. */
export function withoutRatings<T extends CatalogFilm>(film: T): T {
  const keywords = film.keywords.filter((term) => !isRatingKeyword(term, film.keywordEvidence));
  const stripped: T = { ...film, imdbRating: 0, imdbVotes: 0, keywords };
  if (film.keywordEvidence) {
    stripped.keywordEvidence = film.keywordEvidence.filter((entry) => !isRatingKeyword(entry.term, film.keywordEvidence));
  }
  return stripped;
}

/** The ratings these films carry; for tools and tests that start from rated data. */
export function ratingsOf(films: readonly CatalogFilm[]): FilmRatings {
  const ratings: Record<string, [number, number]> = {};
  for (const film of films) if (film.imdbId && film.imdbVotes > 0) ratings[film.imdbId] = [film.imdbRating, film.imdbVotes];
  return ratings;
}

/**
 * Films with the user's downloaded ratings. A film without a rating keeps
 * score 0 and 0 votes, which the engine shrinks to its neutral prior.
 */
export function applyRatings<T extends CatalogFilm>(films: readonly T[], ratings: FilmRatings | null | undefined): T[] {
  if (!ratings) return [...films];
  return films.map((film) => {
    const rated = film.imdbId ? ratings[film.imdbId] : undefined;
    if (!rated) return film;
    const [imdbRating, imdbVotes] = rated;
    const added = ratingKeywords(imdbRating, imdbVotes).filter((term) => !film.keywords.includes(term));
    if (!added.length) return { ...film, imdbRating, imdbVotes };
    return {
      ...film,
      imdbRating,
      imdbVotes,
      keywords: [...film.keywords, ...added],
      // Marked derived, so taste matching never treats a score as a theme.
      keywordEvidence: [...(film.keywordEvidence ?? []), ...added.map((term) => ({ term, source: 'derived' as const }))],
    };
  });
}
