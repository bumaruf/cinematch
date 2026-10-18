import { ratingsAreStale } from '../domain/catalog/ratings.ts';
import type { AppContext } from './context.ts';

export interface RatingsStatus {
  /** False where this context has no ratings download (tests, diagnostics). */
  supported: boolean;
  /** ISO date of the last download, or null before the first one. */
  fetchedAt: string | null;
  /** Films of the catalog with a score. */
  rated: number;
  stale: boolean;
}

/** One download at a time per worker; concurrent callers share it. */
const running = new WeakMap<object, Promise<RatingsStatus>>();

export async function getRatingsStatus(ctx: AppContext): Promise<RatingsStatus> {
  if (!ctx.ratings) return { supported: false, fetchedAt: null, rated: 0, stale: false };
  const stored = await ctx.ratings.store.get();
  return {
    supported: true,
    fetchedAt: stored?.fetchedAt ?? null,
    rated: stored ? Object.keys(stored.ratings).length : 0,
    stale: ratingsAreStale(stored, ctx.clock.now()),
  };
}

/**
 * Downloads IMDb's ratings for the catalog's films when they are missing or
 * old (or always, with force). The extension does not carry IMDb's data: the
 * user's browser fetches it from IMDb for the user's own use.
 */
export function refreshRatings(ctx: AppContext, { force = false } = {}): Promise<RatingsStatus> {
  const ratings = ctx.ratings;
  if (!ratings) return getRatingsStatus(ctx);
  const pending = running.get(ratings);
  if (pending) return pending;
  const run = (async () => {
    const stored = await ratings.store.get();
    if (!force && !ratingsAreStale(stored, ctx.clock.now())) return getRatingsStatus(ctx);
    const ids = new Set((await ctx.catalog()).films.map((film) => film.imdbId).filter(Boolean));
    const downloaded = await ratings.source.download(ids);
    if (Object.keys(downloaded).length === 0) throw new Error('O arquivo de notas do IMDb veio vazio. Tente novamente mais tarde.');
    await ratings.store.save({ fetchedAt: ctx.clock.now().toISOString(), ratings: downloaded });
    return getRatingsStatus(ctx);
  })().finally(() => running.delete(ratings));
  running.set(ratings, run);
  return run;
}
