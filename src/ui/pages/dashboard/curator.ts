import type { Recommendation } from '../../../domain/film.ts';
import { THEMES_CATALOG } from '../../../domain/themes/themes.ts';
import { send } from '../../../messaging/client.ts';
import { byId, copyWithFeedback, hide, show } from '../../shared/dom.ts';
import { recommendationsText } from '../../shared/export.ts';
import { savedMatcher, type FilmLike } from '../../shared/film.ts';
import { filmCard, filmSkeletons } from '../../shared/film-card.ts';
import { readFilters } from '../../shared/filters.ts';
import { html, render } from '../../shared/html.ts';
import { interpretationText } from '../../shared/interpretation.ts';
import type { Notifier } from './state.ts';
import { setupRecommendationEvaluation } from './evaluation.ts';

type ThemeCollection = {
  title: string;
  description: string;
  themeIds: readonly string[];
};

const THEME_COLLECTIONS: readonly ThemeCollection[] = [
  {
    title: 'Quero tensão',
    description: 'Nervos à flor da pele.',
    themeIds: ['psychological-slow-burn-horror', 'paranoia-70s-conspiracy-thriller', 'claustrophobic-single-location', 'cyberpunk-neon-noir'],
  },
  {
    title: 'Quero mergulhar',
    description: 'Outro ritmo, outro mundo.',
    themeIds: ['slow-cinema-contemplative', 'dreamlike-magical-realism', 'philosophical-hard-scifi', 'hidden-gems-underrated'],
  },
  {
    title: 'Quero me surpreender',
    description: 'Nada é tão estável quanto parece.',
    themeIds: ['mindfuck-broken-reality', 'acid-satire-dark-comedy', 'gritty-90s-crime-neo-realism'],
  },
  {
    title: 'Quero me emocionar',
    description: 'Histórias que ficam depois dos créditos.',
    themeIds: ['existential-urban-melancholy', 'cozy-bittersweet-coming-of-age', 'poetic-romance-fleeting-encounters', 'whimsical-cozy-comfort'],
  },
];

/** Free-text search, themes, filters and the result list. */
export function setupCurator({
  notify,
  onSavedChange,
  hasDaily,
  currentUsername,
}: {
  notify: Notifier;
  onSavedChange: () => void;
  /** Whether the daily pick has content to show again after a failed search. */
  hasDaily: () => boolean;
  currentUsername: () => string | null;
}) {
  const el = {
    prompt: byId<HTMLInputElement>('dashCustomPrompt'),
    generate: byId<HTMLButtonElement>('dashBtnGenerate'),
    decade: byId<HTMLSelectElement>('dashFilterDecade'),
    runtime: byId<HTMLSelectElement>('dashFilterRuntime'),
    niche: byId<HTMLInputElement>('dashFilterNiche'),
    themes: byId('dashThemesGrid'),
    results: byId('dashResultsArea'),
    resultsTitle: byId('dashResultsTitle'),
    note: byId('dashCuratorComment'),
    list: byId('dashMoviesGrid'),
    exportText: byId('dashBtnExportText'),
    daily: byId('dashDailyRecHero'),
    interpretation: byId('dashInterpretation'),
  };
  const evaluation = setupRecommendationEvaluation(notify, currentUsername);
  let selectedThemeId: string | null = null;
  let current: Recommendation[] = [];
  let generation = 0;

  function markSelected(): void {
    for (const option of el.themes.querySelectorAll<HTMLElement>('[data-theme-id]')) {
      option.setAttribute('aria-pressed', String(option.dataset.themeId === selectedThemeId));
    }
  }

  const toggleSave = async (film: FilmLike): Promise<boolean> => {
    try {
      const { isSaved } = await send('toggleSavedFilm', film);
      onSavedChange();
      return isSaved;
    } catch (error) {
      notify.error((error as Error).message);
      throw error;
    }
  };

  /**
   * Requests a list. A new request (another climate, say) replaces one still
   * running: the late answer of the earlier one is ignored.
   * `ignoreMinVotes` drops the saved popularity floor for this request only.
   */
  async function generate({ ignoreMinVotes = false } = {}): Promise<void> {
    const customPrompt = el.prompt.value.trim();
    const requestId = ++generation;
    const username = currentUsername() ?? 'convidado';
    evaluation.reset();
    el.generate.disabled = true;
    // Poster-shaped placeholders hold the grid while the worker searches.
    hide(el.daily);
    el.resultsTitle.textContent = 'Buscando filmes…';
    el.note.textContent = '';
    el.interpretation.textContent = '';
    el.list.setAttribute('aria-busy', 'true');
    el.exportText.hidden = true;
    el.list.replaceChildren(...filmSkeletons(6, 'poster'));
    show(el.results);
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const [result, saved] = await Promise.all([send('generateRecommendations', {
        themeId: customPrompt ? null : selectedThemeId,
        customPrompt,
        username,
        filters: { ...readFilters({ decade: el.decade, runtime: el.runtime, nicheOnly: el.niche }), ...(ignoreMinVotes ? { minVotes: 0 } : {}) },
      }), send('listSavedFilms')]);
      if (requestId !== generation || username !== (currentUsername() ?? 'convidado')) return;
      const isSaved = savedMatcher(saved);
      current = result.recommendations;
      evaluation.show(result);
      el.resultsTitle.textContent = result.themeName;
      el.exportText.hidden = current.length === 0;
      el.note.textContent = current.length ? result.notice : '';
      el.interpretation.textContent = interpretationText(result.interpretation, result.interpretedBy);
      if (current.length === 0) {
        render(el.list, html`<div class="col-span-full py-6"><p class="mb-4 text-muted" role="status">${result.notice || 'Nenhum filme com esses critérios. Tente outro clima ou tire um filtro.'}</p><button type="button" class="btn btn-secondary" data-general-recovery>Ver sugestões gerais</button><p class="mt-2 text-[12px] text-muted">Busca sem clima, texto ou filtros. Seus assistidos e feedback continuam sendo respeitados.</p></div>`);
        el.list.querySelector<HTMLButtonElement>('[data-general-recovery]')!.addEventListener('click', async event => {
          const button = event.currentTarget as HTMLButtonElement;
          button.disabled = true;
          el.prompt.value = ''; selectedThemeId = null;
          el.decade.value = ''; el.runtime.value = ''; el.niche.checked = false;
          markSelected();
          await generate({ ignoreMinVotes: true });
        });
      } else {
        el.list.replaceChildren(...current.map((film, index) => filmCard(film, { variant: 'poster', onToggleSave: toggleSave, saved: isSaved(film), feedbackUsername: username, index })));
      }
    } catch (error) {
      if (requestId !== generation) return;
      hide(el.results);
      show(el.daily, hasDaily());
      notify.error((error as Error).message);
    } finally {
      // A newer request still running keeps the busy state.
      if (requestId === generation) {
        el.generate.disabled = false;
        el.list.setAttribute('aria-busy', 'false');
      }
    }
  }

  const themesById = new Map(THEMES_CATALOG.map((theme) => [theme.id, theme]));
  let activeCollectionIndex = 0;

  function renderThemePicker(): void {
    const activeCollection = THEME_COLLECTIONS[activeCollectionIndex];
    const picker = document.createElement('div');
    const collectionControls = document.createElement('div');
    collectionControls.className = 'flex flex-wrap gap-2';
    collectionControls.setAttribute('aria-label', 'Tipos de clima');
    const themesTitleId = 'activeThemeCollection';

    collectionControls.replaceChildren(
      ...THEME_COLLECTIONS.map((collection, index) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.className =
          'rounded-full border border-line px-4 py-2 text-left text-[13px] font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink pressed:border-brand pressed:bg-brand pressed:text-on-brand';
        control.setAttribute('aria-pressed', String(index === activeCollectionIndex));
        render(control, html`${collection.title}`);
        control.addEventListener('click', () => {
          activeCollectionIndex = index;
          renderThemePicker();
        });
        return control;
      }),
    );

    const collectionHeader = document.createElement('div');
    collectionHeader.className = 'mt-7';
    render(
      collectionHeader,
      html`<h3 id="${themesTitleId}" class="font-serif text-2xl font-medium">${activeCollection.title}</h3><p class="mt-1 text-[13px] text-muted">${activeCollection.description}</p>`,
    );

    const list = document.createElement('ul');
    list.className = 'mt-3 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3';
    list.setAttribute('aria-labelledby', themesTitleId);
    list.setAttribute('role', 'list');
    list.replaceChildren(
      ...activeCollection.themeIds.flatMap((themeId) => {
        const theme = themesById.get(themeId);
        if (!theme) return [];
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.className =
          'group flex min-h-28 w-full cursor-pointer flex-col justify-between rounded-card border border-line bg-surface p-4 text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-line-strong hover:bg-raised pressed:border-brand pressed:bg-brand/10 motion-reduce:transform-none';
        option.dataset.themeId = theme.id;
        option.setAttribute('aria-pressed', String(theme.id === selectedThemeId));
        render(
          option,
          html`<span class="font-serif text-xl leading-tight font-medium group-aria-pressed:text-brand">${theme.shortTitle}</span><span class="mt-3 line-clamp-2 text-[13px] leading-snug text-muted">${theme.vibe}</span>`,
        );
        // A climate remains an immediate recommendation request.
        option.addEventListener('click', () => {
          selectedThemeId = theme.id;
          el.prompt.value = '';
          markSelected();
          void generate();
        });
        item.append(option);
        return [item];
      }),
    );

    picker.append(collectionControls, collectionHeader, list);
    el.themes.replaceChildren(picker);
  }

  renderThemePicker();

  el.generate.addEventListener('click', () => {
    // Without a prompt, the search uses general taste, not an earlier theme.
    if (!el.prompt.value.trim()) {
      selectedThemeId = null;
      markSelected();
    }
    void generate();
  });
  el.prompt.addEventListener('keydown', (event) => event.key === 'Enter' && !event.isComposing && el.generate.click());
  el.prompt.addEventListener('input', () => {
    if (el.prompt.value.trim() && selectedThemeId) {
      selectedThemeId = null;
      markSelected();
    }
  });
  el.exportText.addEventListener('click', () => {
    if (current.length) void copyWithFeedback(el.exportText, recommendationsText(`${el.resultsTitle.textContent} — CineMatch`, current), 'Copiada');
  });

  return {
    refreshEvaluation: evaluation.refresh,
    /** Hides results that belonged to the previous profile. */
    reset(): void {
      generation++;
      current = [];
      evaluation.reset();
      hide(el.results);
      // A request still running for the previous profile no longer counts.
      el.generate.disabled = false;
      el.list.setAttribute('aria-busy', 'false');
    },
  };
}
