import { MODEL_SESSION_OPTIONS } from '../../domain/recommend/model-session.ts';

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface LanguageModelDownloader {
  create(options: object & { monitor?: (monitor: DownloadMonitor) => void }): Promise<{ destroy(): void }>;
}

/** True when this page can start Chrome's model download. */
export function canDownloadOnDeviceModel(): boolean {
  return Boolean((globalThis as { LanguageModel?: unknown }).LanguageModel);
}

/**
 * Starts (or joins) the Gemini Nano download. Chrome requires a user
 * activation, so this must run from a click handler. The service worker
 * cannot do it; it only uses the model once it is available.
 */
export async function downloadOnDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  const api = (globalThis as { LanguageModel?: LanguageModelDownloader }).LanguageModel;
  if (!api) throw new Error('Este navegador não oferece a Prompt API do Chrome.');
  const session = await api.create({
    ...MODEL_SESSION_OPTIONS,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
    },
  });
  session.destroy();
}
