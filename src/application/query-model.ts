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

/** A slow device must not hold a search for long: the rules answer instantly. */
export const MODEL_TIMEOUT_MS = 10_000;

export interface SearchInterpretation {
  /** Set only when the model's answer passed validation. */
  searchQuery?: SearchQuery;
  interpretedBy?: InterpretedBy;
}

/**
 * Reads a free-text search with the on-device model when the user turned it
 * on. Any failure (no API, model not downloaded, timeout, invalid answer)
 * leaves the search to the rule-based parser.
 */
export async function interpretSearch(ctx: AppContext, prompt: string, enabled: boolean): Promise<SearchInterpretation> {
  if (!enabled || !shouldInterpretWithModel(prompt)) return {};
  const model = ctx.onDeviceModel;
  if (!model) return { interpretedBy: 'rules-fallback' };
  try {
    if (await model.status(MODEL_SESSION_OPTIONS) !== 'available') return { interpretedBy: 'rules-fallback' };
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
      return { interpretedBy: 'rules-fallback' };
    }
    return { searchQuery: validation.query, interpretedBy: 'model' };
  } catch (error) {
    console.info('[CineMatch] Modelo no dispositivo indisponível; usando as regras.', error);
    return { interpretedBy: 'rules-fallback' };
  }
}

export async function getOnDeviceModelStatus(ctx: AppContext): Promise<OnDeviceModelStatus> {
  if (!ctx.onDeviceModel) return 'unsupported';
  try {
    return await ctx.onDeviceModel.status(MODEL_SESSION_OPTIONS);
  } catch {
    return 'unavailable';
  }
}
