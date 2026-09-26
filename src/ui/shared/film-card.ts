import { differentOriginalTitle, hydratePoster, letterboxdLink, type FilmLike } from './film.ts';
import { html, joinHtml, render, type Markup } from './html.ts';
import { ICONS } from './icons.ts';

export type FilmCardVariant = 'list' | 'poster';

export interface FilmCardOptions {
  variant?: FilmCardVariant;
  /** Saves or unsaves the film; resolves to whether it is saved now. */
  onToggleSave?: (film: FilmLike) => Promise<boolean>;
  saved?: boolean;
  /** Position in the list, for the staggered entrance. */
  index?: number;
}

const decimal = (value: number): string => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function rating(film: FilmLike): Markup | '' {
  return film.imdbRating
    ? html`<span class="inline-flex items-center gap-1 font-semibold text-accent [&_svg]:size-3.5" title="Nota no IMDb">${ICONS.star}${decimal(film.imdbRating)}</span>`
    : '';
}

function meta(film: FilmLike): Markup {
  const original = differentOriginalTitle(film);
  const parts = [film.runtimeMinutes ? `${film.runtimeMinutes} min` : '', film.director ?? '', film.country ?? '', original ? `Título original: ${original}` : ''];
  return joinHtml(parts.filter(Boolean).map((part) => html`<span>${part}</span>`));
}

function saveButton(variant: FilmCardVariant): Markup {
  return variant === 'poster'
    ? html`<button type="button" class="film-save btn btn-icon absolute top-2 right-2 bg-bg/70 text-ink backdrop-blur-sm hover:bg-bg/90 pressed:text-accent"></button>`
    : html`<button type="button" class="film-save btn btn-quiet min-h-8 gap-1.5 px-2 text-[13px] pressed:text-accent [&_svg]:size-4"></button>`;
}

function setSaved(button: HTMLButtonElement, saved: boolean, variant: FilmCardVariant): void {
  button.setAttribute('aria-pressed', String(saved));
  const label = saved ? 'Salvo' : 'Salvar';
  button.setAttribute('aria-label', saved ? 'Remover dos salvos' : 'Salvar');
  button.title = button.getAttribute('aria-label')!;
  render(button, variant === 'poster' ? (saved ? ICONS.bookmarkFilled : ICONS.bookmark) : html`${saved ? ICONS.bookmarkFilled : ICONS.bookmark}${label}`);
}

const POSTER_CLASSES = 'film-poster grid aspect-[2/3] place-items-center overflow-hidden bg-raised text-faint';

/** The one film card used by every film list. */
export function filmCard(film: FilmLike, { variant = 'list', onToggleSave, saved = false, index = 0 }: FilmCardOptions = {}): HTMLElement {
  const card = document.createElement('article');
  card.style.animationDelay = `${Math.min(index, 8) * 60}ms`;
  const link = letterboxdLink(film);
  const fallback = html`<span class="font-serif text-base" aria-hidden="true">${film.year ?? ''}</span>`;

  if (variant === 'poster') {
    card.className = 'group flex animate-rise flex-col gap-3 motion-reduce:animate-none';
    render(
      card,
      html`
        <div class="relative">
          <a href="${link}" target="_blank" rel="noreferrer" class="${POSTER_CLASSES} rounded-card shadow-lg shadow-black/30 ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:ring-accent/40 motion-reduce:transition-none" aria-label="Abrir ${film.title} no Letterboxd">${fallback}</a>
          ${onToggleSave ? saveButton(variant) : ''}
        </div>
        <div class="flex flex-col gap-1">
          <h3 class="font-serif text-[19px] leading-tight font-medium text-balance">${film.title}</h3>
          <p class="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">${film.year ? html`<span>${film.year}</span>` : ''}${rating(film)}${meta(film)}</p>
          ${film.affinityReason ? html`<p class="mt-1 border-l-2 border-accent/60 pl-2.5 text-[13px] leading-snug">${film.affinityReason}</p>` : ''}
          ${film.pitch ? html`<p class="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted">${film.pitch}</p>` : ''}
        </div>`,
    );
  } else {
    card.className = 'grid animate-rise grid-cols-[76px_minmax(0,1fr)] gap-4 border-t border-line py-4 first:border-t-0 motion-reduce:animate-none';
    render(
      card,
      html`
        <a href="${link}" target="_blank" rel="noreferrer" class="${POSTER_CLASSES} self-start rounded-md shadow-md shadow-black/30 ring-1 ring-white/5" aria-label="Abrir ${film.title} no Letterboxd">${fallback}</a>
        <div class="flex min-w-0 flex-col gap-1">
          <h3 class="font-serif text-[19px] leading-tight font-medium text-balance">${film.title} ${film.year ? html`<span class="font-normal text-faint">${film.year}</span>` : ''}</h3>
          <p class="flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">${rating(film)}${meta(film)}</p>
          ${film.affinityReason ? html`<p class="mt-1 border-l-2 border-accent/60 pl-2.5 text-[13px] leading-snug">${film.affinityReason}</p>` : ''}
          ${film.pitch ? html`<p class="mt-0.5 line-clamp-3 text-[13px] leading-relaxed text-muted">${film.pitch}</p>` : ''}
          <div class="mt-1 -ml-2 flex flex-wrap gap-1">
            <a class="btn btn-quiet min-h-8 gap-1.5 px-2 text-[13px] [&_svg]:size-4" href="${link}" target="_blank" rel="noreferrer">${ICONS.external}Letterboxd</a>
            ${onToggleSave ? saveButton(variant) : ''}
          </div>
        </div>`,
    );
  }

  const save = card.querySelector<HTMLButtonElement>('.film-save');
  if (save && onToggleSave) {
    setSaved(save, saved, variant);
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const now = await onToggleSave(film);
        setSaved(save, now, variant);
        // A short pop confirms the change without moving anything else.
        save.querySelector('svg')?.classList.add('animate-pop', 'motion-reduce:animate-none');
      } finally {
        save.disabled = false;
      }
    });
  }
  hydratePoster(card.querySelector('.film-poster'), film, variant === 'poster' ? 'w342' : 'w185');
  return card;
}

/** Placeholders in the shape of the cards that are about to arrive. */
export function filmSkeletons(count: number, variant: FilmCardVariant = 'list'): HTMLElement[] {
  return Array.from({ length: count }, () => {
    const item = document.createElement('div');
    item.setAttribute('aria-hidden', 'true');
    if (variant === 'poster') {
      item.className = 'flex flex-col gap-3';
      render(item, html`<div class="skeleton aspect-[2/3] rounded-card"></div><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-3.5 w-1/2"></div>`);
    } else {
      item.className = 'grid grid-cols-[76px_minmax(0,1fr)] gap-4 border-t border-line py-4 first:border-t-0';
      render(
        item,
        html`<div class="skeleton aspect-[2/3]"></div><div class="flex flex-col gap-2 pt-1"><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-3.5 w-1/2"></div><div class="skeleton h-3.5 w-full"></div><div class="skeleton h-3.5 w-5/6"></div></div>`,
      );
    }
    return item;
  });
}
