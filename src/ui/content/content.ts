import type { StoredDailyPick } from '../../application/ports.ts';
import { send, syncProfileFully } from '../../messaging/client.ts';
import { differentOriginalTitle, hydratePoster } from '../shared/film.ts';
import iconSvg from '../assets/cinematch-icon.svg?raw';
import { html, joinHtml, Markup, render, safeUrl } from '../shared/html.ts';
import { usernameFromLetterboxdUrl } from '../shared/letterboxd.ts';

// Adds a "Filme do Dia" button to Letterboxd pages. On a member's page it
// syncs that member first, so the pick reflects the history being viewed.

const BADGE_LABEL = 'Filme do Dia';
// Inlined, so Letterboxd pages need no access to the extension's files.
const ICON = new Markup(iconSvg);

function showDailyModal({ film, curatorReason, phaseInfo }: StoredDailyPick): void {
  document.getElementById('lb-ai-daily-modal')?.remove();
  const original = differentOriginalTitle(film);
  const meta = [film.year, film.director ? `Dir. ${film.director}` : '', film.runtimeMinutes ? `${film.runtimeMinutes} min` : '', film.country]
    .filter(Boolean)
    .join(' • ');
  const genres = joinHtml(film.genres.map((genre) => html`<span class="lb-ai-genre-pill">${genre}</span>`));

  const modal = document.createElement('div');
  modal.id = 'lb-ai-daily-modal';
  modal.className = 'lb-ai-modal-backdrop';
  render(
    modal,
    html`
      <div class="lb-ai-modal-card" role="dialog" aria-modal="true" aria-labelledby="lb-ai-daily-title">
        <div class="lb-ai-modal-header">
          <div class="lb-ai-modal-brand">
            <span class="lb-ai-modal-tag">✨ Filme do Dia · Fase ${phaseInfo.currentYear}</span>
          </div>
          <button type="button" class="lb-ai-modal-close" title="Fechar" aria-label="Fechar recomendação">&times;</button>
        </div>
        <div class="lb-ai-modal-body">
          <div class="lb-ai-poster" aria-label="Pôster de ${film.title}">
            <div class="lb-ai-poster-fallback" aria-hidden="true">${ICON}</div>
          </div>
          <div class="lb-ai-film-content">
            <div class="lb-ai-film-headline">
              <h2 id="lb-ai-daily-title" class="lb-ai-film-title">${film.title}${original ? html`<span class="lb-ai-original-title">${original}</span>` : ''}</h2>
              ${Number.isFinite(film.imdbRating) ? html`<div class="lb-ai-film-rating">★ ${film.imdbRating.toFixed(1)}</div>` : ''}
            </div>
            <div class="lb-ai-film-meta">${meta}</div>
            <div class="lb-ai-curator-box">
              <div class="lb-ai-curator-label">Por que combina com você</div>
              <p class="lb-ai-curator-text">${curatorReason || 'Filme escolhido a dedo para a sua sessão de hoje.'}</p>
            </div>
            <div class="lb-ai-film-pitch">${film.pitch || 'Uma joia cinematográfica para o seu dia.'}</div>
            ${film.genres.length ? html`<div class="lb-ai-genre-pills">${genres}</div>` : ''}
          </div>
        </div>
        <div class="lb-ai-modal-footer">
          <a href="${safeUrl(film.letterboxdUrl)}" target="_blank" rel="noreferrer" class="lb-ai-btn-primary"><span>Ver no Letterboxd ↗</span></a>
          <button type="button" class="lb-ai-btn-secondary lb-ai-open-studio"><span>Abrir o Studio</span></button>
        </div>
      </div>`,
  );
  modal.querySelector('.lb-ai-modal-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => event.target === modal && modal.remove());
  modal.querySelector('.lb-ai-open-studio')?.addEventListener('click', () => {
    void send('openDashboard', {});
    modal.remove();
  });
  document.body.append(modal);
  hydratePoster(modal.querySelector<HTMLElement>('.lb-ai-poster'), film, 'w342');
  modal.querySelector<HTMLElement>('.lb-ai-modal-close')?.focus();
}

function injectBadge(): void {
  if (document.getElementById('lb-ai-curator-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'lb-ai-curator-badge';
  badge.className = 'lb-ai-curator-floating-btn';
  badge.title = 'Filme do Dia · Baseado na sua fase no Letterboxd';
  render(
    badge,
    html`
      <div class="lb-ai-icon-wrap" aria-hidden="true">${ICON}</div>
      <span class="lb-ai-label">${BADGE_LABEL}</span>`,
  );
  const label = badge.querySelector('.lb-ai-label')!;
  let busy = false;

  badge.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    badge.classList.add('syncing');
    label.textContent = 'Curando...';
    const username = usernameFromLetterboxdUrl(location.href);
    try {
      if (username) {
        try {
          await syncProfileFully(username, { onProgress: (message) => (label.textContent = message) });
        } catch (error) {
          alert((error as Error).message || 'Não foi possível sincronizar este perfil.');
          return;
        }
      }
      try {
        showDailyModal((await send('getDailyPick', {})).data);
      } catch {
        alert('Não foi possível gerar a recomendação do dia no momento. Tente abrir o Studio.');
        void send('openDashboard', {}).catch(() => {});
      }
    } finally {
      busy = false;
      badge.classList.remove('syncing');
      label.textContent = BADGE_LABEL;
    }
  });
  document.body.append(badge);
}

injectBadge();
