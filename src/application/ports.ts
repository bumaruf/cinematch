import type { DailyPick, FilmFeedback, ProfileFilm, Recommendation, Settings, UserProfile } from '../domain/film.ts';

/** Source of the current time, so use cases stay deterministic in tests. */
export interface Clock {
  now(): Date;
}

export interface ProfileStore {
  get(): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  /** Replaces the profile and keeps the previous one as a recoverable backup. */
  replace(profile: UserProfile, previous: UserProfile | null, reason: 'import' | 'repair'): Promise<void>;
  clear(): Promise<void>;
}

/** Progress of a paginated full sync, so a new batch resumes where it stopped. */
export interface SyncCheckpoint {
  username: string;
  totalFilms: number;
  startedAt: number;
  nextPage: number;
  collectedSlugs: string[];
  films: ProfileFilm[];
}

export interface SyncCheckpointStore {
  get(): Promise<SyncCheckpoint | null>;
  save(checkpoint: SyncCheckpoint): Promise<void>;
  clear(): Promise<void>;
}

export interface SettingsStore {
  get(): Promise<Settings>;
  update(changes: Partial<Settings>): Promise<Settings>;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  theme: string;
  customPrompt: string;
  movies: Recommendation[];
}

export interface HistoryStore {
  list(): Promise<HistoryEntry[]>;
  append(entry: HistoryEntry): Promise<void>;
}

export interface PopupResult {
  title: string;
  note: string;
  films: Recommendation[];
  interpretation?: string[];
}

/** Popup state, kept only for the current browser session. */
export interface PopupSession {
  username: string;
  view: 'home' | 'results';
  prompt: string;
  result?: PopupResult;
}

export interface PopupSessionStore {
  get(): Promise<PopupSession | null>;
  save(session: PopupSession): Promise<void>;
  clear(): Promise<void>;
}

/** Saved films may predate the current Recommendation shape. */
export type SavedFilm = Partial<Recommendation> & { title: string; year?: number; savedAt: string; slug?: string };

export interface SavedFilmsStore {
  list(): Promise<SavedFilm[]>;
  replaceAll(films: SavedFilm[]): Promise<void>;
  update(transform: (films: SavedFilm[]) => SavedFilm[]): Promise<SavedFilm[]>;
}

export interface FeedbackStore {
  list(username: string): Promise<FilmFeedback[]>;
  update(transform: (entries: FilmFeedback[]) => FilmFeedback[]): Promise<FilmFeedback[]>;
}

export interface StoredDailyPick extends DailyPick {
  profileKey: string;
  profileUsername: string;
  /** Older saved entries predate this field and are the canonical daily pick. */
  kind?: 'daily' | 'surprise';
}

export interface DailyPickEntry {
  username: string;
  date: string;
  data: StoredDailyPick;
}

export interface DailyPickStore {
  /** Most recent first. */
  list(username: string): Promise<DailyPickEntry[]>;
  add(entry: DailyPickEntry): Promise<void>;
}

export interface SyncProgress {
  stage?: string;
  message: string;
  percent?: number;
}

export type SyncBatchResult =
  | { pending: true; collected: number; totalFilms: number }
  | { pending: false; profile: UserProfile };

export interface LetterboxdSync {
  /**
   * Collects the next batch of a profile. A pending result must be followed by
   * another call; the progress is persisted between calls.
   */
  syncBatch(
    username: string,
    options: { previous: UserProfile | null; forceFull: boolean; onProgress: (progress: SyncProgress) => void },
  ): Promise<SyncBatchResult>;
  clearProgress(): Promise<void>;
}

export interface ArtworkSource {
  /** The film page's og:image, or '' when unavailable. */
  artworkUrl(slug: string): Promise<string>;
}
