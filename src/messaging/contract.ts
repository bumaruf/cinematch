import type { SavedFilmInput } from '../application/library.ts';
import type { FeedbackInput } from '../application/feedback.ts';
import type { EvaluationInput, getRecommendationEvaluationReport } from '../application/evaluation.ts';
import type { HistoryEntry, OnDeviceModelStatus, PopupSession, SavedFilm, SyncProgress } from '../application/ports.ts';
import type { ActiveProfile, CsvFile, ImportSummary, ProfileSummary, SyncResult } from '../application/profile.ts';
import type { DailyPickResponse, RecommendationQuery } from '../application/recommendations.ts';
import type { FilmFeedback, RecommendationResult, Settings } from '../domain/film.ts';

/**
 * Every request the UI can make to the background worker. The worker is the
 * only context that touches storage, the network and the film catalog.
 */
export interface Contract {
  getActiveProfile: { request: void; response: ActiveProfile | null };
  /** Header data without the catalog: answers at once even from a cold worker. */
  getProfileSummary: { request: void; response: ProfileSummary | null };
  /** Starts loading the catalog and preparing the daily pick; returns at once. */
  warmUp: { request: void; response: void };
  syncProfile: { request: { username: string; forceFull?: boolean }; response: SyncResult };
  importCsvProfile: { request: { files: CsvFile[] }; response: ImportSummary };
  clearProfile: { request: void; response: void };
  generateRecommendations: { request: RecommendationQuery; response: RecommendationResult };
  getDailyPick: { request: { refresh?: boolean; username?: string }; response: DailyPickResponse };
  getSurprisePick: { request: void; response: DailyPickResponse };
  listSavedFilms: { request: void; response: SavedFilm[] };
  toggleSavedFilm: { request: SavedFilmInput; response: { isSaved: boolean; totalSaved: number } };
  recordFilmFeedback: { request: FeedbackInput; response: void };
  listFilmFeedback: { request: void; response: FilmFeedback[] };
  recordRecommendationEvaluation: { request: EvaluationInput; response: void };
  getRecommendationEvaluationReport: { request: void; response: Awaited<ReturnType<typeof getRecommendationEvaluationReport>> };
  clearRecommendationEvaluations: { request: void; response: void };
  listHistory: { request: void; response: HistoryEntry[] };
  getPopupSession: { request: void; response: PopupSession | null };
  savePopupSession: { request: PopupSession; response: void };
  getSettings: { request: void; response: Settings };
  updateSettings: { request: Partial<Settings>; response: Settings };
  getOnDeviceModelStatus: { request: void; response: OnDeviceModelStatus };
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
  'getProfileSummary',
  'warmUp',
  'syncProfile',
  'importCsvProfile',
  'clearProfile',
  'generateRecommendations',
  'getDailyPick',
  'getSurprisePick',
  'listSavedFilms',
  'toggleSavedFilm',
  'recordFilmFeedback',
  'listFilmFeedback',
  'recordRecommendationEvaluation',
  'getRecommendationEvaluationReport',
  'clearRecommendationEvaluations',
  'listHistory',
  'getPopupSession',
  'savePopupSession',
  'getSettings',
  'updateSettings',
  'getOnDeviceModelStatus',
  'getFilmArtwork',
  'openDashboard',
];

/**
 * What the content script may ask for. It runs inside Letterboxd pages, so it
 * gets only the daily pick flow, never destructive or bulk operations.
 */
export const CONTENT_SCRIPT_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'getActiveProfile',
  'getProfileSummary',
  'warmUp',
  'syncProfile',
  'getDailyPick',
  'getFilmArtwork',
  'openDashboard',
]);

export function isRequestMessage(message: unknown): message is RequestMessage {
  if (typeof message !== 'object' || message === null || !ACTIONS.includes((message as RequestMessage).action)) return false;
  const { payload } = message as { payload?: unknown };
  return payload === undefined || (typeof payload === 'object' && payload !== null && !Array.isArray(payload));
}

export interface MessageSender {
  id?: string;
  url?: string;
}

/** Extension pages may call anything; content scripts only their allowlist. */
export function isAllowedSender(action: Action, sender: MessageSender, extensionId: string): boolean {
  if (sender.id !== extensionId) return false;
  if (sender.url?.startsWith(`chrome-extension://${extensionId}/`)) return true;
  return CONTENT_SCRIPT_ACTIONS.has(action);
}

export function isSyncProgressEvent(message: unknown): message is SyncProgressEvent {
  return typeof message === 'object' && message !== null && (message as SyncProgressEvent).event === 'syncProgress';
}

export const DASHBOARD_PATH = 'src/ui/pages/dashboard/index.html';
