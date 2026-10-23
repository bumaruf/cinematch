import type { CatalogInfo } from '../domain/catalog/catalog.ts';
import type { ProfileFilm, UserProfile } from '../domain/film.ts';
import { analyzeProfile, ratingHistogram, type AnalyzedProfile, type RatedFilm } from '../domain/profile/analyze.ts';
import { usernameKey } from '../domain/recommend/daily.ts';
import { importProfileSnapshot, mergeProfileFilms, needsCsvRepair, parseProfileCsv } from '../domain/profile/csv-import.ts';
import type { AppContext } from './context.ts';
import type { SyncProgress } from './ports.ts';

/**
 * What pages show about the stored profile. The full history stays in the
 * worker: pages only need its size, and copying it cost hundreds of KB per call.
 */
export type ProfileOverview = Omit<UserProfile, 'films' | 'thisYearFilms'> & { filmCount: number };

/** The page header: no catalog needed, so it answers even while the worker wakes up. */
export interface ProfileSummary {
  profile: ProfileOverview;
  avgRating: number;
}

/** The analysis the profile tab shows: statistics and the top films' titles and notes. */
export type ProfileAnalysisView = Pick<AnalyzedProfile, 'totalLoggedFilms' | 'totalAnalyzed' | 'stats' | 'lastSync'> & {
  topFilms: Pick<RatedFilm, 'title' | 'year' | 'rating' | 'slug' | 'isFavorite'>[];
};

export interface ActiveProfile {
  profile: ProfileOverview;
  analyzed: ProfileAnalysisView;
  ratingHistogram: { rating: number; count: number }[];
  catalogInfo: CatalogInfo;
}

export type SyncResult = { pending: true; collected: number; totalFilms: number } | ({ pending: false } & ActiveProfile);

export interface CsvFile {
  name: string;
  text: string;
}

export interface ImportSummary extends ActiveProfile {
  /** watched.csv defined the watched list, replacing the previous one. */
  authoritative: boolean;
  addedCount: number;
  updatedRatingCount: number;
  unmatchedCount: number;
}

export const GUEST_PROFILE: UserProfile = { username: 'Convidado', displayName: 'Cinéfilo', films: [], favorites: [] };

function overview({ films, thisYearFilms: _thisYear, ...rest }: UserProfile): ProfileOverview {
  return { ...rest, filmCount: films.length };
}

/** Identifies a stored profile: any change to it gives another key. */
function profileVersion(profile: UserProfile): string {
  const text = JSON.stringify(profile);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `${usernameKey(profile.username)}|${text.length}|${(hash >>> 0).toString(36)}`;
}

/**
 * The analysis needs the catalog, which a stopped worker takes a while to
 * read again. The packaged catalog only changes with an extension update,
 * which clears session storage, so the profile's version is enough of a key.
 */
async function describe(ctx: AppContext, profile: UserProfile): Promise<ActiveProfile> {
  const key = profileVersion(profile);
  const cached = await ctx.profileAnalysis?.get().catch(() => null);
  if (cached?.key === key) {
    const { value } = cached;
    return { ...value, profile: overview(profile),
      analyzed: { ...value.analyzed, lastSync: profile.lastSync || ctx.clock.now().toISOString() } };
  }
  const value = await analyze(ctx, profile);
  // Best effort: without the cache the next cold worker only waits longer.
  await ctx.profileAnalysis?.save({ key, value }).catch(() => {});
  return { ...value, profile: overview(profile) };
}

async function analyze(ctx: AppContext, profile: UserProfile): Promise<Omit<ActiveProfile, 'profile'>> {
  const catalog = await ctx.catalog();
  const analyzed = analyzeProfile(profile, catalog, ctx.clock.now());
  return {
    analyzed: {
      totalLoggedFilms: analyzed.totalLoggedFilms,
      totalAnalyzed: analyzed.totalAnalyzed,
      stats: analyzed.stats,
      lastSync: analyzed.lastSync,
      topFilms: analyzed.topFilms.map(({ title, year, rating, slug, isFavorite }) => ({ title, year, rating, slug, isFavorite })),
    },
    ratingHistogram: ratingHistogram(profile),
    catalogInfo: catalog.info,
  };
}

export async function getActiveProfile(ctx: AppContext): Promise<ActiveProfile | null> {
  const profile = await ctx.profiles.get();
  return profile ? describe(ctx, profile) : null;
}

export async function getProfileSummary(ctx: AppContext): Promise<ProfileSummary | null> {
  const profile = await ctx.profiles.get();
  if (!profile) return null;
  const ratings = profile.films.map((film) => film.rating).filter((rating): rating is number => typeof rating === 'number' && !Number.isNaN(rating));
  const avgRating = ratings.length ? Number.parseFloat((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2)) : 0;
  return { profile: overview(profile), avgRating };
}

/**
 * Collects the next batch of a Letterboxd profile. The saved profile is only
 * replaced once the whole history was collected.
 */
export async function syncProfile(
  ctx: AppContext,
  { username, forceFull = false }: { username: string; forceFull?: boolean },
  onProgress: (progress: SyncProgress) => void = () => {},
): Promise<SyncResult> {
  if (!username?.trim()) throw new Error('Nome de usuário não informado.');
  const previous = await ctx.profiles.get();
  const result = await ctx.letterboxd.syncBatch(username.trim(), { previous, forceFull, onProgress });
  if (result.pending) return result;
  // Syncing another member keeps the previous history recoverable.
  if (previous?.films.length && usernameKey(previous.username) !== usernameKey(result.profile.username)) {
    await ctx.profiles.replace(result.profile, previous, 'switch');
  } else {
    await ctx.profiles.save(result.profile, previous);
  }
  await ctx.popupSession.clear();
  await ctx.letterboxd.clearProgress();
  return { pending: false, ...await describe(ctx, result.profile) };
}

/** Imports Letterboxd CSV exports into the current profile (or a new one). */
export async function importCsvProfile(ctx: AppContext, files: CsvFile[]): Promise<ImportSummary> {
  if (files.length === 0) throw new Error('Selecione ao menos um arquivo CSV.');
  const incoming: ProfileFilm[] = files.flatMap((file) => parseProfileCsv(file.text, file.name));
  const previous = await ctx.profiles.get();
  const base: UserProfile = previous ?? { username: 'Usuário', displayName: 'Cinéfilo', films: [], favorites: [] };
  const result = importProfileSnapshot(await ctx.catalog(), base, incoming, ctx.clock.now());
  await ctx.profiles.replace(result.profile, previous, 'import');
  await ctx.popupSession.clear();
  await ctx.letterboxd.clearProgress();
  return {
    ...await describe(ctx, result.profile),
    authoritative: result.authoritative,
    addedCount: result.addedCount,
    updatedRatingCount: result.updatedRatingCount,
    unmatchedCount: result.unmatched.length,
  };
}

export async function clearProfile(ctx: AppContext): Promise<void> {
  await Promise.all([ctx.profiles.clear(), ctx.popupSession.clear()]);
}

/**
 * Early CSV imports invented slugs from titles and duplicated films. Merges
 * those duplicates once, keeping the previous profile as a backup.
 */
export async function repairLegacyCsvProfile(ctx: AppContext): Promise<boolean> {
  const profile = await ctx.profiles.get();
  if (!needsCsvRepair(profile)) return false;
  const repaired = mergeProfileFilms(await ctx.catalog(), profile.films);
  await ctx.profiles.replace(
    {
      ...profile,
      films: repaired.films,
      totalFilms: repaired.films.length,
      csvIdentityVersion: 2,
      lastFullSync: null,
      csvDuplicatesRemoved: repaired.removedCount,
    },
    profile,
    'repair',
  );
  await ctx.letterboxd.clearProgress();
  return true;
}
