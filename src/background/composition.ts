import type { AppContext } from '../application/context.ts';
import { loadCatalog } from '../infrastructure/catalog.ts';
import { letterboxdArtwork } from '../infrastructure/letterboxd/artwork.ts';
import { tabAwareFetcher } from '../infrastructure/letterboxd/http.ts';
import { createLetterboxdSync } from '../infrastructure/letterboxd/sync.ts';
import { chromeKeyValueStore, type KeyValueStore } from '../infrastructure/storage/key-value.ts';
import {
  dailyPickStore,
  feedbackStore,
  historyStore,
  popupSessionStore,
  profileStore,
  removeObsoleteData,
  savedFilmsStore,
  settingsStore,
  syncCheckpointStore,
} from '../infrastructure/storage/stores.ts';
import { DASHBOARD_PATH, isRequestMessage, type ResponseMessage, type SyncProgressEvent } from '../messaging/contract.ts';
import { createHandlers, type Handlers, type Platform } from './router.ts';

export function createContext(kv: KeyValueStore, sessionKv: KeyValueStore = kv): AppContext {
  const clock = { now: () => new Date() };
  const checkpoints = syncCheckpointStore(kv);
  return {
    catalog: loadCatalog,
    clock,
    profiles: profileStore(kv, clock.now),
    settings: settingsStore(kv),
    history: historyStore(kv),
    popupSession: popupSessionStore(sessionKv),
    saved: savedFilmsStore(kv),
    daily: dailyPickStore(kv),
    feedback: feedbackStore(kv),
    // A fresh fetcher per batch looks up the open Letterboxd tab again.
    letterboxd: {
      syncBatch: (username, options) =>
        createLetterboxdSync({ fetchPage: tabAwareFetcher(), checkpoints }).syncBatch(username, options),
      clearProgress: () => checkpoints.clear(),
    },
    artwork: letterboxdArtwork(),
  };
}

export const chromePlatform: Platform = {
  broadcastProgress(progress) {
    const event: SyncProgressEvent = { event: 'syncProgress', progress };
    chrome.runtime.sendMessage(event).catch(() => {
      // No page is listening; progress is only informative.
    });
  },
  async openDashboard(hash) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD_PATH) + (hash ? `#${hash}` : '') });
  },
  async exclusiveSync(fn) {
    if (!globalThis.navigator?.locks) return fn();
    return navigator.locks.request('cinematch-profile-sync', { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Uma sincronização já está em andamento em outra janela. Aguarde sua conclusão.');
      return fn();
    });
  },
};

export function listen(handlers: Handlers): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRequestMessage(message)) return false;
    const handler = handlers[message.action] as (payload: unknown) => Promise<unknown>;
    handler(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        console.error(`[CineMatch] ${message.action}:`, error);
        sendResponse({ ok: false, error: (error as Error)?.message || 'Falha inesperada.' } satisfies ResponseMessage);
      });
    return true;
  });
}
