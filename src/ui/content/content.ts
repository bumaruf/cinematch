import type { StoredDailyPick } from '../../application/ports.ts';
import { send, syncProfileFully } from '../../messaging/client.ts';
import { differentOriginalTitle } from '../shared/film.ts';
import { html, joinHtml, render, safeUrl } from '../shared/html.ts';
import { usernameFromLetterboxdUrl } from '../shared/letterboxd.ts';

// Adds a "Filme do Dia" button to Letterboxd pages. On a member's page it
// syncs that member first, so the pick reflects the history being viewed.

const BADGE_LABEL = '✨ Filme do Dia';

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
      <div class="lb-ai-modal-card">
        <div class="lb-ai-modal-header">
          <div class="lb-ai-modal-brand">
            <div class="lb-ai-dots"><span class="lb-ai-dot green"></span><span class="lb-ai-dot orange"></span><span class="lb-ai-dot blue"></span></div>
            <span class="lb-ai-modal-tag">✨ Filme do Dia · Fase ${phaseInfo.currentYear}</span>
          </div>
          <button class="lb-ai-modal-close" title="Fechar">&times;</button>
        </div>
        <div class="lb-ai-modal-body">
          <div class="lb-ai-film-headline">
            <h2 class="lb-ai-film-title">${film.title}${original ? ` (${original})` : ''}</h2>
            ${Number.isFinite(film.imdbRating) ? html`<div class="lb-ai-film-rating">★ ${film.imdbRating.toFixed(1)}</div>` : ''}
          </div>
          <div class="lb-ai-film-meta">${meta}</div>
          <div class="lb-ai-curator-box">
            <div class="lb-ai-curator-label">Recomendação personalizada</div>
            <p class="lb-ai-curator-text">"${curatorReason || 'Filme escolhido a dedo para a sua sessão de hoje.'}"</p>
          </div>
          <div class="lb-ai-film-pitch">${film.pitch || 'Uma joia cinematográfica para o seu dia.'}</div>
          ${film.genres.length ? html`<div class="lb-ai-genre-pills">${genres}</div>` : ''}
        </div>
        <div class="lb-ai-modal-footer">
          <a href="${safeUrl(film.letterboxdUrl)}" target="_blank" rel="noreferrer" class="lb-ai-btn-primary"><span>🎬 Ver no Letterboxd ↗</span></a>
          <button class="lb-ai-btn-secondary lb-ai-open-studio"><span>Studio Completo</span></button>
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
      <div class="lb-ai-icon-wrap">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      </div>
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
