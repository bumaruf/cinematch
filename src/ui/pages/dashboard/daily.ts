import { usernameKey } from '../../../domain/recommend/daily.ts';
import { send } from '../../../messaging/client.ts';
import { byId, hide, show } from '../../shared/dom.ts';
import { hydratePoster, letterboxdLink, savedMatcher, trailerSearchUrl } from '../../shared/film.ts';
import { feedbackControls } from '../../shared/feedback-controls.ts';
import { html, joinHtml, render } from '../../shared/html.ts';
import { ICONS } from '../../shared/icons.ts';

/** "Hoje para você": the daily pick, the page's one large, colorful moment. */
export function setupDailyHero(currentUsername: () => string | null, onSavedChange: () => void) {
  const hero = byId('dashDailyRecHero');
  const title = byId('dashDailyTitle');
  const meta = byId('dashDailyMeta');
  const reason = byId('dashDailyReason');
  const link = byId<HTMLAnchorElement>('dashDailyLbLink');
  const trailer = byId<HTMLAnchorElement>('dashDailyTrailerLink');
  const save = byId<HTMLButtonElement>('dashDailySave');
  const backdrop = byId<HTMLImageElement>('dashDailyBackdrop');
  const art = hero.querySelector<HTMLElement>('.daily-art')!;
  let loaded = false;
  let generation = 0;
  let film: Awaited<ReturnType<typeof send<'getDailyPick'>>>['data']['film'] | null = null;

  const setSaved = (saved: boolean): void => {
    save.setAttribute('aria-pressed', String(saved));
    render(save, html`${saved ? ICONS.bookmarkFilled : ICONS.bookmark}${saved ? 'Salvo' : 'Salvar'}`);
  };

  function clear(): void {
    generation++;
    loaded = false;
    film = null;
    hide(hero);
    hide(trailer);
    art.dataset.posterKey = '';
    art.replaceChildren();
    backdrop.classList.replace('opacity-90', 'opacity-0');
  }

  async function load(): Promise<void> {
    const expected = currentUsername();
    if (!expected) return clear();
    const requestId = ++generation;
    try {
      const [{ data }, saved] = await Promise.all([send('getDailyPick', { username: expected }), send('listSavedFilms')]);
      // The profile may have changed while the pick was being prepared.
      if (requestId !== generation || usernameKey(currentUsername()) !== usernameKey(expected)) return;
      film = data.film;
      title.textContent = film.title;
      const rating = film.imdbRating
        ? html`<span class="inline-flex items-center gap-1 font-semibold text-accent [&_svg]:size-3.5">${ICONS.star}${film.imdbRating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>`
        : '';
      render(
        meta,
        html`<span>${film.year}</span>${rating}${joinHtml([film.runtimeMinutes ? `${film.runtimeMinutes} min` : '', film.director].filter(Boolean).map((part) => html`<span>${part}</span>`))}`,
      );
      reason.textContent = data.curatorReason;
      hydratePoster(art, film, 'w342', (src) => {
        backdrop.src = src;
        backdrop.classList.replace('opacity-0', 'opacity-90');
      });
      link.href = letterboxdLink(film);
      trailer.href = trailerSearchUrl(film);
      trailer.setAttribute('aria-label', `Buscar trailer de ${film.title} no YouTube`);
      show(link);
      show(trailer);
      setSaved(savedMatcher(saved)(film));
      byId('dashDailyFeedback').replaceChildren(feedbackControls(film, expected));
      loaded = true;
      show(hero);
    } catch {
      if (requestId !== generation) return;
      // Without a strong enough match there is simply no daily pick.
      clear();
    }
  }

  save.addEventListener('click', async () => {
    if (!film) return;
    save.disabled = true;
    try {
      const { isSaved } = await send('toggleSavedFilm', film);
      setSaved(isSaved);
      save.querySelector('svg')?.classList.add('animate-pop', 'motion-reduce:animate-none');
      onSavedChange();
    } finally {
      save.disabled = false;
    }
  });

  return { load, clear, hasContent: () => loaded };
}
