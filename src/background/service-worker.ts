import { repairLegacyCsvProfile } from '../application/profile.ts';
import { chromeKeyValueStore } from '../infrastructure/storage/key-value.ts';
import { removeObsoleteData } from '../infrastructure/storage/stores.ts';
import { chromePlatform, createContext, listen } from './composition.ts';
import { createHandlers } from './router.ts';

const kv = chromeKeyValueStore();
const ctx = createContext(kv, chromeKeyValueStore(chrome.storage.session));

chrome.runtime.onInstalled.addListener(async () => {
  await removeObsoleteData(kv);
  await repairLegacyCsvProfile(ctx);
});

listen(createHandlers(ctx, chromePlatform));
