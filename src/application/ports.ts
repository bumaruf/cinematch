import type { DailyPick, FilmFeedback, InterpretedBy, ProfileFilm, Recommendation, Settings, UserProfile } from '../domain/film.ts';
import type { EvaluationContext, RecommendationEvaluation } from '../domain/recommend/evaluation.ts';

/** Source of the current time, so use cases stay deterministic in tests. */
export interface Clock {
  now(): Date;
  /** The user's IANA time zone; days (daily pick, "Hoje não") turn over at its midnight. */
  timeZone?(): string;
}

export interface ProfileStore {
  get(): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  /** Replaces the profile and keeps the previous one as a recoverable backup. */
  replace(profile: UserProfile, previous: UserProfile | null, reason: 'import' | 'repair' | 'switch'): Promise<void>;
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
  username?: string;
  evaluationContext?: EvaluationContext;
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
  interpretedBy?: InterpretedBy;
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

export interface IdentifierSource { next(): string }

export interface EvaluationStore {
  list(username: string): Promise<RecommendationEvaluation[]>;
  update(transform: (entries: RecommendationEvaluation[]) => RecommendationEvaluation[]): Promise<RecommendationEvaluation[]>;
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

/**
 * Readiness of the on-device model, as Chrome reports it. `unsupported` means
 * this browser context does not expose the API at all.
 */
export type OnDeviceModelStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface StructuredPrompt {
  /** System instructions for the session. */
  instructions: string;
  /** The user's request, sent as is. */
  input: string;
  /** JSON Schema the answer must follow. */
  schema: object;
  /** Language hints Chrome checks before creating a session. */
  sessionOptions: object;
  timeoutMs: number;
}

/**
 * A language model that runs inside the browser. Implementations never
 * download the model and never use the network; they answer only when the
 * model is already available.
 */
export interface OnDeviceModel {
  status(sessionOptions: object): Promise<OnDeviceModelStatus>;
  /** The parsed JSON answer. Throws when the model is not ready or the answer is not JSON. */
  promptJson(request: StructuredPrompt): Promise<unknown>;
  /** Creates the session ahead of the first prompt, when the model is ready; never downloads. */
  prepare?(request: Pick<StructuredPrompt, 'instructions' | 'sessionOptions'>): Promise<void>;
}
