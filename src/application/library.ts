import type { Settings } from '../domain/film.ts';
import { letterboxdSearchUrl } from '../domain/recommend/recommendation.ts';
import { createFilmIdentityIndex } from '../domain/profile/identity.ts';
import { analyzeProfile } from '../domain/profile/analyze.ts';
import { createWatchedIndex } from '../domain/profile/watched.ts';
import { usernameKey } from '../domain/recommend/daily.ts';
import type { AppContext } from './context.ts';
import type { HistoryEntry, PopupSession, SavedFilm } from './ports.ts';

export type SavedFilmInput = Omit<SavedFilm, 'savedAt'>;

function sameFilm(a: SavedFilmInput, b: SavedFilmInput): boolean {
  return createFilmIdentityIndex([a]).has(b);
}

export async function toggleSavedFilm(ctx: AppContext, film: SavedFilmInput): Promise<{ isSaved: boolean; totalSaved: number }> {
  if (!film?.title) throw new Error('Filme inválido.');
  const savedAt = ctx.clock.now().toISOString();
  let isSaved = false;
  const updated = await ctx.saved.update((saved) => {
    const index = saved.findIndex((entry) => sameFilm(entry, film));
    isSaved = index < 0;
    return index >= 0 ? saved.filter((_, i) => i !== index) : [{ ...film, savedAt }, ...saved];
  });
  return { isSaved, totalSaved: updated.length };
}

/**
 * Saved films, completed with catalog metadata: entries saved by older
 * versions may lack poster, genres or a link.
 */
export async function listSavedFilms(ctx: AppContext): Promise<SavedFilm[]> {
  const saved = await ctx.saved.list();
  if (!saved.length) return [];
  const catalog = await ctx.catalog();
  return saved.map((film) => {
    const match = catalog.resolve({ ...film, slug: film.letterboxdSlug || film.slug }).film;
    return {
      ...film,
      catalogSlug: film.catalogSlug || match?.slug,
      originalTitle: film.originalTitle || match?.originalTitle || film.title,
      director: film.director || match?.director || '',
      posterPath: film.posterPath || (match ? catalog.posterPath(match.imdbId) : ''),
      genres: film.genres?.length ? film.genres : (match?.genres ?? []),
      runtimeMinutes: film.runtimeMinutes || match?.runtime || 0,
      letterboxdUrl: film.letterboxdUrl || letterboxdSearchUrl(film),
    };
  });
}

export async function isSaved(ctx: AppContext, film: SavedFilmInput): Promise<boolean> {
  return (await ctx.saved.list()).some((entry) => sameFilm(entry, film));
}

export async function listHistory(ctx: AppContext): Promise<HistoryEntry[]> {
  return ctx.history.list();
}

export async function getPopupSession(ctx: AppContext): Promise<PopupSession | null> {
  const session = await ctx.popupSession.get();
  if (session?.view !== 'results' || !session.result) return session;
  const [profile, settings] = await Promise.all([ctx.profiles.get(), ctx.settings.get()]);
  if (!settings.avoidWatched || !profile || usernameKey(profile.username) !== usernameKey(session.username)) return session;
  const watched = createWatchedIndex(analyzeProfile(profile, await ctx.catalog(), ctx.clock.now()).watchedList);
  const films = session.result.films.filter(film => !watched.has(film));
  if (films.length === session.result.films.length) return session;
  return { ...session, result: { ...session.result, films,
    note: films.length ? 'A lista foi atualizada para esconder os filmes já assistidos.' : 'Os filmes desta lista já constam no seu histórico. Faça uma nova busca.' } };
}

export async function savePopupSession(ctx: AppContext, session: PopupSession): Promise<void> {
  if (!session.username || !['home', 'results'].includes(session.view)) throw new Error('Sessão inválida.');
  if (session.view === 'results' && (!session.result?.title || !Array.isArray(session.result.films))) throw new Error('Resultado inválido.');
  await ctx.popupSession.save(session);
}

export async function getSettings(ctx: AppContext): Promise<Settings> {
  return ctx.settings.get();
}

export async function updateSettings(ctx: AppContext, changes: Partial<Settings>): Promise<Settings> {
  const allowed: Partial<Settings> = {};
  if (typeof changes.avoidWatched === 'boolean') allowed.avoidWatched = changes.avoidWatched;
  if (typeof changes.includeUnderrated === 'boolean') allowed.includeUnderrated = changes.includeUnderrated;
  if (Number.isFinite(changes.minVotes) && Number(changes.minVotes) >= 0) allowed.minVotes = Number(changes.minVotes);
  return ctx.settings.update(allowed);
}

export async function getFilmArtwork(ctx: AppContext, slug: string): Promise<string> {
  return ctx.artwork.artworkUrl(slug);
}
