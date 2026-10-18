import type { AppContext } from '../application/context.ts';
import { listFilmFeedback, recordFilmFeedback } from '../application/feedback.ts';
import { clearRecommendationEvaluations, getRecommendationEvaluationReport, recordRecommendationEvaluation } from '../application/evaluation.ts';
import { getFilmArtwork, getPopupSession, getSettings, listHistory, listSavedFilms, savePopupSession, toggleSavedFilm, updateSettings } from '../application/library.ts';
import type { SyncProgress } from '../application/ports.ts';
import { getOnDeviceModelStatus } from '../application/query-model.ts';
import { getRatingsStatus, refreshRatings } from '../application/ratings.ts';
import { clearProfile, getActiveProfile, getProfileSummary, importCsvProfile, syncProfile } from '../application/profile.ts';
import { generateRecommendations, getDailyPick, getSurprisePick, warmUp } from '../application/recommendations.ts';
import type { Action, RequestOf, ResponseOf } from '../messaging/contract.ts';

export type Handlers = { [A in Action]: (payload: RequestOf<A>) => Promise<ResponseOf<A>> };

export interface Platform {
  broadcastProgress(progress: SyncProgress): void;
  openDashboard(hash?: string): Promise<void>;
  /** Runs fn unless another sync holds the lock; then rejects. */
  exclusiveSync<T>(fn: () => Promise<T>): Promise<T>;
}

export function createHandlers(ctx: AppContext, platform: Platform): Handlers {
  return {
    getActiveProfile: () => getActiveProfile(ctx),
    getProfileSummary: () => getProfileSummary(ctx),
    warmUp: async () => warmUp(ctx),
    syncProfile: (request) => platform.exclusiveSync(() => syncProfile(ctx, request, platform.broadcastProgress)),
    importCsvProfile: ({ files }) => importCsvProfile(ctx, files),
    clearProfile: () => clearProfile(ctx),
    generateRecommendations: (query) => generateRecommendations(ctx, query),
    getDailyPick: (options) => getDailyPick(ctx, options),
    getSurprisePick: () => getSurprisePick(ctx),
    listSavedFilms: () => listSavedFilms(ctx),
    toggleSavedFilm: (film) => toggleSavedFilm(ctx, film),
    recordFilmFeedback: (feedback) => recordFilmFeedback(ctx, feedback),
    listFilmFeedback: () => listFilmFeedback(ctx),
    recordRecommendationEvaluation: input => recordRecommendationEvaluation(ctx, input),
    getRecommendationEvaluationReport: () => getRecommendationEvaluationReport(ctx),
    clearRecommendationEvaluations: () => clearRecommendationEvaluations(ctx),
    listHistory: () => listHistory(ctx),
    getPopupSession: () => getPopupSession(ctx),
    savePopupSession: (session) => savePopupSession(ctx, session),
    getSettings: () => getSettings(ctx),
    updateSettings: (changes) => updateSettings(ctx, changes),
    getOnDeviceModelStatus: () => getOnDeviceModelStatus(ctx),
    getRatingsStatus: () => getRatingsStatus(ctx),
    refreshRatings: ({ force } = {}) => refreshRatings(ctx, { force }),
    getFilmArtwork: ({ slug }) => getFilmArtwork(ctx, slug),
    openDashboard: ({ hash } = {}) => platform.openDashboard(hash),
  };
}
