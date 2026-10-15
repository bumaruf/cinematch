import type { FilmFeedback, FilmIdentity, Filters, Recommendation, RecommendationResult, UserProfile } from '../domain/film.ts';
import type { Catalog } from '../domain/catalog/catalog.ts';
import { analyzeProfile } from '../domain/profile/analyze.ts';
import { createWatchedIndex, toWatchedEntry } from '../domain/profile/watched.ts';
import { createFilmIdentityIndex } from '../domain/profile/identity.ts';
import { dateKey, DAILY_MATCHING_VERSION, pickDaily, profileKey, usernameKey } from '../domain/recommend/daily.ts';
import { recommend } from '../domain/recommend/engine.ts';
import { normalizeTitle, slugKey } from '../domain/text.ts';
import type { AppContext } from './context.ts';
import type { StoredDailyPick } from './ports.ts';
import { GUEST_PROFILE } from './profile.ts';
import { activeFeedback, timeZoneOf } from './feedback.ts';
import { CURATION_VERSION } from '../domain/recommend/evaluation.ts';
import { isHistoryComplete } from '../domain/profile/completeness.ts';
import { interpretSearch } from './query-model.ts';

/** Batches of earlier recommendations kept out of new thematic results. */
const RECENT_BATCHES = 20;
/** Days of earlier daily picks that are not offered again. */
const RECENT_DAILY_PICKS = 45;

export interface RecommendationQuery {
  themeId?: string | null;
  customPrompt?: string;
  /** Per-request filters; saved settings fill in the rest. */
  filters?: Pick<Filters, 'minYear' | 'maxYear' | 'runtimeFilter' | 'nicheOnly'>;
  username?: string;
}

function assertUsableHistory(profile: UserProfile): void {
  const synced = profile.films.length;
  const expected = Number(profile.totalFilms || 0);
  if (profile.username && profile.username !== GUEST_PROFILE.username && synced === 0 && !(profile.filmCountKnown && expected === 0)) {
    throw new Error('Não há filmes sincronizados neste perfil. Sincronize seu Letterboxd antes de pedir recomendações.');
  }
  if (expected > 0 && !isHistoryComplete(synced, expected)) {
    throw new Error(`Histórico incompleto: ${synced} de ${expected} filmes sincronizados. Sincronize novamente antes de pedir recomendações.`);
  }
}

/** Without a theme or prompt, recommends from the user's general taste. */
export async function generateRecommendations(ctx: AppContext, query: RecommendationQuery): Promise<RecommendationResult> {
  const profile = (await ctx.profiles.get()) ?? GUEST_PROFILE;
  if (query.username && usernameKey(query.username) !== usernameKey(profile.username)) throw new ProfileChangedError();
  assertUsableHistory(profile);

  const settings = await ctx.settings.get();
  const activeUser = usernameKey(profile.username);
  // Older entries have no username; they predate profile switching.
  const excludeRecent = (await ctx.history.list())
    .filter((entry) => !entry.username || entry.username === activeUser)
    .slice(0, RECENT_BATCHES)
    .flatMap((entry) => (Array.isArray(entry.movies) ? entry.movies : []))
    .filter((movie) => movie?.title);
  const now = ctx.clock.now();
  // The model reads the prompt while the catalog loads.
  const [interpretation, catalog] = await Promise.all([
    interpretSearch(ctx, query.customPrompt ?? '', settings.modelQuery),
    ctx.catalog(),
  ]);
  const { excludedFilms, rejectedFilms } = splitFeedback(activeFeedback(await ctx.feedback.list(activeUser), now, timeZoneOf(ctx)));
  const requestId = ctx.identifiers.next();
  const result = recommend(
    {
      profile,
      excludedFilms,
      rejectedFilms,
      seed: requestId,
      themeId: query.themeId ?? null,
      customPrompt: query.customPrompt ?? '',
      searchQuery: interpretation.searchQuery,
      filters: {
        avoidWatched: settings.avoidWatched,
        includeUnderrated: settings.includeUnderrated,
        minVotes: settings.minVotes,
        ...query.filters,
        excludeRecent,
      },
    },
    catalog,
    now,
  );

  const recommendations = dropRepeated(result.recommendations, profile, excludeRecent, {
    allowRecent: Boolean(query.customPrompt) || result.allowRecentFallback,
    avoidWatched: settings.avoidWatched,
    catalog, now,
  });
  const sessionId = `rec_${now.getTime()}_${requestId}`;
  const final: RecommendationResult = { ...result, recommendations, evaluationSessionId: sessionId,
    ...(interpretation.interpretedBy ? { interpretedBy: interpretation.interpretedBy } : {}) };
  if (query.username && usernameKey((await ctx.profiles.get())?.username ?? '') !== usernameKey(query.username)) throw new ProfileChangedError();
  await ctx.history.append({
    id: sessionId,
    username: usernameKey(profile.username),
    evaluationContext: { version: CURATION_VERSION, themeId: query.themeId ?? null, prompt: query.customPrompt ?? '',
      filters: { ...settings, ...query.filters }, profileSize: profile.films.length,
      ratedCount: profile.films.filter(film => typeof film.rating === 'number').length, catalogSize: catalog.info.total,
      interpretation: final.interpretation ?? [] },
    timestamp: now.toISOString(),
    theme: final.themeName,
    customPrompt: query.customPrompt ?? '',
    movies: recommendations,
  });
  return final;
}

/** "Não combina comigo" also teaches the taste model; the rest only excludes. */
function splitFeedback(entries: readonly FilmFeedback[]): { excludedFilms: FilmIdentity[]; rejectedFilms: FilmIdentity[] } {
  return {
    excludedFilms: entries.filter((entry) => entry.kind !== 'not-for-me').map((entry) => entry.film),
    rejectedFilms: entries.filter((entry) => entry.kind === 'not-for-me').map((entry) => entry.film),
  };
}

/**
 * Last line of defense before showing results: respect the watched setting, never a
 * duplicate, and no recent repeat unless the engine had to reuse them.
 */
function dropRepeated(
  recommendations: Recommendation[],
  profile: UserProfile,
  recent: Recommendation[],
  { allowRecent, avoidWatched, catalog, now }: { allowRecent: boolean; avoidWatched: boolean; catalog: Catalog; now: Date },
): Recommendation[] {
  const watched = createWatchedIndex(analyzeProfile(profile, catalog, now).watchedList);
  const recentIndex = createWatchedIndex(recent.map((movie) => ({ ...toWatchedEntry(movie), catalogSlug: '' })));
  const emitted = new Set<string>();
  return recommendations.filter((movie) => {
    if (!movie?.title || (avoidWatched && watched.has(movie))) return false;
    if (!allowRecent && recentIndex.has(movie)) return false;
    const key = `${slugKey(movie.letterboxdSlug)}|${normalizeTitle(movie.title)}|${movie.year || ''}`;
    if (emitted.has(key)) return false;
    emitted.add(key);
    return true;
  });
}

export interface DailyPickResponse {
  username: string;
  profileKey: string;
  data: StoredDailyPick;
}

export class ProfileChangedError extends Error {
  constructor() {
    super('O perfil foi alterado durante o carregamento da indicação.');
    this.name = 'ProfileChangedError';
  }
}

/**
 * The day's pick for the active profile: cached for the day, recomputed when
 * the history changes or a new pick is requested.
 */
export async function getDailyPick(ctx: AppContext, options: { refresh?: boolean; username?: string } = {}): Promise<DailyPickResponse> {
  const profile = (await ctx.profiles.get()) ?? GUEST_PROFILE;
  const username = usernameKey(profile.username);
  if (options.username && usernameKey(options.username) !== username) throw new ProfileChangedError();

  const now = ctx.clock.now();
  const timeZone = timeZoneOf(ctx);
  const today = dateKey(now, timeZone);
  const key = profileKey(profile);
  const history = await ctx.daily.list(username);
  const feedback = activeFeedback(await ctx.feedback.list(username), now, timeZone);
  const excludedFilms = feedback.map((entry) => entry.film);
  const blocked = createFilmIdentityIndex(excludedFilms);
  // "Surpresas" are alternatives. They must never replace the daily pick
  // shown by the dashboard and the Letterboxd button.
  const todayEntries = history.filter((entry) => entry.date === today && entry.data?.film?.letterboxdSlug);
  const cached =
    todayEntries.find((entry) => entry.data.kind === 'daily') ??
    // Before alternatives were stored separately, they had no kind. The
    // oldest entry is the original daily selection; newer ones were refreshes.
    todayEntries.filter((entry) => !entry.data.kind).at(-1);
  if (!options.refresh && cached?.data.matchingVersion === DAILY_MATCHING_VERSION && cached.data.profileKey === key && !blocked.has(cached.data.film)) {
    return { username, profileKey: key, data: cached.data };
  }

  const excludedSlugs = history
    .slice(0, RECENT_DAILY_PICKS)
    .map((entry) => entry.data?.film?.letterboxdSlug)
    .filter(Boolean);
  const rejectedFilms = splitFeedback(feedback).rejectedFilms;
  const pick = pickDaily(profile, await ctx.catalog(), { date: today, now, excludedSlugs, excludedFilms, rejectedFilms });
  const data: StoredDailyPick = { ...pick, profileKey: key, profileUsername: username, kind: 'daily' };
  await ctx.daily.add({ username, date: today, data });
  return { username, profileKey: key, data };
}

/**
 * An extra recommendation for the popup. It is kept in the daily history so
 * later surprises vary, but it never overwrites the canonical Film of the Day.
 */
export async function getSurprisePick(ctx: AppContext, options: { username?: string } = {}): Promise<DailyPickResponse> {
  const daily = await getDailyPick(ctx, options);
  const profile = (await ctx.profiles.get()) ?? GUEST_PROFILE;
  const username = usernameKey(profile.username);
  const key = profileKey(profile);
  if (username !== daily.username || key !== daily.profileKey) throw new ProfileChangedError();
  const now = ctx.clock.now();
  const timeZone = timeZoneOf(ctx);
  const today = dateKey(now, timeZone);
  const history = await ctx.daily.list(username);
  const feedback = activeFeedback(await ctx.feedback.list(username), now, timeZone);
  const excludedFilms = feedback.map((entry) => entry.film);
  const excludedSlugs = [daily.data.film.letterboxdSlug, ...history
    .slice(0, RECENT_DAILY_PICKS)
    .map((entry) => entry.data?.film?.letterboxdSlug)
    .filter(Boolean)];
  const rejectedFilms = splitFeedback(feedback).rejectedFilms;
  const pick = pickDaily(profile, await ctx.catalog(), { date: today, now, excludedSlugs, excludedFilms, rejectedFilms });
  const data: StoredDailyPick = { ...pick, profileKey: key, profileUsername: username, kind: 'surprise' };
  await ctx.daily.add({ username, date: today, data });
  return { username: daily.username, profileKey: key, data };
}
