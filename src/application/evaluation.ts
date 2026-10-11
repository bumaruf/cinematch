import type { AppContext } from './context.ts';
import { evaluationReport, validateAssessment, type FilmAssessment, type RecommendationEvaluation } from '../domain/recommend/evaluation.ts';
import { usernameKey } from '../domain/recommend/daily.ts';

export interface EvaluationInput { username: string; sessionId: string; assessment: FilmAssessment }

export async function recordRecommendationEvaluation(ctx: AppContext, input: EvaluationInput): Promise<void> {
  const username = usernameKey((await ctx.profiles.get())?.username);
  if (!input || username === 'convidado' || usernameKey(input.username) !== username) throw new Error('O perfil mudou. Gere indicações com seu perfil antes de avaliar.');
  validateAssessment(input.assessment);
  const session = (await ctx.history.list()).find(entry => entry.id === input.sessionId && entry.username === username);
  const movie = session?.movies.find(film => film.catalogSlug === input.assessment.catalogSlug);
  if (!session?.evaluationContext || !movie) throw new Error('Esta indicação não está mais disponível para avaliação. Gere uma nova lista.');
  if (usernameKey((await ctx.profiles.get())?.username) !== username) throw new Error('O perfil mudou durante a avaliação.');
  const row = { catalogSlug: movie.catalogSlug, basis: input.assessment.basis, fit: input.assessment.fit,
    interest: input.assessment.interest, issue: input.assessment.issue, comment: input.assessment.comment.trim(),
    title: movie.title, year: movie.year, rank: session.movies.indexOf(movie) + 1,
    ...(movie.themeFit ? { themeFit: movie.themeFit } : {}) };
  const now = ctx.clock.now().toISOString();
  await ctx.evaluations.update(entries => {
    const previous = entries.find(entry => entry.username === username && entry.sessionId === session.id);
    const entry: RecommendationEvaluation = { username, sessionId: session.id, context: session.evaluationContext!, assessedAt: now,
      shownCount: session.movies.length, rows: [...(previous?.rows ?? []).filter(value => value.catalogSlug !== row.catalogSlug), row].sort((a, b) => a.rank - b.rank) };
    return [entry, ...entries.filter(value => value !== previous)].slice(0, 200);
  });
}

export async function getRecommendationEvaluationReport(ctx: AppContext) {
  return evaluationReport(await ctx.evaluations.list(usernameKey((await ctx.profiles.get())?.username)));
}

export async function clearRecommendationEvaluations(ctx: AppContext): Promise<void> {
  const username = usernameKey((await ctx.profiles.get())?.username);
  await ctx.evaluations.update(entries => entries.filter(entry => entry.username !== username));
}
