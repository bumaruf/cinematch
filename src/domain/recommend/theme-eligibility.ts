import type { CatalogFilm } from '../film.ts';
import { containsPhrase, fold, foldWords } from '../text.ts';
import type { ThemeCriteria } from '../themes/themes.ts';

export interface ThemeEligibility {
  eligible: boolean;
  /** How many of the theme's descriptive signals the film carries. */
  signalCount: number;
}

const INELIGIBLE: ThemeEligibility = { eligible: false, signalCount: 0 };

/**
 * A theme is a promise to the viewer, not a loose tag: genres, year, votes
 * and rating are hard constraints, and signals are matched against auditable
 * metadata only (titles, synopsis and curated keywords).
 */
export function themeEligibility(film: CatalogFilm, criteria: ThemeCriteria | null, minSignals = criteria?.minSignals ?? 0): ThemeEligibility {
  if (!criteria) return { eligible: true, signalCount: 0 };
  const genres = new Set(film.genres.map(fold));
  const required = (criteria.requiredAnyGenres ?? []).map(fold);
  if (required.length > 0 && !required.some((genre) => genres.has(genre))) return INELIGIBLE;
  if ((criteria.excludedAnyGenres ?? []).map(fold).some((genre) => genres.has(genre))) return INELIGIBLE;
  if (criteria.minYear && film.year < criteria.minYear) return INELIGIBLE;
  if (criteria.maxImdbVotes && (film.imdbVotes || 0) > criteria.maxImdbVotes) return INELIGIBLE;
  if (criteria.minImdbRating && (film.imdbRating || 0) < criteria.minImdbRating) return INELIGIBLE;

  const text = foldWords([film.title, film.originalTitle, film.pitch, ...film.keywords].filter(Boolean).join(' '));
  const matches = (signal: string): boolean => containsPhrase(text, foldWords(signal));
  if ([...new Set((criteria.excludedSignals ?? []).map(fold))].some(matches)) return INELIGIBLE;
  const signalCount = [...new Set(criteria.signals.map(fold))].filter(matches).length;
  return { eligible: signalCount >= minSignals, signalCount };
}

/** A contemplative theme is never filled by action, sports or war dramas. */
export function matchesThemePacing(film: CatalogFilm, themeId: string | null): boolean {
  if (themeId !== 'slow-cinema-contemplative') return true;
  const genres = new Set(film.genres.map(fold));
  return !genres.has('action') && !genres.has('sport') && !genres.has('war');
}
