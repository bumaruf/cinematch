import type { Catalog } from '../domain/catalog/catalog.ts';
import type {
  Clock,
  FeedbackStore,
  EvaluationStore,
  IdentifierSource,
  DailyPickStore,
  HistoryStore,
  LetterboxdSync,
  PopupSessionStore,
  ProfileAnalysisStore,
  ProfileStore,
  SavedFilmsStore,
  SettingsStore,
  OnDeviceModel,
  RatingsSource,
  RatingsStore,
} from './ports.ts';

/** Everything a use case may depend on, wired by the background worker. */
export interface AppContext {
  /** Loads and indexes packaged data on first use; shared for this worker's lifetime. */
  catalog(): Promise<Catalog>;
  clock: Clock;
  identifiers: IdentifierSource;
  profiles: ProfileStore;
  settings: SettingsStore;
  history: HistoryStore;
  popupSession: PopupSessionStore;
  /** Absent in tests: the analysis is then always computed. */
  profileAnalysis?: ProfileAnalysisStore;
  saved: SavedFilmsStore;
  daily: DailyPickStore;
  feedback: FeedbackStore;
  evaluations: EvaluationStore;
  letterboxd: LetterboxdSync;
  /** Chrome's built-in model; absent where the platform offers none. */
  onDeviceModel?: OnDeviceModel;
  /**
   * IMDb ratings downloaded by this browser. catalog() applies what the store
   * holds, so a new download reaches the next request. Absent in tests that
   * use a catalog with ratings of its own.
   */
  ratings?: { store: RatingsStore; source: RatingsSource };
}
