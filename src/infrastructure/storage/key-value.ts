/** Minimal async key-value store: chrome.storage.local, or memory in tests. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  update<T>(key: string, transform: (current: T | undefined) => T): Promise<T>;
}

// Only pending operations live here; all user data remains in chrome.storage.
const areaQueues = new WeakMap<object, Map<string, Promise<unknown>>>();

export function chromeKeyValueStore(area: chrome.storage.StorageArea = chrome.storage.local): KeyValueStore {
  const queues = areaQueues.get(area) ?? new Map<string, Promise<unknown>>();
  areaQueues.set(area, queues);
  return {
    async get<T>(key: string) {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    set: (values) => area.set(values),
    remove: (keys) => area.remove(keys),
    async update<T>(key: string, transform: (current: T | undefined) => T): Promise<T> {
      const run = async (): Promise<T> => {
        const current = await area.get(key);
        const updated = transform(current[key] as T | undefined);
        await area.set({ [key]: updated });
        return updated;
      };
      if (globalThis.navigator?.locks) return navigator.locks.request(`cinematch-storage-${area === globalThis.chrome?.storage?.session ? 'session' : 'local'}-${key}`, run);
      const previous = queues.get(key);
      const pending = (async () => { try { await previous; } catch { /* A failed write must not block the queue. */ } return run(); })();
      queues.set(key, pending);
      try { return await pending; } finally { if (queues.get(key) === pending) queues.delete(key); }
    },
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
    async update<T>(key: string, transform: (current: T | undefined) => T): Promise<T> {
      const updated = transform(data.has(key) ? structuredClone(data.get(key)) as T : undefined);
      data.set(key, structuredClone(updated));
      return structuredClone(updated);
    },
    dump: () => Object.fromEntries(data),
  };
}
