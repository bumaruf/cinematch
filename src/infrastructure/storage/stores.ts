import type {
  DailyPickEntry,
  DailyPickStore,
  HistoryEntry,
  HistoryStore,
  PopupSession,
  PopupSessionStore,
  ProfileStore,
  SavedFilm,
  SavedFilmsStore,
  SettingsStore,
  SyncCheckpoint,
  SyncCheckpointStore,
} from '../../application/ports.ts';
import type { Settings, UserProfile } from '../../domain/film.ts';
import type { KeyValueStore } from './key-value.ts';

// Key names are persisted in users' browsers: renaming one loses their data.
export const KEYS = {
  profile: 'lb_curator_profile',
  syncCheckpoint: 'lb_curator_sync_checkpoint',
  importBackup: 'lb_curator_import_backup',
  repairBackup: 'lb_curator_repair_backup',
  history: 'lb_curator_rec_history',
  popupSession: 'lb_curator_popup_session',
  saved: 'lb_curator_saved_recs',
  daily: 'lb_curator_daily_recs',
  settings: 'lb_curator_settings',
} as const;

// Written by earlier versions and never read now.
const OBSOLETE_KEYS = [
  'lb_curator_api_key',
  'lb_curator_model',
  'lb_curator_engine_mode',
  'lb_curator_temperature',
  'lb_curator_custom_prompt',
  'lb_curator_active_username',
  'lb_curator_latest_recs',
];
const OBSOLETE_SETTINGS = ['model', 'engineMode', 'temperature', 'maxRecommendations', 'language'];

export const DEFAULT_SETTINGS: Settings = { avoidWatched: true, includeUnderrated: true, minVotes: 0 };

const HISTORY_LIMIT = 30;
const DAILY_LIMIT = 180;
/** Keeps local storage predictable even for exceptionally large imports. */
export const PROFILE_FILMS_LIMIT = 20_000;

export function profileStore(kv: KeyValueStore, clock: () => Date = () => new Date()): ProfileStore {
  return {
    get: async () => (await kv.get<UserProfile>(KEYS.profile)) ?? null,
    save: (profile) => {
      assertProfileSize(profile);
      return kv.set({ [KEYS.profile]: profile });
    },
    replace: (profile, previous, reason) => {
      assertProfileSize(profile);
      return kv.set({
        [KEYS.profile]: profile,
        [reason === 'import' ? KEYS.importBackup : KEYS.repairBackup]: { profile: previous, savedAt: clock().toISOString() },
      });
    },
    clear: () => kv.remove([KEYS.profile, KEYS.syncCheckpoint, KEYS.importBackup, KEYS.repairBackup]),
  };
}

function assertProfileSize(profile: UserProfile): void {
  if (profile.films.length > PROFILE_FILMS_LIMIT) {
    throw new Error(`Este perfil tem mais de ${PROFILE_FILMS_LIMIT.toLocaleString('pt-BR')} filmes e excede o limite local do CineMatch.`);
  }
}

export function syncCheckpointStore(kv: KeyValueStore): SyncCheckpointStore {
  return {
    get: async () => (await kv.get<SyncCheckpoint>(KEYS.syncCheckpoint)) ?? null,
    save: (checkpoint) => kv.set({ [KEYS.syncCheckpoint]: checkpoint }),
    clear: () => kv.remove(KEYS.syncCheckpoint),
  };
}

export function settingsStore(kv: KeyValueStore): SettingsStore {
  const get = async (): Promise<Settings> => {
    const saved = (await kv.get<Partial<Settings>>(KEYS.settings)) ?? {};
    return {
      avoidWatched: saved.avoidWatched ?? DEFAULT_SETTINGS.avoidWatched,
      includeUnderrated: saved.includeUnderrated ?? DEFAULT_SETTINGS.includeUnderrated,
      minVotes: Number(saved.minVotes ?? DEFAULT_SETTINGS.minVotes),
    };
  };
  return {
    get,
    async update(changes) {
      const updated = { ...(await get()), ...changes };
      await kv.set({ [KEYS.settings]: updated });
      return updated;
    },
  };
}

export function historyStore(kv: KeyValueStore): HistoryStore {
  const list = async (): Promise<HistoryEntry[]> => {
    const entries = await kv.get<HistoryEntry[]>(KEYS.history);
    return Array.isArray(entries) ? entries : [];
  };
  return {
    list,
    append: async (entry) => kv.set({ [KEYS.history]: [entry, ...(await list())].slice(0, HISTORY_LIMIT) }),
  };
}

export function popupSessionStore(kv: KeyValueStore): PopupSessionStore {
  return {
    get: async () => (await kv.get<PopupSession>(KEYS.popupSession)) ?? null,
    save: (session) => kv.set({ [KEYS.popupSession]: session }),
    clear: () => kv.remove(KEYS.popupSession),
  };
}

export function savedFilmsStore(kv: KeyValueStore): SavedFilmsStore {
  return {
    list: async () => {
      const films = await kv.get<SavedFilm[]>(KEYS.saved);
      return Array.isArray(films) ? films : [];
    },
    replaceAll: (films) => kv.set({ [KEYS.saved]: films }),
  };
}

export function dailyPickStore(kv: KeyValueStore): DailyPickStore {
  const all = async (): Promise<DailyPickEntry[]> => {
    const entries = await kv.get<DailyPickEntry[]>(KEYS.daily);
    return Array.isArray(entries) ? entries : [];
  };
  return {
    list: async (username) => {
      const key = username.trim().toLowerCase();
      return (await all()).filter((entry) => !key || (entry.username || '').toLowerCase() === key);
    },
    // Every pick is kept, including several on the same day, so later
    // requests can exclude all films already offered.
    add: async (entry) => kv.set({ [KEYS.daily]: [entry, ...(await all())].slice(0, DAILY_LIMIT) }),
  };
}

/** Drops keys and settings that earlier versions wrote and nothing reads. */
export async function removeObsoleteData(kv: KeyValueStore): Promise<void> {
  await kv.remove(OBSOLETE_KEYS);
  const saved = await kv.get<Record<string, unknown>>(KEYS.settings);
  if (saved && OBSOLETE_SETTINGS.some((key) => key in saved)) {
    const cleaned = { ...saved };
    for (const key of OBSOLETE_SETTINGS) delete cleaned[key];
    await kv.set({ [KEYS.settings]: cleaned });
  }
}
