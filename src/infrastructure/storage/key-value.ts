/** Minimal async key-value store: chrome.storage.local, or memory in tests. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export function chromeKeyValueStore(area: chrome.storage.StorageArea = chrome.storage.local): KeyValueStore {
  return {
    async get<T>(key: string) {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    set: (values) => area.set(values),
    remove: (keys) => area.remove(keys),
  };
}

export function memoryKeyValueStore(initial: Record<string, unknown> = {}): KeyValueStore & { dump(): Record<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  return {
    async get<T>(key: string) {
      return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) data.set(key, structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}
