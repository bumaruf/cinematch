export const LETTERBOXD_ORIGIN = 'https://letterboxd.com';
export const LETTERBOXD_MATCHES = ['https://letterboxd.com/*', 'https://*.letterboxd.com/*'];
const TIMEOUT_MS = 15_000;

/** Fetches a Letterboxd page and returns its HTML/XML. */
export type PageFetcher = (url: string) => Promise<string>;

/** Letterboxd answered, and retrying right away will not help. */
export class LetterboxdError extends Error {
  override name = 'LetterboxdError';
}

export class LetterboxdBlockedError extends LetterboxdError {
  override name = 'LetterboxdBlockedError';
  constructor() {
    super(
      'O Letterboxd bloqueou ou limitou a consulta. Abra o perfil no mesmo navegador da extensão, conclua a verificação do site se ela aparecer e tente sincronizar novamente.',
    );
  }
}

export class LetterboxdNotFoundError extends LetterboxdError {
  override name = 'LetterboxdNotFoundError';
  readonly url: string;
  constructor(url: string) {
    super(`Página não encontrada: ${url}`);
    this.url = url;
  }
}

/** Human verification pages (Cloudflare) served instead of the content. */
export function isVerificationPage(html: string): boolean {
  return /<title[^>]*>\s*Just a moment|cf-chl-|challenge-platform|Verify you are human/i.test(html);
}

export async function fetchLetterboxdPage(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (response.status === 403 || response.status === 429) throw new LetterboxdBlockedError();
    if (response.status === 404) throw new LetterboxdNotFoundError(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} ao acessar: ${url}`);
    return await response.text();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('Tempo de requisição esgotado.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches through an open Letterboxd tab first, so the request carries the
 * user's session and any completed verification; falls back to a direct
 * request.
 */
export function tabAwareFetcher(direct: PageFetcher = (url) => fetchLetterboxdPage(url)): PageFetcher {
  let tabId: number | undefined;
  let looked = false;
  return async (url) => {
    if (!looked) {
      looked = true;
      const tabs = await chrome.tabs.query({ url: LETTERBOXD_MATCHES });
      tabId = tabs.find((tab) => tab.url && !tab.discarded)?.id;
    }
    if (tabId !== undefined) {
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId },
          args: [url, TIMEOUT_MS],
          func: async (target: string, timeout: number) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
              const response = await fetch(target, { credentials: 'include', signal: controller.signal });
              return { ok: response.ok, text: await response.text() };
            } finally {
              clearTimeout(timer);
            }
          },
        });
        const result = injection?.result as { ok: boolean; text: string } | undefined;
        if (result?.ok) return result.text;
      } catch (error) {
        console.warn('[Sync] Tentando requisição direta:', (error as Error).message);
      }
    }
    return direct(url);
  };
}
