import type { Catalog } from '../catalog/catalog.ts';
import type { DailyPick, FilmIdentity, UserProfile } from '../film.ts';
import { analyzeProfile } from '../profile/analyze.ts';
import { catalogIdentity, createWatchedIndex } from '../profile/watched.ts';
import { createFilmIdentityIndex } from '../profile/identity.ts';
import { analyzeYearPhase } from '../profile/year-phase.ts';
import { createTasteMatcher } from '../taste/taste-match.ts';
import { slugKey } from '../text.ts';
import { toRecommendation } from './recommendation.ts';

/** Bump when the selection rules change, to invalidate cached picks. */
export const DAILY_MATCHING_VERSION = 4;
export const DAILY_TIME_ZONE = 'America/Sao_Paulo';
export const GUEST_USERNAME = 'convidado';

export class NoDailyCandidateError extends Error {
  constructor() {
    super(
      'Não encontrei outro filme com afinidade suficiente. Sincronize suas avaliações e favoritos ou faça uma busca por tema para explorar novos filmes.',
    );
    this.name = 'NoDailyCandidateError';
  }
}

/** The calendar day (YYYY-MM-DD) in the given time zone. */
export function dateKey(now: Date, timeZone = DAILY_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function usernameKey(username: string | null | undefined): string {
  return String(username || GUEST_USERNAME).trim().toLowerCase();
}

/**
 * Changes whenever the watched history changes: a completed sync or import
 * always updates lastSync, so the day's pick is recomputed.
 */
export function profileKey(profile: Partial<UserProfile> | null | undefined): string {
  const films = Array.isArray(profile?.films) ? profile.films.length : 0;
  return `${usernameKey(profile?.username)}|${films}|${String(profile?.lastSync || '')}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export interface DailyOptions {
  date: string;
  now: Date;
  /** Slugs picked on earlier days, kept out for variety. */
  excludedSlugs?: readonly string[];
  excludedFilms?: readonly FilmIdentity[];
}

/**
 * One well-rated unwatched film per user and day. The choice is
 * deterministic for a date, and only strong taste matches compete.
 */
export function pickDaily(profile: UserProfile | null, catalog: Catalog, { date, now, excludedSlugs = [], excludedFilms = [] }: DailyOptions): DailyPick {
  const seed = hashString(`${date}-${(profile?.username || 'cinefilo').toLowerCase()}`);
  const analyzed = analyzeProfile(profile, catalog, now);
  const yearPhase = analyzeYearPhase(profile, catalog, now);
  const matchTaste = createTasteMatcher(profile ?? {}, catalog);
  const watched = createWatchedIndex(analyzed.watchedList);
  const excluded = new Set(excludedSlugs.map(slugKey));
  const blocked = createFilmIdentityIndex(excludedFilms);

  const candidates = catalog.films.flatMap((film) => {
    if (watched.has(catalogIdentity(film)) || blocked.has(catalogIdentity(film)) || excluded.has(slugKey(film.slug))) return [];
    const taste = matchTaste(film);
    if (!taste.eligible || !film.imdbRating || film.imdbRating < 7) return [];
    return [{ film, score: taste.score + film.imdbRating * 0.1, reason: taste.reason }];
  });

  // Keep variety without letting a much weaker candidate leapfrog a better
  // fit simply because the day's seed selected it.
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]?.score ?? 0;
  const pool = candidates.filter((candidate) => candidate.score >= best - 7).slice(0, 6);
  if (pool.length === 0) throw new NoDailyCandidateError();
  const chosen = pool[seed % pool.length];

  return {
    date,
    matchingVersion: DAILY_MATCHING_VERSION,
    film: {
      ...toRecommendation(chosen.film, catalog, chosen.reason),
      imdbRating: chosen.film.imdbRating,
      imdbVotes: chosen.film.imdbVotes,
      vibeKeywords: chosen.film.keywords.slice(0, 5),
    },
    curatorReason: chosen.reason,
    phaseInfo: {
      currentYear: yearPhase.currentYear,
      thisYearCount: yearPhase.thisYearCount,
      topGenres: yearPhase.topGenres.slice(0, 3),
      phaseDescription: yearPhase.phaseDescription,
    },
  };
}
