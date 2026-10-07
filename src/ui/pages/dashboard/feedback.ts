import type { FeedbackKind } from '../../../domain/film.ts';
import { send } from '../../../messaging/client.ts';
import { byId } from '../../shared/dom.ts';
import { html, render } from '../../shared/html.ts';
import type { Notifier } from './state.ts';

export function setupFeedbackReview(currentUsername: () => string | null, notify: Notifier) {
  const disclosure = byId<HTMLDetailsElement>('dashFeedbackReview');
  const list = byId('dashFeedbackList');
  const labels: Record<FeedbackKind, string> = { later: 'Hoje não — até amanhã', 'not-for-me': 'Não combina comigo', watched: 'Já assisti — registro local' };
  let generation = 0;
  async function refresh(): Promise<void> {
    const requestId = ++generation;
    const username = currentUsername() ?? 'convidado';
    list.setAttribute('aria-busy', 'true');
    try {
      const entries = await send('listFilmFeedback');
      if (requestId !== generation || username !== (currentUsername() ?? 'convidado')) return;
      if (!entries.length) render(list, html`<li class="py-3 text-muted">Nenhum filme oculto por feedback neste perfil.</li>`);
      else list.replaceChildren(...entries.map((entry) => {
        const row = document.createElement('li');
        row.className = 'flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0';
        render(row, html`<div><p>${entry.film.title} ${entry.film.year || ''}</p><p class="text-[12px] text-muted">${labels[entry.kind]}</p></div><button type="button" class="btn btn-quiet">Desfazer</button>`);
        const undo = row.querySelector<HTMLButtonElement>('button')!;
        undo.setAttribute('aria-label', `Desfazer ${labels[entry.kind]} para ${entry.film.title}`);
        undo.addEventListener('click', async () => {
          undo.disabled = true;
          try {
            await send('recordFilmFeedback', { film: entry.film, kind: null, username });
            notify.toast('Feedback desfeito. O filme pode aparecer nas próximas sugestões.');
            await refresh();
          } catch (error) { notify.error((error as Error).message); }
          finally { undo.disabled = false; }
        });
        return row;
      }));
    } catch (error) { if (requestId === generation) notify.error((error as Error).message); }
    finally { if (requestId === generation) list.setAttribute('aria-busy', 'false'); }
  }
  disclosure.addEventListener('toggle', () => { if (disclosure.open) void refresh(); });
  byId('dashRefreshFeedback').addEventListener('click', () => void refresh());
  return { reset: () => { generation++; list.replaceChildren(); disclosure.open = false; } };
}
