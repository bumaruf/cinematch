import type { ActiveProfile } from '../../../application/profile.ts';
import { byId } from '../../shared/dom.ts';
import { html, render } from '../../shared/html.ts';

const oneDecimal = (value: number): string =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The "DNA" tab: rating statistics, histogram, favorites and top films. */
export function renderDna({ profile, analyzed, ratingHistogram }: ActiveProfile): void {
  byId('dnaTotalFilms').textContent = (analyzed.totalLoggedFilms || analyzed.totalAnalyzed || 0).toLocaleString('pt-BR');
  byId('dnaAvgRating').textContent = analyzed.stats.totalRated ? oneDecimal(analyzed.stats.avgRating) : '—';
  byId('dnaFiveStars').textContent = String(analyzed.stats.fiveStarCount);
  byId('dnaDislikesCount').textContent = String(analyzed.stats.dislikedCount);

  const histogram = byId('dnaRatingsHistogram');
  const highest = Math.max(1, ...ratingHistogram.map((bucket) => bucket.count));
  histogram.replaceChildren(
    ...ratingHistogram.map(({ rating, count }) => {
      const bar = document.createElement('div');
      bar.className = 'grid h-full grid-rows-[auto_1fr_auto] text-center';

      const label = `${oneDecimal(rating)} estrelas: ${count} filmes`;
      bar.setAttribute('aria-label', label);
      bar.title = label;
      render(
        bar,
        html`<span class="text-xs text-muted">${count || ''}</span><span class="rating-fill self-end rounded-t bg-accent"></span><span class="mt-1 text-xs text-muted">${oneDecimal(rating)}</span>`,
      );
      // Taller for more films, brighter for higher ratings.
      const fill = bar.querySelector<HTMLElement>('.rating-fill')!;
      fill.style.height = `${Math.max(2, Math.round((count / highest) * 100))}%`;
      fill.style.opacity = String(0.25 + (rating / 5) * 0.75);
      return bar;
    }),
  );

  const favoritesList = byId('dnaFavoritesList');
  const favorites = profile.favorites ?? [];
  if (favorites.length === 0) {
    render(favoritesList, html`<p class="text-muted">Nenhum favorito fixado no seu perfil do Letterboxd.</p>`);
  } else {
    favoritesList.replaceChildren(
      ...favorites.map((film) => {
        const card = document.createElement('div');
        card.className = 'rounded-full border border-line bg-surface px-3 py-1.5 text-[13px]';
        card.textContent = film.title;
        return card;
      }),
    );
  }

  const topList = byId('dnaTopFilmsList');
  if (analyzed.topFilms.length === 0) {
    render(topList, html`<p class="py-3 text-muted">Ainda não há filmes com nota 3,5 ou mais.</p>`);
  } else {
    topList.replaceChildren(
      ...analyzed.topFilms.map((film) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between gap-4 border-b border-line py-2.5';
        render(
          row,
          html`
            <span>${film.title} ${film.year ? html`<span class="text-faint">${film.year}</span>` : ''}</span>
            <span class="font-semibold whitespace-nowrap text-accent">${typeof film.rating === 'number' ? oneDecimal(film.rating) : 'Favorito'}</span>`,
        );
        return row;
      }),
    );
  }
}
