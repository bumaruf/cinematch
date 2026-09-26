import type { SyncProgress } from '../application/ports.ts';
import { isSyncProgressEvent, type Action, type RequestOf, type ResponseMessage, type ResponseOf } from './contract.ts';

const RELOADED =
  'A extensão foi recarregada no Chrome. Atualize esta página (F5) para reconectar.';

/** Sends a request to the background worker; rejects with its error message. */
export async function send<A extends Action>(action: A, ...args: RequestOf<A> extends void ? [] : [RequestOf<A>]): Promise<ResponseOf<A>> {
  if (!chrome.runtime?.id) throw new Error(RELOADED);
  let response: ResponseMessage<A> | undefined;
  try {
    response = await chrome.runtime.sendMessage({ action, payload: args[0] });
  } catch (error) {
    const message = (error as Error).message ?? '';
    throw new Error(/context invalidated|Receiving end does not exist/i.test(message) ? RELOADED : message);
  }
  if (!response) throw new Error('O serviço da extensão não respondeu. Tente novamente.');
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

/**
 * Syncs a Letterboxd profile to completion. Each request collects one batch,
 * so the worker never runs past Chrome's event deadline.
 */
export async function syncProfileFully(
  username: string,
  { forceFull = false, onProgress = () => {} }: { forceFull?: boolean; onProgress?: (message: string) => void } = {},
): Promise<Extract<ResponseOf<'syncProfile'>, { pending: false }>> {
  let force = forceFull;
  for (;;) {
    const result = await send('syncProfile', { username, forceFull: force });
    force = false;
    if (!result.pending) return result;
    onProgress(`${result.collected} de ${result.totalFilms} filmes coletados…`);
  }
}

/** Calls back with each progress update broadcast during a sync. */
export function onSyncProgress(listener: (progress: SyncProgress) => void): () => void {
  const handler = (message: unknown): void => {
    if (isSyncProgressEvent(message)) listener(message.progress);
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
