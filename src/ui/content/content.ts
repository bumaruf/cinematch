import type { StoredDailyPick } from '../../application/ports.ts';
import { send, syncProfileFully } from '../../messaging/client.ts';
import { differentOriginalTitle, hydratePoster, trailerSearchUrl } from '../shared/film.ts';
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

  const modal = document.createElement('dialog');
  modal.id = 'lb-ai-daily-modal';
  modal.className = 'lb-ai-modal';
  render(
    modal,
    html`
      <div class="lb-ai-modal-card">
        <div class="lb-ai-modal-header">
          <div class="lb-ai-modal-brand">
            <span class="lb-ai-modal-tag">Filme do Dia · Fase ${phaseInfo.currentYear}</span>
          </div>
          <form method="dialog"><button class="lb-ai-modal-close" aria-label="Fechar recomendação">&times;</button></form>
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
          <a href="${safeUrl(trailerSearchUrl(film))}" target="_blank" rel="noreferrer" class="lb-ai-btn-secondary"><span>Trailer ↗</span></a>
          <button type="button" class="lb-ai-btn-secondary lb-ai-open-studio"><span>Abrir o Studio</span></button>
        </div>
      </div>`,
  );
  modal.addEventListener('close', () => modal.remove());
  modal.addEventListener('click', (event) => event.target === modal && modal.close());
  modal.querySelector('.lb-ai-open-studio')?.addEventListener('click', () => {
    void send('openDashboard', {});
    modal.remove();
  });
  document.body.append(modal);
  modal.showModal();
  hydratePoster(modal.querySelector<HTMLElement>('.lb-ai-poster'), film, 'w342');
}

function injectBadge(): void {
  if (document.getElementById('lb-ai-curator-badge')) return;
  const badge = document.createElement('button');
  badge.id = 'lb-ai-curator-badge';
  badge.className = 'lb-ai-curator-floating-btn';
  badge.type = 'button';
  badge.title = 'Filme do Dia · Baseado na sua fase no Letterboxd';
  render(
    badge,
    html`
      <span class="lb-ai-icon-wrap" aria-hidden="true">${ICON}</span>
      <span class="lb-ai-label">${BADGE_LABEL}</span>`,
  );
  const label = badge.querySelector('.lb-ai-label')!;
  let busy = false;

  badge.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    let completionLabel = BADGE_LABEL;
    badge.classList.add('syncing');
    label.textContent = 'Buscando sugestão…';
    const username = usernameFromLetterboxdUrl(location.href);
    try {
      if (username) {
        try {
          const active = await send('getActiveProfile');
          const isCurrentProfile = active?.profile.username.toLowerCase() === username.toLowerCase();
          if (!isCurrentProfile) {
            label.textContent = 'Atualizando histórico…';
            await syncProfileFully(username);
          }
        } catch (error) {
          completionLabel = (error as Error).message || 'Não foi possível sincronizar. Tente novamente.';
          return;
        }
      }
      try {
        showDailyModal((await send('getDailyPick', {})).data);
      } catch {
        completionLabel = 'Não foi possível gerar agora. Abrindo o Studio…';
        void send('openDashboard', {}).catch(() => {});
      }
    } finally {
      busy = false;
      badge.classList.remove('syncing');
      label.textContent = completionLabel;
    }
  });
  document.body.append(badge);
}

injectBadge();
