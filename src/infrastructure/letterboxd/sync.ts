import type { LetterboxdSync, SyncBatchResult, SyncCheckpoint, SyncCheckpointStore, SyncProgress } from '../../application/ports.ts';
import type { ProfileFilm, UserProfile } from '../../domain/film.ts';
import { isVerificationPage, LETTERBOXD_ORIGIN, LetterboxdError, LetterboxdNotFoundError, type PageFetcher } from './http.ts';
import { cleanUsername, parseFilmsListHtml, parseProfileHtml, parseRssFeed } from './parse.ts';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A batch must end well before Chrome stops an idle service worker. */
const BATCH_DEADLINE_MS = 90_000;
const PAGES_PER_BATCH = 3;
const FILMS_PER_PAGE = 72;

type Progress = (progress: SyncProgress) => void;

interface Dependencies {
  fetchPage: PageFetcher;
  checkpoints: SyncCheckpointStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createLetterboxdSync({ fetchPage, checkpoints, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: Dependencies): LetterboxdSync {
  return {
    clearProgress: () => checkpoints.clear(),
    async syncBatch(rawUsername, { previous, forceFull, onProgress }) {
      const username = cleanUsername(rawUsername);
      if (!username) throw new Error('Informe um usuário válido.');
      if (forceFull) await checkpoints.clear();
      const checkpoint = await checkpoints.get();
      const deadline = now() + BATCH_DEADLINE_MS;

      const fetchWithRetry: PageFetcher = async (url) => {
        for (let attempt = 0; ; attempt++) {
          if (now() > deadline) throw new Error('Tempo deste bloco esgotado. Sincronize novamente para retomar.');
          try {
            return await fetchPage(url);
          } catch (error) {
            // Blocks and verification need the user, not a burst of retries.
            if (attempt >= 2 || error instanceof LetterboxdError) throw error;
            onProgress({ message: `Conexão interrompida. Nova tentativa ${attempt + 1}/2…` });
            await sleep(1000 * 2 ** attempt);
          }
        }
      };

      const recentlyFull =
        previous?.username === username &&
        now() - Date.parse(previous.lastFullSync || '') < WEEK_MS &&
        previous.films?.length === previous.totalFilms;
      if (!forceFull && checkpoint?.username !== username && previous && recentlyFull) {
        const updated = await syncRecent(username, previous, fetchWithRetry, now);
        if (updated) return { pending: false, profile: updated };
      }

      const result = await collectFullProfile(username, fetchWithRetry, {
        checkpoint: forceFull ? null : checkpoint,
        maxPages: PAGES_PER_BATCH,
        saveCheckpoint: (value) => checkpoints.save(value),
        onProgress,
        now,
      });
      if (result.pending) return result;
      return { pending: false, profile: { ...result.profile, lastFullSync: new Date(now()).toISOString(), syncMode: 'full' } };
    },
  };
}

/**
 * RSS is only trusted to update films already known to be watched; a changed
 * count or an unknown entry requires the authoritative /films/ pages.
 * Returns null when the incremental path cannot be used.
 */
async function syncRecent(username: string, previous: UserProfile, fetchPage: PageFetcher, now: () => number): Promise<UserProfile | null> {
  const metadata = parseProfileHtml(await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/`));
  if (!metadata.filmCountKnown || !metadata.displayName || metadata.totalFilms < (previous.totalFilms ?? 0)) return null;
  try {
    const xml = await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/rss/`);
    if (!/<rss\b/i.test(xml)) return null;
    const recent = parseRssFeed(xml);
    const known = new Map<string, ProfileFilm>(previous.films.map((film) => [film.slug ?? '', { ...film, isFavorite: false }]));
    const pageHtml = await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/films/`);
    if (isVerificationPage(pageHtml)) return null;
    const firstPage = parseFilmsListHtml(pageHtml);
    if (metadata.totalFilms > 0 && !firstPage.length) return null;
    for (const film of firstPage) {
      if (!film.slug) return null;
      known.set(film.slug, { ...known.get(film.slug), ...film, isFavorite: false });
    }
    if (known.size !== metadata.totalFilms || !recent.every((film) => film.slug && known.has(film.slug))) return null;

    // The first RSS entry is the most recent; older rewatches must not win.
    const updated = new Set<string>();
    for (const film of recent) {
      if (updated.has(film.slug)) continue;
      if (film.rating != null) known.get(film.slug)!.rating = film.rating;
      updated.add(film.slug);
    }
    // The current watched page overrides potentially older diary ratings.
    for (const film of firstPage) known.get(film.slug)!.rating = film.rating;
    for (const favorite of metadata.favorites) {
      const film = known.get(favorite.slug);
      if (film) film.isFavorite = true;
    }
    return { ...previous, ...metadata, films: [...known.values()], lastSync: new Date(now()).toISOString(), syncMode: 'recent' };
  } catch {
    // The full sync remains available when RSS cannot be used.
    return null;
  }
}

interface CollectOptions {
  checkpoint: SyncCheckpoint | null;
  maxPages?: number;
  saveCheckpoint?: (checkpoint: SyncCheckpoint) => Promise<void>;
  onProgress?: Progress;
  now?: () => number;
}

type CollectResult = Extract<SyncBatchResult, { pending: true }> | { pending: false; profile: UserProfile };

/**
 * Collects the full watched history from /films/ pages. Membership comes
 * only from those pages: RSS rewatches and pinned favorites enrich entries
 * but cannot add films. Incomplete collections are rejected.
 */
export async function collectFullProfile(rawUsername: string, fetchPage: PageFetcher, options: CollectOptions = { checkpoint: null }): Promise<CollectResult> {
  const { onProgress = () => {}, now = Date.now } = options;
  const username = cleanUsername(rawUsername);
  if (!username) throw new Error('Por favor, informe um nome de usuário válido do Letterboxd.');
  onProgress({ stage: 'profile', message: `Buscando perfil de @${username}...`, percent: 5 });

  const films = new Map<string, ProfileFilm & { slug: string; title: string }>();
  const setFilm = (film: ProfileFilm, isFavorite: boolean, source: string): void => {
    const key = film.slug || (film.title || '').toLowerCase();
    if (!key) return;
    const existing = films.get(key);
    if (!existing) {
      films.set(key, { slug: film.slug || '', title: film.title || '', year: film.year || null, rating: film.rating, isFavorite, source });
      return;
    }
    if (film.rating != null && (source === 'films-page' || existing.rating == null)) existing.rating = film.rating;
    if (!existing.title && film.title) existing.title = film.title;
    if (!existing.year && film.year) existing.year = film.year;
    if (isFavorite) existing.isFavorite = true;
  };

  let metadata;
  try {
    const html = await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/`);
    if (isVerificationPage(html)) {
      throw new Error('O Letterboxd solicitou uma verificação. Abra o perfil no mesmo navegador da extensão, conclua a verificação do site e tente sincronizar novamente.');
    }
    metadata = parseProfileHtml(html);
    if (!metadata.displayName || !metadata.filmCountKnown) throw new Error('Página de perfil inválida, bloqueada ou sem contagem de filmes reconhecida.');
  } catch (error) {
    throw new Error('Não foi possível carregar o perfil. Os dados anteriores foram preservados. ' + (error as Error).message, { cause: error });
  }

  const { checkpoint } = options;
  const resumable = Boolean(
    checkpoint && checkpoint.username === username && checkpoint.totalFilms === metadata.totalFilms && now() - checkpoint.startedAt < DAY_MS,
  );
  if (resumable && checkpoint) {
    for (const film of checkpoint.films) films.set(film.slug || film.title.toLowerCase(), { ...film, slug: film.slug ?? '', isFavorite: false });
  }
  for (const favorite of metadata.favorites) setFilm({ ...favorite, year: null, rating: 5 }, true, 'favorite');

  onProgress({ stage: 'rss', message: 'Lendo RSS (diário e avaliações recentes)...', percent: 15 });
  try {
    for (const film of parseRssFeed(await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/rss/`))) setFilm(film, false, 'rss');
  } catch (error) {
    console.warn('[Sync] RSS indisponível:', (error as Error).message);
  }

  const total = metadata.totalFilms || 0;
  const pageCount = Math.ceil(total / FILMS_PER_PAGE);
  const lastPage = total > 0 ? pageCount + 2 : 999;
  const collected = new Set<string>(resumable && checkpoint ? checkpoint.collectedSlugs : []);
  const startPage = resumable && checkpoint ? checkpoint.nextPage : 1;
  const startedAt = resumable && checkpoint ? checkpoint.startedAt : now();
  let pagesProcessed = 0;

  for (let page = startPage; page <= lastPage; page++) {
    onProgress({
      stage: 'pages',
      message: `Coletando filmes e notas (página ${page}${total > 0 ? '/' + pageCount : ''})...`,
      percent: Math.min(95, 20 + Math.round((page / Math.max(lastPage, 1)) * 75)),
    });
    const path = page === 1 ? '/films/' : `/films/page/${page}/`;
    try {
      const html = await fetchPage(`${LETTERBOXD_ORIGIN}/${username}${path}`);
      const pageFilms = parseFilmsListHtml(html);
      if (pageFilms.length === 0) {
        if (page === 1 && !/poster-list|grid|no.films|hasn.t|no.results/i.test(html)) throw new Error('Lista de filmes inválida.');
        break;
      }
      const before = collected.size;
      for (const film of pageFilms) {
        collected.add(film.slug || film.title);
        setFilm(film, false, 'films-page');
      }
      if (collected.size === before && total > 0) throw new Error('Paginação repetiu a mesma página.');
      pagesProcessed++;
      await options.saveCheckpoint?.({ username, totalFilms: total, startedAt, nextPage: page + 1, collectedSlugs: [...collected], films: [...films.values()] });
      if (collected.size >= total) break;
      if (pagesProcessed >= (options.maxPages ?? Infinity)) return { pending: true, collected: collected.size, totalFilms: total };
    } catch (error) {
      // Letterboxd can report a count whose last page no longer exists.
      if (page > 1 && error instanceof LetterboxdNotFoundError && collected.size >= total) break;
      throw new Error('Sincronização interrompida; perfil anterior preservado. ' + (error as Error).message, { cause: error });
    }
  }
  if (collected.size < total) throw new Error(`Histórico incompleto: ${collected.size} de ${total} filmes. Perfil anterior preservado.`);

  const currentYear = new Date(now()).getFullYear();
  const thisYearFilms: ProfileFilm[] = [];
  try {
    for (const film of parseFilmsListHtml(await fetchPage(`${LETTERBOXD_ORIGIN}/${username}/year/${currentYear}/`))) {
      thisYearFilms.push(film);
    }
  } catch {
    // A profile without a page for this year is normal.
  }

  const allFilms = [...films.values()].filter((film) => collected.has(film.slug || film.title));
  if (allFilms.length !== total) throw new Error(`Histórico inconsistente: ${allFilms.length} de ${total} filmes. Sincronize novamente.`);
  onProgress({ stage: 'done', message: `Concluído! ${allFilms.length} filmes mapeados.`, percent: 100 });

  return {
    pending: false,
    profile: {
      username,
      displayName: metadata.displayName || username,
      bio: metadata.bio || '',
      avatarUrl: metadata.avatarUrl || '',
      totalFilms: metadata.totalFilms || allFilms.length,
      thisYearCount: metadata.thisYearCount || thisYearFilms.length,
      thisYearFilms,
      favorites: metadata.favorites,
      films: allFilms,
      lastSync: new Date(now()).toISOString(),
    },
  };
}
