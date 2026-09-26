import type { ActiveProfile } from '../../../application/profile.ts';

type Listener = (active: ActiveProfile | null) => void;

/** The profile every dashboard section renders; sections subscribe to changes. */
export function createProfileState() {
  let active: ActiveProfile | null = null;
  const listeners = new Set<Listener>();
  return {
    get: () => active,
    set(next: ActiveProfile | null): void {
      active = next;
      for (const listener of listeners) listener(active);
    },
    subscribe(listener: Listener): void {
      listeners.add(listener);
    },
  };
}

export type ProfileState = ReturnType<typeof createProfileState>;

export interface Notifier {
  toast(message: string, durationMs?: number): void;
  error(message: string): void;
}
