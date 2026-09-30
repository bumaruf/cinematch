import type { Filters, Recommendation, RecommendationResult, UserProfile } from '../domain/film.ts';
import { analyzeProfile } from '../domain/profile/analyze.ts';
import { createWatchedIndex, toWatchedEntry } from '../domain/profile/watched.ts';
import { dateKey, DAILY_MATCHING_VERSION, pickDaily, profileKey, usernameKey } from '../domain/recommend/daily.ts';
import { recommend } from '../domain/recommend/engine.ts';
import { normalizeTitle, slugKey } from '../domain/text.ts';
import type { AppContext } from './context.ts';
import type { StoredDailyPick } from './ports.ts';
import { GUEST_PROFILE } from './profile.ts';

/** Batches of earlier recommendations kept out of new thematic results. */
const RECENT_BATCHES = 20;
/** Days of earlier daily picks that are not offered again. */
const RECENT_DAILY_PICKS = 45;

export interface RecommendationQuery {
  themeId?: string | null;
  customPrompt?: string;
  /** Per-request filters; saved settings fill in the rest. */
  filters?: Pick<Filters, 'minYear' | 'maxYear' | 'runtimeFilter' | 'nicheOnly'>;
}

function assertUsableHistory(profile: UserProfile): void {
  const synced = profile.films.length;
  const expected = Number(profile.totalFilms || 0);
  if (profile.username && profile.username !== GUEST_PROFILE.username && synced === 0) {
    throw new Error('Não há filmes sincronizados neste perfil. Sincronize seu Letterboxd antes de pedir recomendações.');
  }
  if (expected > 0 && synced < expected) {
    throw new Error(`Histórico incompleto: ${synced} de ${expected} filmes sincronizados. Sincronize novamente antes de pedir recomendações.`);
  }
}

/** Without a theme or prompt, recommends from the user's general taste. */
export async function generateRecommendations(ctx: AppContext, query: RecommendationQuery): Promise<RecommendationResult> {
  const profile = (await ctx.profiles.get()) ?? GUEST_PROFILE;
  assertUsableHistory(profile);

  const settings = await ctx.settings.get();
  const excludeRecent = (await ctx.history.list())
    .slice(0, RECENT_BATCHES)
    .flatMap((entry) => (Array.isArray(entry.movies) ? entry.movies : []))
    .filter((movie) => movie?.title);
  const now = ctx.clock.now();
  const catalog = ctx.catalog();
  const result = recommend(
    {
      profile,
      themeId: query.themeId ?? null,
      customPrompt: query.customPrompt ?? '',
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
    ctx,
  });
  const final = { ...result, recommendations };
  await ctx.history.append({
    id: `rec_${now.getTime()}`,
    timestamp: now.toISOString(),
    theme: final.themeName,
    customPrompt: query.customPrompt ?? '',
    movies: recommendations,
  });
  return final;
}

/**
 * Last line of defense before showing results: never a watched film, never a
 * duplicate, and no recent repeat unless the engine had to reuse them.
 * Watched films are removed even when the engine was allowed to keep them.
 */
function dropRepeated(
  recommendations: Recommendation[],
  profile: UserProfile,
  recent: Recommendation[],
  { allowRecent, ctx }: { allowRecent: boolean; ctx: AppContext },
): Recommendation[] {
  const watched = createWatchedIndex(analyzeProfile(profile, ctx.catalog(), ctx.clock.now()).watchedList);
  const recentIndex = createWatchedIndex(recent.map((movie) => ({ ...toWatchedEntry(movie), catalogSlug: '' })));
  const emitted = new Set<string>();
  return recommendations.filter((movie) => {
    if (!movie?.title || watched.has(movie)) return false;
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
  const today = dateKey(now);
  const key = profileKey(profile);
  const history = await ctx.daily.list(username);
  // "Surpresas" are alternatives. They must never replace the daily pick
  // shown by the dashboard and the Letterboxd button.
  const todayEntries = history.filter((entry) => entry.date === today && entry.data?.film?.letterboxdSlug);
  const cached =
    todayEntries.find((entry) => entry.data.kind === 'daily') ??
    // Before alternatives were stored separately, they had no kind. The
    // oldest entry is the original daily selection; newer ones were refreshes.
    todayEntries.filter((entry) => !entry.data.kind).at(-1);
  if (!options.refresh && cached?.data.matchingVersion === DAILY_MATCHING_VERSION && cached.data.profileKey === key) {
    return { username, profileKey: key, data: cached.data };
  }

  const excludedSlugs = history
    .slice(0, RECENT_DAILY_PICKS)
    .map((entry) => entry.data?.film?.letterboxdSlug)
    .filter(Boolean);
  const pick = pickDaily(profile, ctx.catalog(), { date: today, now, excludedSlugs });
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
  const today = dateKey(now);
  const history = await ctx.daily.list(username);
  const excludedSlugs = [daily.data.film.letterboxdSlug, ...history
    .slice(0, RECENT_DAILY_PICKS)
    .map((entry) => entry.data?.film?.letterboxdSlug)
    .filter(Boolean)];
  const pick = pickDaily(profile, ctx.catalog(), { date: today, now, excludedSlugs });
  const data: StoredDailyPick = { ...pick, profileKey: key, profileUsername: username, kind: 'surprise' };
  await ctx.daily.add({ username, date: today, data });
  return { username: daily.username, profileKey: key, data };
}
