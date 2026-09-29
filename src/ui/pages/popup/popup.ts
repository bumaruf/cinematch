import type { ActiveProfile } from '../../../application/profile.ts';
import type { Recommendation } from '../../../domain/film.ts';
import { THEMES_CATALOG } from '../../../domain/themes/themes.ts';
import { onSyncProgress, send, syncProfileFully } from '../../../messaging/client.ts';
import { byId, copyWithFeedback, hide, onReady, show } from '../../shared/dom.ts';
import { recommendationsText } from '../../shared/export.ts';
import type { FilmLike } from '../../shared/film.ts';
import { filmCard, filmSkeletons } from '../../shared/film-card.ts';
import { readFilters } from '../../shared/filters.ts';
import { html, render, safeUrl } from '../../shared/html.ts';
import { usernameFromLetterboxdUrl } from '../../shared/letterboxd.ts';

interface Results {
  title: string;
  note: string;
  films: Recommendation[];
}

onReady(async () => {
  const el = {
    errorBanner: byId('errorBanner'),
    errorMessage: byId('errorMessage'),
    home: byId('homeView'),
    profileLoading: byId('profileLoading'),
    syncProgress: byId('syncProgressText'),
    profileEmpty: byId<HTMLFormElement>('profileEmpty'),
    profileLoaded: byId('profileLoaded'),
    discover: byId('discoverSection'),
    usernameInput: byId<HTMLInputElement>('usernameInput'),
    avatar: byId<HTMLImageElement>('userAvatar'),
    avatarFallback: byId('avatarFallback'),
    displayName: byId('userDisplayName'),
    totalFilms: byId('userTotalFilms'),
    avgRating: byId('userAvgRating'),
    prompt: byId<HTMLInputElement>('customPromptInput'),
    themes: byId('themesGrid'),
    decade: byId<HTMLSelectElement>('filterDecade'),
    runtime: byId<HTMLSelectElement>('filterRuntime'),
    niche: byId<HTMLInputElement>('filterNicheOnly'),
    results: byId('resultsSection'),
    resultsTitle: byId('resultsTitle'),
    resultsNote: byId('curatorNote'),
    films: byId('moviesContainer'),
    copyAll: byId('btnCopyAll'),
  };

  let hasProfile = false;
  let profileUsername = '';
  let selectedThemeId: string | null = null;
  let current: Recommendation[] = [];
  let syncing = false;

  const showError = (message: string): void => {
    el.errorMessage.textContent = message;
    show(el.errorBanner);
  };

  function view(state: 'home' | 'loading' | 'results'): void {
    show(el.home, state === 'home');
    show(el.results, state !== 'home');
    el.copyAll.hidden = state === 'loading';
    if (state === 'loading') {
      // Placeholders in the shape of the results keep the layout still.
      el.resultsTitle.textContent = 'Buscando filmes…';
      el.resultsNote.textContent = '';
      el.films.replaceChildren(...filmSkeletons(3));
    }
    window.scrollTo({ top: 0 });
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  function profileState(state: 'empty' | 'loading' | 'loaded'): void {
    show(el.profileEmpty, state === 'empty');
    show(el.profileLoading, state === 'loading');
    show(el.profileLoaded, state === 'loaded');
    // Discovery needs a history to compare against.
    show(el.discover, hasProfile && state !== 'empty');
  }

  function displayProfile({ profile, analyzed }: Pick<ActiveProfile, 'profile' | 'analyzed'>): void {
    hasProfile = true;
    profileUsername = profile.username;
    profileState('loaded');
    el.displayName.textContent = profile.displayName || profile.username;
    el.displayName.title = `@${profile.username}`;
    el.totalFilms.textContent = (profile.totalFilms || profile.films.length).toLocaleString('pt-BR');
    const average = analyzed.stats.avgRating;
    el.avgRating.textContent = average > 0 ? average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
    show(el.avatar, Boolean(profile.avatarUrl));
    show(el.avatarFallback, !profile.avatarUrl);
    if (profile.avatarUrl) el.avatar.src = safeUrl(profile.avatarUrl, '');
    else el.avatarFallback.textContent = (profile.displayName || profile.username).slice(0, 1).toUpperCase();
  }

  async function syncProfile(username: string): Promise<void> {
    if (syncing) return;
    syncing = true;
    profileState('loading');
    el.syncProgress.textContent = `Sincronizando @${username}…`;
    try {
      displayProfile(await syncProfileFully(username, { onProgress: (message) => (el.syncProgress.textContent = message) }));
    } catch (error) {
      profileState(hasProfile ? 'loaded' : 'empty');
      showError((error as Error).message || 'Não foi possível sincronizar. Confira o usuário e tente de novo.');
    } finally {
      syncing = false;
    }
  }

  // ── Themes ────────────────────────────────────────────────────────────────
  function markSelected(): void {
    for (const chip of el.themes.querySelectorAll<HTMLElement>('.chip')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.themeId === selectedThemeId));
    }
  }

  function hasSearchIntent(): boolean {
    return Boolean(selectedThemeId || el.prompt.value.trim());
  }

  function updateGenerateState(): void {
    byId<HTMLButtonElement>('btnGenerateCustom').disabled = !hasSearchIntent();
  }

  function saveDraft(): void {
    if (!profileUsername) return;
    void send('savePopupSession', { username: profileUsername, view: 'home', prompt: el.prompt.value }).catch(() => {
      // A draft must never prevent the current search from being used.
    });
  }

  el.themes.replaceChildren(
    ...THEMES_CATALOG.map((theme) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.themeId = theme.id;
      chip.title = theme.title;
      chip.textContent = theme.shortTitle;
      chip.setAttribute('aria-pressed', 'false');
      // One click is enough: a theme is a complete request.
      chip.addEventListener('click', () => {
        selectedThemeId = theme.id;
        el.prompt.value = '';
        markSelected();
        updateGenerateState();
        void generate();
      });
      return chip;
    }),
  );

  // ── Recommendations ───────────────────────────────────────────────────────
  const toggleSave = async (film: FilmLike): Promise<boolean> => {
    try {
      return (await send('toggleSavedFilm', film)).isSaved;
    } catch (error) {
      showError((error as Error).message);
      throw error;
    }
  };

  function showResults({ title, note, films }: Results, persist = true): void {
    current = films;
    el.resultsTitle.textContent = title;
    el.resultsNote.textContent = films.length ? note : '';
    if (films.length === 0) {
      render(el.films, html`<p class="py-6 text-muted">${note || 'Nenhum filme novo com esses critérios.'} Tente outro clima ou tire um filtro.</p>`);
    } else {
      el.films.replaceChildren(...films.map((film, i) => filmCard(film, { onToggleSave: toggleSave, index: i })));
    }
    view('results');
    if (persist && profileUsername) {
      void send('savePopupSession', { username: profileUsername, view: 'results', prompt: '', result: { title, note, films } }).catch(() => {
        // Restoring the list is a convenience; the visible result remains usable.
      });
    }
  }

  async function generate(): Promise<void> {
    if (!hasProfile) return showError('Conecte seu perfil do Letterboxd primeiro.');
    const customPrompt = el.prompt.value.trim();
    if (!customPrompt && !selectedThemeId) return;
    hide(el.errorBanner);
    view('loading');
    try {
      const result = await send('generateRecommendations', {
        themeId: customPrompt ? null : selectedThemeId,
        customPrompt,
        filters: readFilters({ decade: el.decade, runtime: el.runtime, nicheOnly: el.niche }),
      });
      showResults({ title: result.themeName, note: result.notice, films: result.recommendations });
    } catch (error) {
      view('home');
      showError((error as Error).message);
    }
  }

  async function surprise(): Promise<void> {
    if (!hasProfile) return showError('Conecte seu perfil do Letterboxd primeiro.');
    hide(el.errorBanner);
    view('loading');
    try {
      const { data } = await send('getDailyPick', { refresh: true });
      showResults({ title: 'Uma sugestão para você', note: '', films: [data.film] });
    } catch (error) {
      view('home');
      showError((error as Error).message);
    }
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  onSyncProgress((progress) => (el.syncProgress.textContent = progress.message || 'Sincronizando…'));
  byId('btnOpenSettings').addEventListener('click', () => void chrome.runtime.openOptionsPage());
  byId('btnOpenDashboard').addEventListener('click', () => void send('openDashboard', {}));
  byId('btnDismissError').addEventListener('click', () => hide(el.errorBanner));
  byId('btnGenerateCustom').addEventListener('click', () => void generate());
  byId('btnDailyRec').addEventListener('click', () => void surprise());
  byId('btnNewSearch').addEventListener('click', () => {
    view('home');
    saveDraft();
    el.prompt.focus();
  });
  el.copyAll.addEventListener('click', () => {
    if (current.length) void copyWithFeedback(el.copyAll, recommendationsText(`${el.resultsTitle.textContent} — CineMatch`, current), 'Copiada');
  });
  el.prompt.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && hasSearchIntent()) byId<HTMLButtonElement>('btnGenerateCustom').click();
  });
  el.prompt.addEventListener('input', () => {
    if (el.prompt.value.trim() && selectedThemeId) {
      selectedThemeId = null;
      markSelected();
    }
    updateGenerateState();
    saveDraft();
  });
  el.profileEmpty.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = el.usernameInput.value.trim();
    if (username) void syncProfile(username);
  });
  byId('btnImportCsv').addEventListener('click', () => void send('openDashboard', { hash: 'recovery' }));
  byId('btnChangeUser').addEventListener('click', () => {
    profileState('empty');
    el.usernameInput.focus();
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  try {
    const active = await send('getActiveProfile');
    if (active) {
      displayProfile(active);
      const session = await send('getPopupSession');
      if (session?.username.toLowerCase() === active.profile.username.toLowerCase()) {
        if (session.view === 'results' && session.result) showResults(session.result, false);
        else el.prompt.value = session.prompt;
      }
    } else profileState('empty');
  } catch (error) {
    profileState('empty');
    showError((error as Error).message);
  }
  if (!hasProfile) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const username = usernameFromLetterboxdUrl(tab?.url);
    if (username) el.usernameInput.value = username;
  }
  updateGenerateState();
});
