import type { Catalog } from '../domain/catalog/catalog.ts';
import type {
  ArtworkSource,
  Clock,
  FeedbackStore,
  EvaluationStore,
  IdentifierSource,
  DailyPickStore,
  HistoryStore,
  LetterboxdSync,
  PopupSessionStore,
  ProfileStore,
  SavedFilmsStore,
  SettingsStore,
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
  saved: SavedFilmsStore;
  daily: DailyPickStore;
  feedback: FeedbackStore;
  evaluations: EvaluationStore;
  letterboxd: LetterboxdSync;
  artwork: ArtworkSource;
}
