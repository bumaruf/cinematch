import type { ActiveProfile, ProfileOverview } from '../../../application/profile.ts';

type Listener<T> = (value: T | null) => void;

/**
 * The profile every dashboard section renders. The overview (who, how many
 * films) arrives first and needs no catalog; the full profile (statistics,
 * top films) follows. Sections that only need to know who is active, like
 * the daily pick, start from the overview instead of waiting.
 */
export function createProfileState() {
  let overview: ProfileOverview | null = null;
  let active: ActiveProfile | null = null;
  const overviewListeners = new Set<Listener<ProfileOverview>>();
  const activeListeners = new Set<Listener<ActiveProfile>>();
  const setOverview = (next: ProfileOverview | null): void => {
    overview = next;
    for (const listener of overviewListeners) listener(overview);
  };
  const setActive = (next: ActiveProfile | null): void => {
    active = next;
    for (const listener of activeListeners) listener(active);
  };
  return {
    get: () => active,
    overview: () => overview,
    username: () => overview?.username ?? null,
    setOverview,
    /** Only the details: the overview it belongs to was already set. */
    setActive,
    /** A new profile (sync, import): overview and details together. */
    set(next: ActiveProfile | null): void {
      setOverview(next?.profile ?? null);
      setActive(next);
    },
    onOverview(listener: Listener<ProfileOverview>): void {
      overviewListeners.add(listener);
    },
    subscribe(listener: Listener<ActiveProfile>): void {
      activeListeners.add(listener);
    },
  };
}

export type ProfileState = ReturnType<typeof createProfileState>;

export interface Notifier {
  toast(message: string, durationMs?: number, tone?: 'default' | 'error'): void;
  error(message: string): void;
}
