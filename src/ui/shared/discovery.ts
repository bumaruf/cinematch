import type { DiscoveryMode } from '../../domain/film.ts';
import { html, render } from './html.ts';

export function setupDiscoveryControls(host: HTMLElement) {
  const name = `${host.id}-mode`;
  render(host, html`
    <fieldset class="flex flex-wrap gap-x-4 gap-y-2">
      <legend class="mb-2 text-[13px] text-muted">Como quer descobrir?</legend>
      <label class="flex cursor-pointer items-center gap-1.5 text-[13px]" title="Priorizar filmes com afinidade forte"><input type="radio" name="${name}" value="familiar" class="accent-accent" checked>Familiar</label>
      <label class="flex cursor-pointer items-center gap-1.5 text-[13px]" title="Manter seu gosto como referência e abrir espaço a outros diretores"><input type="radio" name="${name}" value="explore" class="accent-accent">Explorar</label>
      <label class="flex cursor-pointer items-center gap-1.5 text-[13px]" title="Dar menos peso aos diretores conhecidos, respeitando o pedido"><input type="radio" name="${name}" value="surprise" class="accent-accent">Surpreender</label>
    </fieldset>`);
  return {
    mode: (): DiscoveryMode => host.querySelector<HTMLInputElement>('input[type="radio"]:checked')!.value as DiscoveryMode,
  };
}
