import type { FilmFeedback, FilmIdentity, Filters, Recommendation, RecommendationResult, UserProfile } from '../domain/film.ts';
import type { Catalog } from '../domain/catalog/catalog.ts';
import { createWatchedIndex, toWatchedEntry, type WatchedIndex } from '../domain/profile/watched.ts';
import { prepareProfile, preparationKey, type PreparedProfile } from '../domain/recommend/prepared.ts';
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
import { interpretSearch, prepareSearchModel } from './query-model.ts';

/** Batches of earlier recommendations kept out of new thematic results. */
const RECENT_BATCHES = 20;
/** Days of earlier daily picks that are not offered again. */
const RECENT_DAILY_PICKS = 45;

/** One prepared profile per catalog instance, which lives as long as the worker. */
const preparations = new WeakMap<Catalog, { key: string; prepared: PreparedProfile }>();

/**
 * The derived profile data for these inputs. Kept while the profile and the
 * "Não combina comigo" list stay the same, so the taste matcher's per-film
 * scores carry over from one request to the next.
 */
function preparedFor(profile: UserProfile, catalog: Catalog, now: Date, rejected: readonly FilmIdentity[]): PreparedProfile {
  const key = preparationKey(profile, rejected);
  const cached = preparations.get(catalog);
  if (cached?.key === key) return cached.prepared;
  const prepared = prepareProfile(profile, catalog, now, { rejected });
  preparations.set(catalog, { key, prepared });
  return prepared;
}

export interface RecommendationQuery {
  themeId?: string | null;
  customPrompt?: string;
  /**
   * Per-request filters; saved settings fill in the rest. A minVotes here
   * applies to this request only and leaves the saved setting unchanged.
   */
  filters?: Pick<Filters, 'minYear' | 'maxYear' | 'runtimeFilter' | 'nicheOnly' | 'minVotes'>;
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
  markActivity(ctx);
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
  const prepared = preparedFor(profile, catalog, now, rejectedFilms);
  const result = recommend(
    {
      profile,
      prepared,
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

  const recommendations = dropRepeated(result.recommendations, prepared.watched, excludeRecent, {
    allowRecent: Boolean(query.customPrompt) || result.allowRecentFallback,
    avoidWatched: settings.avoidWatched,
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
  watched: WatchedIndex,
  recent: Recommendation[],
  { allowRecent, avoidWatched }: { allowRecent: boolean; avoidWatched: boolean },
): Recommendation[] {
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
  if (options.refresh) return computeDailyPick(ctx, options);
  // The warm-up and a page may ask at once; computing twice would store two picks.
  dailyInFlight ??= computeDailyPick(ctx, options).finally(() => { dailyInFlight = undefined; });
  const pending = dailyInFlight;
  const response = await pending;
  if (options.username && usernameKey(options.username) !== response.username) throw new ProfileChangedError();
  return response;
}

let dailyInFlight: Promise<DailyPickResponse> | undefined;

async function computeDailyPick(ctx: AppContext, options: { refresh?: boolean; username?: string }): Promise<DailyPickResponse> {
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
  const catalog = await ctx.catalog();
  const prepared = preparedFor(profile, catalog, now, rejectedFilms);
  const pick = pickDaily(profile, catalog, { date: today, now, excludedSlugs, excludedFilms, rejectedFilms, prepared });
  const data: StoredDailyPick = { ...pick, profileKey: key, profileUsername: username, kind: 'daily' };
  await ctx.daily.add({ username, date: today, data });
  return { username, profileKey: key, data };
}

/**
 * An extra recommendation for the popup. It is kept in the daily history so
 * later surprises vary, but it never overwrites the canonical Film of the Day.
 */
export async function getSurprisePick(ctx: AppContext, options: { username?: string } = {}): Promise<DailyPickResponse> {
  markActivity(ctx);
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
  const catalog = await ctx.catalog();
  const prepared = preparedFor(profile, catalog, now, rejectedFilms);
  const pick = pickDaily(profile, catalog, { date: today, now, excludedSlugs, excludedFilms, rejectedFilms, prepared });
  const data: StoredDailyPick = { ...pick, profileKey: key, profileUsername: username, kind: 'surprise' };
  await ctx.daily.add({ username, date: today, data });
  return { username: daily.username, profileKey: key, data };
}

/** Background work waits until requests have stopped for this long. */
const IDLE_MS = 3000;
let lastActivity = 0;

/** Called by user-facing requests, so background work never competes with them. */
function markActivity(ctx: AppContext): void {
  lastActivity = ctx.clock.now().getTime();
}

/** Runs task once no request has arrived for IDLE_MS; checks again otherwise. */
function whenIdle(ctx: AppContext, task: () => Promise<unknown>): void {
  const wait = lastActivity + IDLE_MS - ctx.clock.now().getTime();
  if (wait > 0) {
    setTimeout(() => whenIdle(ctx, task), wait);
    return;
  }
  void task().catch(() => {
    // Best effort: the request that needs the data reports any failure.
  });
}

const idleWorkScheduled = new WeakSet<Catalog>();

/** Films indexed per background step: a few tens of milliseconds each. */
const SEARCH_INDEX_STEP = 1500;

/**
 * Builds the text search index in short steps, each one waiting for an idle
 * moment, so a click in the meantime is answered between steps.
 */
function buildSearchIndex(ctx: AppContext, catalog: Catalog): Promise<void> {
  return new Promise((resolve) => {
    const step = (): void => whenIdle(ctx, async () => {
      if (catalog.buildSearchVocabulary(SEARCH_INDEX_STEP)) resolve();
      else setTimeout(step, 0);
    });
    step();
  });
}

/**
 * Prepares what the page's next request needs, in the background: the
 * catalog and the profile at once; once the user is idle, today's pick (so
 * the panel and the Letterboxd button find it ready) and the text search
 * index. Returns at once.
 */
export function warmUp(ctx: AppContext): void {
  void (async () => {
    // Creating the model session is the slow part of a first AI search.
    void prepareSearchModel(ctx, (await ctx.settings.get()).modelQuery);
    const profile = await ctx.profiles.get();
    const catalog = await ctx.catalog();
    if (!profile?.films.length) return;
    const now = ctx.clock.now();
    const feedback = activeFeedback(await ctx.feedback.list(usernameKey(profile.username)), now, timeZoneOf(ctx));
    preparedFor(profile, catalog, now, splitFeedback(feedback).rejectedFilms);
    // Popup and panel both warm up; one background run per worker is enough.
    if (idleWorkScheduled.has(catalog)) return;
    idleWorkScheduled.add(catalog);
    whenIdle(ctx, async () => {
      await getDailyPick(ctx).catch(() => {});
      await buildSearchIndex(ctx, catalog);
    });
  })().catch(() => {
    // Best effort: the request that needs the data reports any failure.
  });
}
