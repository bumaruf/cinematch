import type { CatalogInfo } from '../domain/catalog/catalog.ts';
import type { ProfileFilm, UserProfile } from '../domain/film.ts';
import { analyzeProfile, ratingHistogram, type AnalyzedProfile } from '../domain/profile/analyze.ts';
import { importProfileSnapshot, mergeProfileFilms, needsCsvRepair, parseProfileCsv } from '../domain/profile/csv-import.ts';
import type { AppContext } from './context.ts';
import type { SyncProgress } from './ports.ts';

export interface ActiveProfile {
  profile: UserProfile;
  analyzed: AnalyzedProfile;
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

function describe(ctx: AppContext, profile: UserProfile): ActiveProfile {
  const catalog = ctx.catalog();
  return {
    profile,
    analyzed: analyzeProfile(profile, catalog, ctx.clock.now()),
    ratingHistogram: ratingHistogram(profile),
    catalogInfo: catalog.info,
  };
}

export async function getActiveProfile(ctx: AppContext): Promise<ActiveProfile | null> {
  const profile = await ctx.profiles.get();
  return profile ? describe(ctx, profile) : null;
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
  await ctx.profiles.save(result.profile);
  await ctx.popupSession.clear();
  await ctx.letterboxd.clearProgress();
  return { pending: false, ...describe(ctx, result.profile) };
}

/** Imports Letterboxd CSV exports into the current profile (or a new one). */
export async function importCsvProfile(ctx: AppContext, files: CsvFile[]): Promise<ImportSummary> {
  if (files.length === 0) throw new Error('Selecione ao menos um arquivo CSV.');
  const incoming: ProfileFilm[] = files.flatMap((file) => parseProfileCsv(file.text, file.name));
  const previous = await ctx.profiles.get();
  const base: UserProfile = previous ?? { username: 'Usuário', displayName: 'Cinéfilo', films: [], favorites: [] };
  const result = importProfileSnapshot(ctx.catalog(), base, incoming, ctx.clock.now());
  await ctx.profiles.replace(result.profile, previous, 'import');
  await ctx.popupSession.clear();
  await ctx.letterboxd.clearProgress();
  return {
    ...describe(ctx, result.profile),
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
  const repaired = mergeProfileFilms(ctx.catalog(), profile.films);
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
