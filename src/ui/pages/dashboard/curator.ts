import type { Recommendation } from '../../../domain/film.ts';
import { THEMES_CATALOG } from '../../../domain/themes/themes.ts';
import { send } from '../../../messaging/client.ts';
import { byId, copyWithFeedback, hide, show } from '../../shared/dom.ts';
import { recommendationsText } from '../../shared/export.ts';
import type { FilmLike } from '../../shared/film.ts';
import { filmCard, filmSkeletons } from '../../shared/film-card.ts';
import { readFilters } from '../../shared/filters.ts';
import { html, render } from '../../shared/html.ts';
import type { Notifier } from './state.ts';

/** Free-text search, themes, filters and the result list. */
export function setupCurator({
  notify,
  onSavedChange,
  hasDaily,
}: {
  notify: Notifier;
  onSavedChange: () => void;
  /** Whether the daily pick has content to show again after a failed search. */
  hasDaily: () => boolean;
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
  };
  let selectedThemeId: string | null = null;
  let generating = false;
  let current: Recommendation[] = [];

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

  async function generate(): Promise<void> {
    if (generating) return;
    const customPrompt = el.prompt.value.trim();
    generating = true;
    el.generate.disabled = true;
    // Poster-shaped placeholders hold the grid while the worker searches.
    hide(el.daily);
    el.resultsTitle.textContent = 'Buscando filmes…';
    el.note.textContent = '';
    el.exportText.hidden = true;
    el.list.replaceChildren(...filmSkeletons(6, 'poster'));
    show(el.results);
    el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const result = await send('generateRecommendations', {
        themeId: customPrompt ? null : selectedThemeId,
        customPrompt,
        filters: readFilters({ decade: el.decade, runtime: el.runtime, nicheOnly: el.niche }),
      });
      current = result.recommendations;
      el.resultsTitle.textContent = result.themeName;
      el.exportText.hidden = current.length === 0;
      el.note.textContent = current.length ? result.notice : '';
      if (current.length === 0) {
        render(el.list, html`<p class="col-span-full py-6 text-muted">${result.notice} Tente outro clima ou tire um filtro.</p>`);
      } else {
        el.list.replaceChildren(...current.map((film, index) => filmCard(film, { variant: 'poster', onToggleSave: toggleSave, index })));
      }
    } catch (error) {
      hide(el.results);
      show(el.daily, hasDaily());
      notify.error((error as Error).message);
    } finally {
      generating = false;
      el.generate.disabled = false;
    }
  }

  el.themes.replaceChildren(
    ...THEMES_CATALOG.map((theme) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className =
        'group flex cursor-pointer flex-col gap-1 rounded-card border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-surface pressed:border-accent/50 pressed:bg-accent/5';
      option.dataset.themeId = theme.id;
      option.setAttribute('aria-pressed', 'false');
      render(
        option,
        html`<span class="font-semibold group-aria-pressed:text-accent">${theme.title}</span><span class="line-clamp-2 text-[13px] text-muted">${theme.vibe}</span>`,
      );
      // One click is enough: a theme is a complete request.
      option.addEventListener('click', () => {
        selectedThemeId = theme.id;
        el.prompt.value = '';
        markSelected();
        void generate();
      });
      return option;
    }),
  );

  el.generate.addEventListener('click', () => {
    // Without a prompt, the search uses general taste, not an earlier theme.
    if (!el.prompt.value.trim()) {
      selectedThemeId = null;
      markSelected();
    }
    void generate();
  });
  el.prompt.addEventListener('keydown', (event) => event.key === 'Enter' && el.generate.click());
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
    /** Hides results that belonged to the previous profile. */
    reset(): void {
      current = [];
      hide(el.results);
    },
  };
}
