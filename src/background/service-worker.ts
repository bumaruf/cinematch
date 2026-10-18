import { repairLegacyCsvProfile } from '../application/profile.ts';
import { refreshRatings } from '../application/ratings.ts';
import { chromeKeyValueStore } from '../infrastructure/storage/key-value.ts';
import { removeObsoleteData } from '../infrastructure/storage/stores.ts';
import { chromePlatform, createContext, listen } from './composition.ts';
import { createHandlers } from './router.ts';

const kv = chromeKeyValueStore();
const ctx = createContext(kv, chromeKeyValueStore(chrome.storage.session));

chrome.runtime.onInstalled.addListener(async () => {
  await removeObsoleteData(kv);
  await repairLegacyCsvProfile(ctx);
  // IMDb's scores are not in the package; this browser downloads them once installed.
  await refreshRatings(ctx).catch((error: unknown) => console.warn('[CineMatch] notas do IMDb:', error));
});

listen(createHandlers(ctx, chromePlatform));
