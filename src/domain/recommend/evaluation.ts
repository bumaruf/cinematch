import type { Filters } from '../film.ts';

export const CURATION_VERSION = '2026-10-12.2';
export type EvaluationBasis = 'seen' | 'familiar' | 'synopsis';
export type EvaluationFit = 'yes' | 'partly' | 'no' | 'unknown';
export type EvaluationInterest = 'yes' | 'maybe' | 'no';
export type EvaluationIssue = '' | 'climate' | 'taste' | 'request' | 'metadata' | 'watched' | 'other';

export interface EvaluationContext {
  version: string;
  themeId: string | null;
  prompt: string;
  /** Historical evaluation context, recorded before discovery modes were removed. */
  mode?: 'familiar' | 'explore' | 'surprise';
  filters: Omit<Filters, 'excludeRecent'>;
  profileSize: number;
  ratedCount: number;
  catalogSize: number;
  interpretation: string[];
}

export interface FilmAssessment {
  catalogSlug: string;
  basis: EvaluationBasis;
  fit: EvaluationFit;
  interest: EvaluationInterest;
  issue: EvaluationIssue;
  comment: string;
}

export interface EvaluationRow extends FilmAssessment {
  title: string;
  year: number;
  rank: number;
  themeFit?: 'related';
}

export interface RecommendationEvaluation {
  username: string;
  sessionId: string;
  context: EvaluationContext;
  assessedAt: string;
  shownCount: number;
  rows: EvaluationRow[];
}

/** Unknown answers never become a failure, and synopsis expectations are separate. */
export function summarizeEvaluations(entries: readonly RecommendationEvaluation[]) {
  const rows = entries.flatMap(entry => entry.rows);
  const seen = rows.filter(row => row.basis === 'seen' && row.fit !== 'unknown');
  const expectations = rows.filter(row => row.basis !== 'seen' && row.fit !== 'unknown');
  const ratio = (values: readonly EvaluationRow[]) => ({ matched: values.filter(row => row.fit === 'yes').length, assessed: values.length });
  return { sessions: entries.length, films: rows.length, shown: entries.reduce((sum, entry) => sum + entry.shownCount, 0),
    seenFit: ratio(seen), expectedFit: ratio(expectations), interested: rows.filter(row => row.interest === 'yes').length,
    unknown: rows.filter(row => row.fit === 'unknown').length,
    issues: Object.fromEntries(['climate', 'taste', 'request', 'metadata', 'watched', 'other'].map(issue => [issue, rows.filter(row => row.issue === issue).length])) };
}

/** Explicit allowlist: export no username, imported history, favorites or ratings. */
export function evaluationReport(entries: readonly RecommendationEvaluation[]) {
  return { schemaVersion: 1, summary: summarizeEvaluations(entries), sessions: entries.map(entry => ({
    sessionId: entry.sessionId, context: entry.context, assessedAt: entry.assessedAt, shownCount: entry.shownCount,
    rows: entry.rows.map(row => ({ catalogSlug: row.catalogSlug, title: row.title, year: row.year, rank: row.rank,
      basis: row.basis, fit: row.fit, interest: row.interest, issue: row.issue, comment: row.comment,
      ...(row.themeFit ? { themeFit: row.themeFit } : {}) })),
  })) };
}

export function validateAssessment(value: FilmAssessment): void {
  if (!value || typeof value.catalogSlug !== 'string' || !['seen', 'familiar', 'synopsis'].includes(value.basis) ||
    !['yes', 'partly', 'no', 'unknown'].includes(value.fit) || !['yes', 'maybe', 'no'].includes(value.interest) ||
    !['', 'climate', 'taste', 'request', 'metadata', 'watched', 'other'].includes(value.issue) ||
    typeof value.comment !== 'string' || value.comment.length > 500) throw new Error('Avaliação inválida. Confira as respostas e o limite de 500 caracteres.');
}
