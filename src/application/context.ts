import type { Catalog } from '../domain/catalog/catalog.ts';
import type {
  ArtworkSource,
  Clock,
  FeedbackStore,
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
  /** Indexed on first use: building it costs a few hundred milliseconds. */
  catalog(): Catalog;
  clock: Clock;
  profiles: ProfileStore;
  settings: SettingsStore;
  history: HistoryStore;
  popupSession: PopupSessionStore;
  saved: SavedFilmsStore;
  daily: DailyPickStore;
  feedback: FeedbackStore;
  letterboxd: LetterboxdSync;
  artwork: ArtworkSource;
}
