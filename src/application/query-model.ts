import type { InterpretedBy } from '../domain/film.ts';
import type { SearchQuery } from '../domain/recommend/query.ts';
import {
  MODEL_QUERY_INSTRUCTIONS,
  MODEL_QUERY_SCHEMA,
  MODEL_SESSION_OPTIONS,
  shouldInterpretWithModel,
  validateModelQuery,
} from '../domain/recommend/query-model.ts';
import type { AppContext } from './context.ts';
import type { OnDeviceModelStatus } from './ports.ts';
import { fold } from '../domain/text.ts';

/** How long a search waits for the model before answering with the rules. */
export const MODEL_BUDGET_MS = 2_500;
/** How long the model may keep working after that, so its answer serves the next identical search. */
export const MODEL_TIMEOUT_MS = 10_000;
/** Validated interpretations (or null for unusable answers) per model, oldest first. */
const answersByModel = new WeakMap<object, Map<string, SearchQuery | null>>();
const ANSWER_CACHE_SIZE = 50;

function answersOf(model: object): Map<string, SearchQuery | null> {
  let answers = answersByModel.get(model);
  if (!answers) {
    answers = new Map();
    answersByModel.set(model, answers);
  }
  return answers;
}

function remember(answers: Map<string, SearchQuery | null>, key: string, query: SearchQuery | null): void {
  answers.delete(key);
  answers.set(key, query);
  if (answers.size > ANSWER_CACHE_SIZE) answers.delete(answers.keys().next().value!);
}

/** The model's validated reading of a prompt, or null; never throws. */
async function askModel(model: NonNullable<AppContext['onDeviceModel']>, prompt: string): Promise<SearchQuery | null> {
  try {
    if (await model.status(MODEL_SESSION_OPTIONS) !== 'available') return null;
    const answer = await model.promptJson({
      instructions: MODEL_QUERY_INSTRUCTIONS,
      input: prompt.trim(),
      schema: MODEL_QUERY_SCHEMA,
      sessionOptions: MODEL_SESSION_OPTIONS,
      timeoutMs: MODEL_TIMEOUT_MS,
    });
    const validation = validateModelQuery(answer, prompt);
    if (!validation.ok) {
      console.info(`[CineMatch] Resposta do modelo descartada: ${validation.reason}.`);
      return null;
    }
    return validation.query;
  } catch (error) {
    console.info('[CineMatch] Modelo no dispositivo indisponível; usando as regras.', error);
    return null;
  }
}

/** Creates the model session while a page opens, when the user turned the model on. */
export async function prepareSearchModel(ctx: AppContext, enabled: boolean): Promise<void> {
  if (!enabled || !ctx.onDeviceModel?.prepare) return;
  await ctx.onDeviceModel.prepare({ instructions: MODEL_QUERY_INSTRUCTIONS, sessionOptions: MODEL_SESSION_OPTIONS }).catch(() => {});
}

export interface SearchInterpretation {
  /** Set only when the model's answer passed validation. */
  searchQuery?: SearchQuery;
  interpretedBy?: InterpretedBy;
}

/**
 * Reads a free-text search with the on-device model when the user turned it
 * on. Any failure (no API, model not downloaded, invalid answer) leaves the
 * search to the rule-based parser. A model slower than MODEL_BUDGET_MS does
 * not hold the search: the rules answer now, and the model's answer, when it
 * arrives, is kept for the next identical search.
 */
export async function interpretSearch(ctx: AppContext, prompt: string, enabled: boolean): Promise<SearchInterpretation> {
  if (!enabled || !shouldInterpretWithModel(prompt)) return {};
  const model = ctx.onDeviceModel;
  if (!model) return { interpretedBy: 'rules-fallback' };
  const key = fold(prompt.trim());
  const answers = answersOf(model);
  if (answers.has(key)) {
    const known = answers.get(key);
    return known ? { searchQuery: known, interpretedBy: 'model' } : { interpretedBy: 'rules-fallback' };
  }
  const answer = askModel(model, prompt).then((query) => {
    remember(answers, key, query);
    return query;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((resolve) => { timer = setTimeout(() => resolve('slow'), MODEL_BUDGET_MS); });
  const first = await Promise.race([answer, slow]);
  clearTimeout(timer);
  if (first === 'slow') return { interpretedBy: 'rules-slow-model' };
  return first ? { searchQuery: first, interpretedBy: 'model' } : { interpretedBy: 'rules-fallback' };
}

export async function getOnDeviceModelStatus(ctx: AppContext): Promise<OnDeviceModelStatus> {
  if (!ctx.onDeviceModel) return 'unsupported';
  try {
    return await ctx.onDeviceModel.status(MODEL_SESSION_OPTIONS);
  } catch {
    return 'unavailable';
  }
}
