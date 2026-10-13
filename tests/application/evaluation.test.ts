import { expect, test } from 'vitest';
import { recordRecommendationEvaluation, getRecommendationEvaluationReport, clearRecommendationEvaluations } from '../../src/application/evaluation.ts';
import { generateRecommendations } from '../../src/application/recommendations.ts';
import { createTestContext } from '../helpers.ts';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { film } from '../fixtures/catalog.ts';
import type { FilmAssessment } from '../../src/domain/recommend/evaluation.ts';

async function setup() {
  const { ctx } = await createTestContext({ profile: { username: 'real-person', films: [], filmCountKnown: true } });
  ctx.catalog = async () => createCatalog([film('one'), film('two')]);
  const result = await generateRecommendations(ctx, {});
  const input = { username: 'real-person', sessionId: result.evaluationSessionId!, assessment: {
    catalogSlug: 'one', basis: 'seen', fit: 'yes', interest: 'no', issue: '', comment: 'Combina, mas não quero rever.',
  } as FilmAssessment };
  return { ctx, input };
}

test('same-time batches have distinct identities, and concurrent assessments preserve both films', async () => {
  const { ctx, input } = await setup();
  const next = await generateRecommendations(ctx, {});
  expect(next.evaluationSessionId).not.toBe(input.sessionId);
  await Promise.all([recordRecommendationEvaluation(ctx, input), recordRecommendationEvaluation(ctx, { ...input, assessment: { ...input.assessment, catalogSlug: 'two', basis: 'synopsis', fit: 'unknown', interest: 'yes' } })]);
  const report = await getRecommendationEvaluationReport(ctx);
  expect(report.summary).toMatchObject({ sessions: 1, films: 2, seenFit: { matched: 1, assessed: 1 }, expectedFit: { matched: 0, assessed: 0 }, interested: 1, unknown: 1 });
  expect(report.sessions[0].context).toMatchObject({ profileSize: 0, catalogSize: 2 });
});

test('answers update without duplicate counts and cannot forge a film, owner or extra exported fields', async () => {
  const { ctx, input } = await setup();
  await recordRecommendationEvaluation(ctx, input);
  await recordRecommendationEvaluation(ctx, { ...input, assessment: { ...input.assessment, fit: 'no', privateHistory: 'secret' } as FilmAssessment });
  const report = await getRecommendationEvaluationReport(ctx);
  expect(report.summary.films).toBe(1);
  expect(report.summary.seenFit).toEqual({ matched: 0, assessed: 1 });
  expect(JSON.stringify(report)).not.toContain('real-person');
  expect(JSON.stringify(report)).not.toContain('privateHistory');
  await expect(recordRecommendationEvaluation(ctx, { ...input, assessment: { ...input.assessment, catalogSlug: 'forged' } })).rejects.toThrow(/não está mais disponível/);
  await ctx.profiles.save({ username: 'someone-else', films: [] });
  await expect(recordRecommendationEvaluation(ctx, input)).rejects.toThrow(/perfil mudou/);
  expect((await getRecommendationEvaluationReport(ctx)).summary.films).toBe(0);
});

test('invalid answers do not persist, and clearing affects only the active profile', async () => {
  const { ctx, input } = await setup();
  await expect(recordRecommendationEvaluation(ctx, { ...input, assessment: { ...input.assessment, comment: 'x'.repeat(501) } })).rejects.toThrow(/500/);
  await recordRecommendationEvaluation(ctx, input);
  await ctx.profiles.save({ username: 'someone-else', films: [] });
  await clearRecommendationEvaluations(ctx);
  await ctx.profiles.save({ username: 'real-person', films: [] });
  expect((await getRecommendationEvaluationReport(ctx)).summary.films).toBe(1);
  await clearRecommendationEvaluations(ctx);
  expect((await getRecommendationEvaluationReport(ctx)).summary.films).toBe(0);
});
