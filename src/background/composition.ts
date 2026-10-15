import type { AppContext } from '../application/context.ts';
import { createPackagedCatalogLoader } from '../infrastructure/catalog-resource.ts';
import catalogUrl from 'virtual:cinematch-catalog-url';
import { letterboxdArtwork } from '../infrastructure/letterboxd/artwork.ts';
import { chromeOnDeviceModel } from '../infrastructure/on-device-model.ts';
import { tabAwareFetcher } from '../infrastructure/letterboxd/http.ts';
import { createLetterboxdSync } from '../infrastructure/letterboxd/sync.ts';
import type { KeyValueStore } from '../infrastructure/storage/key-value.ts';
import {
  dailyPickStore,
  feedbackStore,
  evaluationStore,
  historyStore,
  popupSessionStore,
  profileStore,
  savedFilmsStore,
  settingsStore,
  syncCheckpointStore,
} from '../infrastructure/storage/stores.ts';
import { DASHBOARD_PATH, isAllowedSender, isRequestMessage, type ResponseMessage, type SyncProgressEvent } from '../messaging/contract.ts';
import type { Handlers, Platform } from './router.ts';

export function createContext(kv: KeyValueStore, sessionKv: KeyValueStore = kv): AppContext {
  const clock = {
    now: () => new Date(),
    // Days turn over at the user's midnight, not at a fixed zone.
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const checkpoints = syncCheckpointStore(kv);
  return {
    catalog: createPackagedCatalogLoader(catalogUrl),
    clock,
    identifiers: { next: () => crypto.randomUUID() },
    profiles: profileStore(kv, clock.now),
    settings: settingsStore(kv),
    history: historyStore(kv),
    popupSession: popupSessionStore(sessionKv),
    saved: savedFilmsStore(kv),
    daily: dailyPickStore(kv),
    feedback: feedbackStore(kv),
    evaluations: evaluationStore(kv),
    // A fresh fetcher per batch looks up the open Letterboxd tab again.
    letterboxd: {
      syncBatch: (username, options) =>
        createLetterboxdSync({ fetchPage: tabAwareFetcher(), checkpoints }).syncBatch(username, options),
      clearProgress: () => checkpoints.clear(),
    },
    artwork: letterboxdArtwork(),
    onDeviceModel: chromeOnDeviceModel(),
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
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isRequestMessage(message)) return false;
    if (!isAllowedSender(message.action, sender, chrome.runtime.id)) {
      sendResponse({ ok: false, error: 'Ação não permitida neste contexto.' } satisfies ResponseMessage);
      return false;
    }
    const handler = handlers[message.action] as (payload: unknown) => Promise<unknown>;
    // A handler that throws before returning its promise still gets an answer.
    Promise.resolve()
      .then(() => handler(message.payload))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        console.error(`[CineMatch] ${message.action}:`, error);
        sendResponse({ ok: false, error: (error as Error)?.message || 'Falha inesperada.' } satisfies ResponseMessage);
      });
    return true;
  });
}
