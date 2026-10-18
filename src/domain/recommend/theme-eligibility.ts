import type { CatalogFilm } from '../film.ts';
import { containsPhrase, fold, foldWords } from '../text.ts';
import type { ThemeCriteria } from '../themes/themes.ts';
import { criteriaThemeId } from '../themes/themes.ts';
import { REVIEWED_THEME_EVIDENCE } from '../themes/reviewed-evidence.ts';

export interface ThemeEligibility {
  eligible: boolean;
  /** How many of the theme's descriptive signals the film carries. */
  signalCount: number;
}

const INELIGIBLE: ThemeEligibility = { eligible: false, signalCount: 0 };

/**
 * A theme is a promise to the viewer, not a loose tag: genres, year, votes
 * and rating are hard constraints, and signals are matched against auditable
 * metadata only (synopsis, film-specific keywords and sourced annotations).
 */
export function themeEligibility(film: CatalogFilm, criteria: ThemeCriteria | null, minSignals = criteria?.minSignals ?? 0): ThemeEligibility {
  if (!criteria) return { eligible: true, signalCount: 0 };
  const genres = new Set(film.genres.map(fold));
  const required = (criteria.requiredAnyGenres ?? []).map(fold);
  if (required.length > 0 && !required.some((genre) => genres.has(genre))) return INELIGIBLE;
  if ((criteria.excludedAnyGenres ?? []).map(fold).some((genre) => genres.has(genre))) return INELIGIBLE;
  if (criteria.minYear && film.year < criteria.minYear) return INELIGIBLE;
  if (criteria.maxImdbVotes && (film.imdbVotes || 0) > criteria.maxImdbVotes) return INELIGIBLE;
  // Without votes the score is unknown (ratings not downloaded yet), not low.
  if (criteria.minImdbRating && (film.imdbVotes || 0) > 0 && (film.imdbRating || 0) < criteria.minImdbRating) return INELIGIBLE;

  const reviewed = REVIEWED_THEME_EVIDENCE[film.imdbId];
  const reviewedText = reviewed && (!reviewed.themes || reviewed.themes.includes(criteriaThemeId(criteria) ?? '')) ? reviewed.text : '';
  const texts = [film.pitch.startsWith('Um dos grandes marcos do gênero') ? '' : film.pitch,
    ...(film.keywordEvidence ?? []).filter(entry => entry.source === 'film' || entry.source === 'film-en').map(entry => entry.term),
    reviewedText].filter(Boolean).map(foldWords);
  const matches = (signal: string): boolean => texts.some(text => positivePhrase(text, foldWords(signal)));
  if ([...new Set((criteria.excludedSignals ?? []).map(fold))].some(matches)) return INELIGIBLE;
  if (criteria.requiredSignalGroups?.some(group => !group.some(matches))) return INELIGIBLE;
  const signalCount = [...new Set([...criteria.signals, ...(criteria.requiredSignalGroups ?? []).flat()].map(foldWords))].filter(matches).length;
  return { eligible: signalCount >= minSignals, signalCount };
}

/** Missing style metadata can support proximity, never a claim of an exact fit.
 * Still requires film-specific context and preserves every hard genre constraint.
 */
export function relatedThemeEligibility(film: CatalogFilm, criteria: ThemeCriteria | null): ThemeEligibility {
  if (!criteria?.relatedSignalGroups?.length) return INELIGIBLE;
  return themeEligibility(film, {
    ...criteria,
    requiredSignalGroups: criteria.relatedSignalGroups,
    excludedAnyGenres: [...(criteria.excludedAnyGenres ?? []), ...(criteria.relatedExcludedGenres ?? [])],
    excludedSignals: [...(criteria.excludedSignals ?? []), ...(criteria.relatedExcludedSignals ?? [])],
    minSignals: 2,
  });
}

/** A denied trait and a phrase spanning separate metadata fields are not evidence. */
function positivePhrase(text: string, phrase: string): boolean {
  if (!containsPhrase(text, phrase)) return false;
  const tokens = text.split(' ');
  const wanted = phrase.split(' ');
  return tokens.some((_, index) => tokens.slice(index, index + wanted.length).join(' ') === phrase &&
    !/(?:^| )(?:sem|nao|not|no|without)(?: \w+){0,2}$/.test(tokens.slice(Math.max(0, index - 3), index).join(' ')));
}

/** A contemplative theme is never filled by action, sports or war dramas. */
export function matchesThemePacing(film: CatalogFilm, themeId: string | null): boolean {
  if (themeId !== 'slow-cinema-contemplative') return true;
  const genres = new Set(film.genres.map(fold));
  return !genres.has('action') && !genres.has('sport') && !genres.has('war');
}
