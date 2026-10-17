import type { ProfileOverview } from '../../../application/profile.ts';
import type { InterpretedBy, Recommendation } from '../../../domain/film.ts';
import { THEMES_CATALOG } from '../../../domain/themes/themes.ts';
import { onSyncProgress, send, syncProfileFully } from '../../../messaging/client.ts';
import { byId, copyWithFeedback, hide, onReady, show } from '../../shared/dom.ts';
import { recommendationsText } from '../../shared/export.ts';
import { savedMatcher, type FilmLike } from '../../shared/film.ts';
import { filmCard, filmSkeletons } from '../../shared/film-card.ts';
import { readFilters } from '../../shared/filters.ts';
import { html, render, safeUrl } from '../../shared/html.ts';
import { interpretationText } from '../../shared/interpretation.ts';
import { usernameFromLetterboxdUrl } from '../../shared/letterboxd.ts';

interface Results {
  title: string;
  note: string;
  films: Recommendation[];
  interpretation?: string[];
  interpretedBy?: InterpretedBy;
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
    interpretation: byId('popupInterpretation'),
  };

  let hasProfile = false;
  let profileUsername = '';
  let selectedThemeId: string | null = null;
  let current: Recommendation[] = [];
  let syncing = false;
  let generating = false;
  let generation = 0;

  const showError = (message: string): void => {
    el.errorMessage.textContent = message;
    show(el.errorBanner);
  };

  function view(state: 'home' | 'loading' | 'results'): void {
    show(el.home, state === 'home');
    show(el.results, state !== 'home');
    el.films.setAttribute('aria-busy', String(state === 'loading'));
    el.copyAll.hidden = state === 'loading';
    if (state === 'loading') {
      // Placeholders in the shape of the results keep the layout still.
      el.resultsTitle.textContent = 'Buscando filmes…';
      el.resultsNote.textContent = '';
      el.interpretation.textContent = '';
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

  function displayProfile(profile: ProfileOverview, average: number): void {
    hasProfile = true;
    profileUsername = profile.username;
    profileState('loaded');
    el.displayName.textContent = profile.displayName || profile.username;
    el.displayName.title = `@${profile.username}`;
    el.totalFilms.textContent = (profile.totalFilms || profile.filmCount).toLocaleString('pt-BR');
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
      const synced = await syncProfileFully(username, { onProgress: (message) => (el.syncProgress.textContent = message) });
      displayProfile(synced.profile, synced.analyzed.stats.avgRating);
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
    return hasProfile;
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

  async function showResults({ title, note, films, interpretation, interpretedBy }: Results, persist = true): Promise<void> {
    const expected = profileUsername;
    const requestId = generation;
    const saved = await send('listSavedFilms');
    if (expected !== profileUsername || requestId !== generation) return;
    const isSaved = savedMatcher(saved);
    current = films;
    el.resultsTitle.textContent = title;
    el.resultsNote.textContent = films.length ? note : '';
    el.interpretation.textContent = interpretationText(interpretation, interpretedBy);
    if (films.length === 0) {
      render(el.films, html`<div class="py-6"><p class="mb-4 text-muted" role="status">${note || 'Nenhum filme novo com esses critérios. Tente outro clima ou tire um filtro.'}</p><button type="button" class="btn btn-secondary" data-general-recovery>Ver sugestões gerais</button><p class="mt-2 text-[12px] text-muted">Busca sem clima, texto ou filtros. Seus assistidos e feedback continuam sendo respeitados.</p></div>`);
      el.films.querySelector<HTMLButtonElement>('[data-general-recovery]')!.addEventListener('click', async event => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        try {
          await send('updateSettings', { minVotes: 0 });
          el.prompt.value = ''; selectedThemeId = null;
          el.decade.value = ''; el.runtime.value = ''; el.niche.checked = false;
          markSelected(); updateGenerateState();
          await generate();
        } catch (error) { button.disabled = false; showError((error as Error).message); }
      });
    } else {
      el.films.replaceChildren(...films.map((film, i) => filmCard(film, { onToggleSave: toggleSave, saved: isSaved(film), feedbackUsername: expected, index: i })));
    }
    view('results');
    if (persist && profileUsername) {
      void send('savePopupSession', { username: profileUsername, view: 'results', prompt: '', result: { title, note, films, interpretation, interpretedBy } }).catch(() => {
        // Restoring the list is a convenience; the visible result remains usable.
      });
    }
  }

  async function generate(): Promise<void> {
    if (!hasProfile) return showError('Conecte seu perfil do Letterboxd primeiro.');
    if (generating) return;
    const customPrompt = el.prompt.value.trim();
    generating = true;
    const requestId = ++generation;
    const username = profileUsername;
    hide(el.errorBanner);
    view('loading');
    try {
      const result = await send('generateRecommendations', {
        themeId: customPrompt ? null : selectedThemeId,
        customPrompt,
        username,
        filters: readFilters({ decade: el.decade, runtime: el.runtime, nicheOnly: el.niche }),
      });
      if (requestId !== generation) return;
      await showResults({ title: result.themeName, note: result.notice, films: result.recommendations, interpretation: result.interpretation, interpretedBy: result.interpretedBy });
    } catch (error) {
      view('home');
      showError((error as Error).message);
    } finally {
      generating = false;
    }
  }

  async function surprise(): Promise<void> {
    if (!hasProfile) return showError('Conecte seu perfil do Letterboxd primeiro.');
    if (generating) return;
    generating = true;
    const requestId = ++generation;
    hide(el.errorBanner);
    view('loading');
    try {
      const { data } = await send('getSurprisePick');
      if (requestId !== generation) return;
      await showResults({ title: 'Uma sugestão para você', note: '', films: [data.film] });
    } catch (error) {
      view('home');
      showError((error as Error).message);
    } finally {
      generating = false;
    }
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  onSyncProgress((progress) => (el.syncProgress.textContent = progress.message || 'Sincronizando…'));
  byId('btnOpenSettings').addEventListener('click', () => void send('openDashboard', { hash: 'settings' }));
  byId('btnOpenDashboard').addEventListener('click', () => void send('openDashboard', {}));
  byId('btnDismissError').addEventListener('click', () => hide(el.errorBanner));
  byId('btnGenerateCustom').addEventListener('click', () => void generate());
  byId('btnDailyRec').addEventListener('click', () => void surprise());
  byId('btnNewSearch').addEventListener('click', () => {
    generation++;
    selectedThemeId = null;
    markSelected();
    updateGenerateState();
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
    // The header needs no catalog; the catalog starts loading meanwhile, so the
    // first climate click does not pay for it.
    void send('warmUp').catch(() => {});
    const [summary, session] = await Promise.all([send('getProfileSummary'), send('getPopupSession')]);
    if (summary) {
      displayProfile(summary.profile, summary.avgRating);
      if (session?.username.toLowerCase() === summary.profile.username.toLowerCase()) {
        if (session.view === 'results' && session.result) await showResults(session.result, false);
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
