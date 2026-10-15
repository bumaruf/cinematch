import type { RecommendationResult } from '../../../domain/film.ts';
import { dateKey } from '../../../domain/recommend/daily.ts';
import type { EvaluationBasis, EvaluationFit, EvaluationInterest, EvaluationIssue } from '../../../domain/recommend/evaluation.ts';
import { send } from '../../../messaging/client.ts';
import { byId } from '../../shared/dom.ts';
import { html, joinHtml, render } from '../../shared/html.ts';
import type { Notifier } from './state.ts';

const choices = (name: string, options: readonly [string, string][]) => joinHtml(options.map(([value, label]) =>
  html`<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-chip border border-line px-3 py-2 text-[13px] has-checked:border-brand has-checked:text-brand"><input class="accent-brand" type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`));

/** An optional pilot, using real suggestions and the active profile. */
export function setupRecommendationEvaluation(notify: Notifier, currentUsername: () => string | null) {
  const panel = byId('dashEvaluation');
  const summary = byId('dashEvaluationSummary');
  const exportButton = byId<HTMLButtonElement>('dashExportEvaluations');
  const clearButton = byId<HTMLButtonElement>('dashClearEvaluations');
  let generation = 0;
  let result: RecommendationResult | null = null;
  let report: Awaited<ReturnType<typeof send<'getRecommendationEvaluationReport'>>> | null = null;

  async function refresh(): Promise<boolean> {
    const username = currentUsername();
    if (!username) { report = null; summary.textContent = 'Sincronize seu perfil para iniciar a avaliação.'; exportButton.disabled = true; clearButton.disabled = true; return false; }
    const request = generation;
    try {
      const loaded = await send('getRecommendationEvaluationReport');
      if (request !== generation || username !== currentUsername()) return false;
      report = loaded;
      const { films, sessions, seenFit, expectedFit, interested, unknown } = loaded.summary;
      summary.textContent = films ? `${films} ${films === 1 ? 'avaliação' : 'avaliações'} em ${sessions} ${sessions === 1 ? 'lista' : 'listas'}. Filmes vistos que combinaram: ${seenFit.matched} de ${seenFit.assessed}. Expectativas que combinaram: ${expectedFit.matched} de ${expectedFit.assessed}. Vontade de assistir: ${interested} de ${films}. Não sei avaliar: ${unknown}.` : 'Ainda não há avaliações. Gere uma lista e abra “Avaliar estas indicações” abaixo dos filmes.';
      exportButton.disabled = films === 0;
      clearButton.disabled = films === 0;
      return true;
    } catch (error) {
      if (request === generation) { report = null; exportButton.disabled = true; clearButton.disabled = true; notify.error((error as Error).message); }
      return false;
    }
  }

  function show(next: RecommendationResult): void {
    generation++;
    result = next;
    if (!currentUsername() || !next.evaluationSessionId || !next.recommendations.length) { panel.replaceChildren(); return; }
    render(panel, html`<details class="disclosure mt-8"><summary>Avaliar estas indicações</summary>
      <p class="mt-3 max-w-prose text-[13px] leading-relaxed text-muted">Avalie um filme por vez. Suas respostas ficam neste navegador e ajudam a conferir a curadoria. Pelo que você conhece, ele combina com o pedido? Filmes vistos e expectativas pela sinopse são analisados separadamente.</p>
      <form id="dashEvaluationForm" class="mt-5 space-y-5">
        <div><label for="evaluationFilm" class="mb-2 block text-[13px] font-semibold">Filme</label><select id="evaluationFilm" name="catalogSlug" class="field w-full" required>${joinHtml(next.recommendations.map(film => html`<option value="${film.catalogSlug}">${film.title} (${film.year})</option>`))}</select></div>
        <fieldset><legend class="mb-2 text-[13px] font-semibold">Em que você está baseando a resposta?</legend><div class="flex flex-wrap gap-2">${choices('basis', [['seen', 'Já vi o filme'], ['familiar', 'Conheço o filme'], ['synopsis', 'Só na sinopse']])}</div></fieldset>
        <fieldset><legend class="mb-2 text-[13px] font-semibold">Combina com o clima ou pedido?</legend><div class="flex flex-wrap gap-2">${choices('fit', [['yes', 'Sim'], ['partly', 'Em parte'], ['no', 'Não'], ['unknown', 'Não sei avaliar']])}</div></fieldset>
        <fieldset><legend class="mb-2 text-[13px] font-semibold">Você teria vontade de assistir?</legend><div class="flex flex-wrap gap-2">${choices('interest', [['yes', 'Sim'], ['maybe', 'Talvez'], ['no', 'Não']])}</div></fieldset>
        <div><label for="evaluationIssue" class="mb-2 block text-[13px] font-semibold">Principal problema, se houver</label><select id="evaluationIssue" name="issue" class="field w-full"><option value="">Nenhum problema identificado</option><option value="climate">Clima diferente do prometido</option><option value="taste">Não combina com meu gosto</option><option value="request">Pedido interpretado errado</option><option value="metadata">Dados do filme incorretos</option><option value="watched">Eu já tinha assistido</option><option value="other">Outro</option></select></div>
        <div><label for="evaluationComment" class="mb-2 block text-[13px] font-semibold">O que fez você pensar isso? (opcional)</label><textarea id="evaluationComment" name="comment" class="field min-h-24 w-full" maxlength="500" rows="3" aria-describedby="evaluationPrivacy"></textarea><p id="evaluationPrivacy" class="mt-2 text-[12px] text-muted">Até 500 caracteres. A exportação inclui o pedido, os filmes e estas respostas; evite informações pessoais no comentário.</p></div>
        <button class="btn btn-primary" type="submit">Salvar avaliação</button><p id="evaluationStatus" class="text-[13px] text-brand" role="status"></p>
      </form></details>`);
    const form = panel.querySelector<HTMLFormElement>('#dashEvaluationForm')!;
    const status = form.querySelector<HTMLElement>('#evaluationStatus')!;
    const request = generation;
    const username = currentUsername()!;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity() || request !== generation) return;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const data = new FormData(form);
      button.disabled = true;
      try {
        await send('recordRecommendationEvaluation', { username, sessionId: next.evaluationSessionId!, assessment: {
          catalogSlug: String(data.get('catalogSlug')), basis: data.get('basis') as EvaluationBasis,
          fit: data.get('fit') as EvaluationFit, interest: data.get('interest') as EvaluationInterest,
          issue: data.get('issue') as EvaluationIssue, comment: String(data.get('comment') ?? ''),
        } });
        if (request !== generation || username !== currentUsername()) return;
        status.textContent = 'Avaliação salva. Você pode avaliar outro filme ou revisar esta resposta.';
        await refresh();
      } catch (error) { if (request === generation) notify.error((error as Error).message); }
      finally { button.disabled = false; }
    });
    const select = form.querySelector<HTMLSelectElement>('#evaluationFilm')!;
    function restore(): void {
      const row = report?.sessions.find(session => session.sessionId === result?.evaluationSessionId)?.rows.find(value => value.catalogSlug === select.value);
      for (const radio of form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) radio.checked = Boolean(row && row[radio.name as 'basis' | 'fit' | 'interest'] === radio.value);
      form.querySelector<HTMLSelectElement>('#evaluationIssue')!.value = row?.issue ?? '';
      form.querySelector<HTMLTextAreaElement>('#evaluationComment')!.value = row?.comment ?? '';
      status.textContent = row ? 'Este filme já foi avaliado. Salvar novamente atualiza sua resposta.' : '';
    }
    select.addEventListener('change', restore);
    void (async () => { await refresh(); if (request === generation) restore(); })();
  }

  exportButton.addEventListener('click', async () => {
    if (!await refresh()) return;
    if (!report?.summary.films) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `cinematch-avaliacoes-${dateKey(new Date())}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  clearButton.addEventListener('click', async () => {
    clearButton.disabled = true;
    try { await send('clearRecommendationEvaluations'); await refresh(); if (result) show(result); notify.toast('Avaliações deste perfil apagadas.'); }
    catch (error) { clearButton.disabled = !report?.summary.films; notify.error((error as Error).message); }
  });
  return { show, refresh, reset(): void { generation++; result = null; report = null; panel.replaceChildren(); summary.textContent = ''; exportButton.disabled = true; clearButton.disabled = true; } };
}
