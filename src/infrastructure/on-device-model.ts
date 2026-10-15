import type { OnDeviceModel, OnDeviceModelStatus, StructuredPrompt } from '../application/ports.ts';

/**
 * The subset of Chrome's Prompt API (`LanguageModel`, Gemini Nano) used here.
 * See https://developer.chrome.com/docs/ai/prompt-api. The model runs on the
 * device; prompts and answers never leave the browser.
 */
export interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
}

export interface LanguageModelApi {
  availability(options?: object): Promise<string>;
  create(options?: object): Promise<LanguageModelSession>;
}

const STATUSES = new Set<OnDeviceModelStatus>(['unavailable', 'downloadable', 'downloading', 'available']);

/**
 * Adapter for the global `LanguageModel`. It never calls `create()` unless the
 * model is already `available`: a download needs user activation, which a
 * service worker does not have, so the options page starts it.
 */
export function chromeOnDeviceModel(
  api: LanguageModelApi | undefined = (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel,
): OnDeviceModel {
  // One base session per set of instructions; each prompt runs on a clone so
  // earlier requests never leak into the next one's context.
  let base: { key: string; session: Promise<LanguageModelSession> } | null = null;

  const status = async (sessionOptions: object): Promise<OnDeviceModelStatus> => {
    if (!api) return 'unsupported';
    const value = await api.availability(sessionOptions) as OnDeviceModelStatus;
    return STATUSES.has(value) ? value : 'unavailable';
  };

  const baseSession = (request: StructuredPrompt): Promise<LanguageModelSession> => {
    const key = JSON.stringify([request.instructions, request.sessionOptions]);
    if (base?.key !== key) {
      base?.session.then(session => session.destroy(), () => undefined);
      const session = api!.create({ ...request.sessionOptions, initialPrompts: [{ role: 'system', content: request.instructions }] });
      base = { key, session };
      session.catch(() => { if (base?.session === session) base = null; });
    }
    return base.session;
  };

  return {
    status,
    async promptJson(request) {
      if (await status(request.sessionOptions) !== 'available') throw new Error('O modelo no dispositivo não está pronto.');
      const signal = AbortSignal.timeout(request.timeoutMs);
      const session = await (await baseSession(request)).clone({ signal });
      try {
        const answer = await session.prompt(request.input, { responseConstraint: request.schema, signal });
        return JSON.parse(answer) as unknown;
      } finally {
        session.destroy();
      }
    },
  };
}
