import type { HistoryEntry } from '../../../application/ports.ts';
import { send } from '../../../messaging/client.ts';
import { byId, copyWithFeedback } from '../../shared/dom.ts';
import { recommendationsText } from '../../shared/export.ts';
import { filmCard } from '../../shared/film-card.ts';
import { html, joinHtml, render } from '../../shared/html.ts';
import type { Notifier } from './state.ts';

function sessionTitle(entry: HistoryEntry): string {
  const title = String(entry.theme || 'Recomendações').trim();
  const prompt = String(entry.customPrompt || '').trim();
  return prompt && !title.toLocaleLowerCase('pt-BR').includes(prompt.toLocaleLowerCase('pt-BR')) ? `${title} — "${prompt}"` : title;
}

function groupByDay(history: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    const label = entry.timestamp
      ? new Date(entry.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'Data desconhecida';
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return groups;
}

export async function renderHistory(): Promise<void> {
  const container = byId('dashHistoryContainer');
  const history = await send('listHistory');
  if (history.length === 0) {
    render(container, html`<p class="text-muted">Suas buscas aparecem aqui.</p>`);
    return;
  }
  container.replaceChildren(
    ...[...groupByDay(history)].map(([day, entries], index) => {
      const group = document.createElement('details');
      group.className = 'disclosure border-t border-line py-3';
      group.open = index === 0;
      const summary = document.createElement('summary');
      summary.textContent = `${day} · ${entries.length} ${entries.length === 1 ? 'sessão' : 'sessões'}`;
      const sessions = document.createElement('div');
      sessions.className = 'mt-3 flex flex-col gap-5';
      for (const entry of entries) {
        const card = document.createElement('article');
        card.className = 'flex flex-col gap-1';
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const movies = joinHtml((entry.movies ?? []).map((movie) => html`<span class="after:content-[',_'] last:after:content-none">${movie.title}${movie.year ? ` (${movie.year})` : ''}</span>`));
        render(
          card,
          html`
            <div class="flex items-baseline justify-between gap-4"><strong class="font-serif text-lg font-medium">${sessionTitle(entry)}</strong><span class="text-[13px] text-faint">${time}</span></div>
            <div class="text-[13px] leading-relaxed text-muted">${movies}</div>`,
        );
        sessions.append(card);
      }
      group.append(summary, sessions);
      return group;
    }),
  );
}

/** The "Salvos" tab. */
export function setupSaved({ notify, goToCurator }: { notify: Notifier; goToCurator: () => void }) {
  const container = byId('dashSavedContainer');
  const badge = byId('savedCountBadge');
  const exportButton = byId('btnExportSaved');

  const setCount = (count: number): void => {
    badge.textContent = count ? String(count) : '';
  };

  async function updateBadge(): Promise<void> {
    setCount((await send('listSavedFilms')).length);
  }

  async function renderSaved(): Promise<void> {
    const saved = await send('listSavedFilms');
    setCount(saved.length);
    exportButton.hidden = saved.length === 0;
    byId('savedCollectionCount').textContent = saved.length ? `${saved.length} ${saved.length === 1 ? 'filme' : 'filmes'}` : '';
    if (saved.length === 0) {
      render(
        container,
        html`
          <div class="col-span-full flex flex-col items-start gap-3 text-muted">
            <h2 class="font-serif text-2xl font-medium text-ink">Nada salvo ainda</h2>
            <p>Use “Salvar” nas sugestões para montar sua lista.</p>
            <button type="button" class="btn">Descobrir filmes</button>
          </div>`,
      );
      container.querySelector('button')?.addEventListener('click', goToCurator);
      return;
    }
    // Saved films use the same card as the results; unsaving removes it.
    container.replaceChildren(
      ...saved.map((movie, index) =>
        filmCard(movie, {
          variant: 'poster',
          saved: true,
          index,
          onToggleSave: async (film) => {
            try {
              const { isSaved } = await send('toggleSavedFilm', film);
              if (!isSaved) await renderSaved();
              return isSaved;
            } catch (error) {
              notify.error((error as Error).message);
              throw error;
            }
          },
        }),
      ),
    );
  }

  exportButton.addEventListener('click', async () => {
    const saved = await send('listSavedFilms');
    if (!saved.length) return notify.error('Nenhum filme salvo para exportar.');
    await copyWithFeedback(exportButton, recommendationsText('Filmes salvos — CineMatch', saved), 'Copiada');
  });

  return { renderSaved, updateBadge };
}
