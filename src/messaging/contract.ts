import type { SavedFilmInput } from '../application/library.ts';
import type { HistoryEntry, PopupSession, SavedFilm, SyncProgress } from '../application/ports.ts';
import type { ActiveProfile, CsvFile, ImportSummary, SyncResult } from '../application/profile.ts';
import type { DailyPickResponse, RecommendationQuery } from '../application/recommendations.ts';
import type { RecommendationResult, Settings } from '../domain/film.ts';

/**
 * Every request the UI can make to the background worker. The worker is the
 * only context that touches storage, the network and the film catalog.
 */
export interface Contract {
  getActiveProfile: { request: void; response: ActiveProfile | null };
  syncProfile: { request: { username: string; forceFull?: boolean }; response: SyncResult };
  importCsvProfile: { request: { files: CsvFile[] }; response: ImportSummary };
  clearProfile: { request: void; response: void };
  generateRecommendations: { request: RecommendationQuery; response: RecommendationResult };
  getDailyPick: { request: { refresh?: boolean; username?: string }; response: DailyPickResponse };
  listSavedFilms: { request: void; response: SavedFilm[] };
  toggleSavedFilm: { request: SavedFilmInput; response: { isSaved: boolean; totalSaved: number } };
  listHistory: { request: void; response: HistoryEntry[] };
  getPopupSession: { request: void; response: PopupSession | null };
  savePopupSession: { request: PopupSession; response: void };
  getSettings: { request: void; response: Settings };
  updateSettings: { request: Partial<Settings>; response: Settings };
  getFilmArtwork: { request: { slug: string }; response: string };
  openDashboard: { request: { hash?: string }; response: void };
}

export type Action = keyof Contract;
export type RequestOf<A extends Action> = Contract[A]['request'];
export type ResponseOf<A extends Action> = Contract[A]['response'];

export interface RequestMessage<A extends Action = Action> {
  action: A;
  payload: RequestOf<A>;
}

export type ResponseMessage<A extends Action = Action> = { ok: true; data: ResponseOf<A> } | { ok: false; error: string };

/** Broadcast by the worker while a sync runs. */
export interface SyncProgressEvent {
  event: 'syncProgress';
  progress: SyncProgress;
}

export const ACTIONS: readonly Action[] = [
  'getActiveProfile',
  'syncProfile',
  'importCsvProfile',
  'clearProfile',
  'generateRecommendations',
  'getDailyPick',
  'listSavedFilms',
  'toggleSavedFilm',
  'listHistory',
  'getPopupSession',
  'savePopupSession',
  'getSettings',
  'updateSettings',
  'getFilmArtwork',
  'openDashboard',
];

export function isRequestMessage(message: unknown): message is RequestMessage {
  return typeof message === 'object' && message !== null && ACTIONS.includes((message as RequestMessage).action);
}

export function isSyncProgressEvent(message: unknown): message is SyncProgressEvent {
  return typeof message === 'object' && message !== null && (message as SyncProgressEvent).event === 'syncProgress';
}

export const DASHBOARD_PATH = 'src/ui/pages/dashboard/index.html';
