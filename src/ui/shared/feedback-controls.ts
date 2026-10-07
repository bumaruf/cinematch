import type { FeedbackKind } from '../../domain/film.ts';
import { send } from '../../messaging/client.ts';
import type { FilmLike } from './film.ts';
import { html, render } from './html.ts';

/** Feedback is local to the active profile and can be undone on the same card. */
export function feedbackControls(film: FilmLike, username?: string): HTMLElement {
  const host = document.createElement('details');
  host.className = 'mt-2 text-[12px] text-muted';
  render(host, html`
    <summary class="cursor-pointer py-1 hover:text-ink">Ajustar indicação</summary>
    <div class="mt-1 flex flex-wrap gap-1">
      <button type="button" class="btn btn-quiet min-h-8 px-2 text-[12px]" data-feedback="later">Hoje não</button>
      <button type="button" class="btn btn-quiet min-h-8 px-2 text-[12px]" data-feedback="not-for-me">Não combina comigo</button>
      <button type="button" class="btn btn-quiet min-h-8 px-2 text-[12px]" data-feedback="watched">Já assisti</button>
      <button type="button" class="btn btn-quiet min-h-8 px-2 text-[12px] hidden" data-undo>Desfazer</button>
    </div>
    <p class="mt-1 leading-snug" role="status" aria-live="polite"></p>`);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  const status = host.querySelector('p')!;
  const undo = host.querySelector<HTMLButtonElement>('[data-undo]')!;
  const messages: Record<FeedbackKind, string> = {
    later: 'Este filme fica fora das sugestões até amanhã.',
    'not-for-me': 'Este filme fica fora das próximas sugestões deste perfil.',
    watched: 'Marcado como assistido no CineMatch. Este filme fica fora das próximas sugestões.',
  };
  for (const button of buttons) button.addEventListener('click', async () => {
    const kind = button.dataset.feedback as FeedbackKind | undefined;
    for (const item of buttons) item.disabled = true;
    try {
      await send('recordFilmFeedback', { film, kind: kind ?? null, username });
      status.textContent = kind ? messages[kind] : 'Feedback desfeito.';
      undo.classList.toggle('hidden', !kind);
    } catch (error) { status.textContent = (error as Error).message; }
    finally { for (const item of buttons) item.disabled = false; }
  });
  return host;
}
