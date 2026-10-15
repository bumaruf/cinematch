import type { FeedbackKind, FilmFeedback, FilmIdentity } from '../domain/film.ts';
import { catalogIdentity } from '../domain/profile/watched.ts';
import { createFilmIdentityIndex } from '../domain/profile/identity.ts';
import { DAILY_TIME_ZONE, dateKey, usernameKey } from '../domain/recommend/daily.ts';
import type { AppContext } from './context.ts';

export interface FeedbackInput { film: FilmIdentity; kind: FeedbackKind | null; username?: string }

export function activeFeedback(entries: readonly FilmFeedback[], now: Date, timeZone = DAILY_TIME_ZONE): FilmFeedback[] {
  return entries.filter((entry) => entry.kind !== 'later' || dateKey(new Date(entry.createdAt), timeZone) === dateKey(now, timeZone));
}

/** The user's time zone, or the historical default when the clock has none. */
export function timeZoneOf(ctx: Pick<AppContext, 'clock'>): string {
  return ctx.clock.timeZone?.() || DAILY_TIME_ZONE;
}

export async function listFilmFeedback(ctx: AppContext): Promise<FilmFeedback[]> {
  const profile = await ctx.profiles.get();
  return activeFeedback(await ctx.feedback.list(usernameKey(profile?.username)), ctx.clock.now(), timeZoneOf(ctx));
}

export async function recordFilmFeedback(ctx: AppContext, { film, kind, username: expected }: FeedbackInput): Promise<void> {
  if (!film?.title || !['later', 'not-for-me', 'watched', null].includes(kind)) throw new Error('Feedback inválido.');
  const profile = await ctx.profiles.get();
  const username = usernameKey(profile?.username);
  if (expected && usernameKey(expected) !== username) throw new Error('O perfil foi alterado. Tente novamente.');
  const metadata = (await ctx.catalog()).resolve({ ...film, slug: film.catalogSlug || film.letterboxdSlug || film.slug }).film;
  const identity: FilmIdentity = metadata ? catalogIdentity(metadata) : { title: film.title, year: film.year, slug: film.letterboxdSlug || film.slug };
  const target = createFilmIdentityIndex([identity]);
  const now = ctx.clock.now();
  await ctx.feedback.update((entries) => {
    const kept = entries.filter((entry) => entry.username !== username || !target.has(entry.film));
    return (kind ? [{ username, film: identity, kind, createdAt: now.toISOString() }, ...kept] : kept).slice(0, 5000);
  });
}
