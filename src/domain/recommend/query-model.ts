import { COUNTRIES } from '../catalog/countries.ts';
import type { Filters } from '../film.ts';
import { fold, foldWords } from '../text.ts';
import { describeConstraints, fuzzyMatch, parseSearchQuery, type SearchQuery } from './query.ts';
export { MODEL_SESSION_OPTIONS } from './model-session.ts';
import { GENRE_LABELS, requirementLabel, type QueryClause } from './query-requirements.ts';

/**
 * Structured reading of a free-text request by an on-device language model.
 * The model only proposes criteria; everything here decides whether they are
 * safe to use. Any doubt rejects the whole answer and the rule-based parser
 * stays in charge.
 */

/** Canonical catalog genres, as the dataset spells them. */
export const MODEL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'Film-Noir', 'History', 'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi', 'Sport',
  'Thriller', 'War', 'Western',
] as const;

const MODEL_COUNTRIES = COUNTRIES.map(country => country.code);
const LIST_FIELDS = ['requiredGenres', 'anyOfGenres', 'excludedGenres', 'preferredGenres', 'countries', 'excludedCountries', 'keywords'] as const;
const NUMBER_FIELDS = ['minYear', 'maxYear', 'minRuntime', 'maxRuntime'] as const;
const MAX_ITEMS = 6;
const YEAR_RANGE = [1880, 2100] as const;
const RUNTIME_RANGE = [1, 600] as const;
const MAX_PROMPT_LENGTH = 300;

export interface ModelQuery {
  requiredGenres: string[];
  anyOfGenres: string[];
  excludedGenres: string[];
  preferredGenres: string[];
  countries: string[];
  excludedCountries: string[];
  keywords: string[];
  minYear?: number;
  maxYear?: number;
  minRuntime?: number;
  maxRuntime?: number;
}

const genreList = { type: 'array', maxItems: MAX_ITEMS, items: { type: 'string', enum: [...MODEL_GENRES] } };
const countryList = { type: 'array', maxItems: MAX_ITEMS, items: { type: 'string', enum: MODEL_COUNTRIES } };

/** JSON Schema passed to the model as a response constraint. */
export const MODEL_QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...LIST_FIELDS],
  properties: {
    requiredGenres: genreList,
    anyOfGenres: genreList,
    excludedGenres: genreList,
    preferredGenres: genreList,
    countries: countryList,
    excludedCountries: countryList,
    keywords: { type: 'array', maxItems: MAX_ITEMS, items: { type: 'string', maxLength: 40 } },
    minYear: { type: 'integer', minimum: YEAR_RANGE[0], maximum: YEAR_RANGE[1] },
    maxYear: { type: 'integer', minimum: YEAR_RANGE[0], maximum: YEAR_RANGE[1] },
    minRuntime: { type: 'integer', minimum: RUNTIME_RANGE[0], maximum: RUNTIME_RANGE[1] },
    maxRuntime: { type: 'integer', minimum: RUNTIME_RANGE[0], maximum: RUNTIME_RANGE[1] },
  },
} as const;

export const MODEL_QUERY_INSTRUCTIONS = [
  'You turn a film request written in Brazilian Portuguese into search criteria for a film catalog.',
  'Answer only with JSON that follows the given schema. Never recommend titles.',
  'requiredGenres: genres every film must have. anyOfGenres: the film needs at least one of them ("suspense ou drama").',
  'excludedGenres: genres the user rejects ("sem terror"). preferredGenres: genres that fit the mood without being demanded.',
  'countries: production countries, any of them is fine. excludedCountries: countries the user rejects.',
  'minYear/maxYear: release period. minRuntime/maxRuntime: minutes. Leave them out unless the request states them.',
  'keywords: at most a few subject words copied from the request (places, themes, people). Do not translate them and do not repeat genres or countries.',
  'Watching with family or children means preferredGenres Family and Animation and excludedGenres Horror.',
  `Countries use these codes: ${COUNTRIES.map(country => `${country.code} = ${country.label}`).join(', ')}.`,
].join('\n');

export type ModelQueryValidation =
  | { ok: true; query: SearchQuery }
  | { ok: false; reason: string };

/** Long prompts, empty prompts and quoted titles go straight to the rule-based parser. */
export function shouldInterpretWithModel(prompt: string): boolean {
  const text = prompt.trim();
  return text.length > 0 && text.length <= MAX_PROMPT_LENGTH && !/^["“](.+)["”]$/.test(text);
}

const reject = (reason: string): ModelQueryValidation => ({ ok: false, reason });

function readList(raw: Record<string, unknown>, field: typeof LIST_FIELDS[number]): string[] | string {
  const value = raw[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return `${field} não é uma lista de textos`;
  if (value.length > MAX_ITEMS) return `${field} tem itens demais`;
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

function readNumber(raw: Record<string, unknown>, field: typeof NUMBER_FIELDS[number]): number | undefined | string {
  const value = raw[field];
  if (value === undefined || value === null) return undefined;
  const [min, max] = field.endsWith('Year') ? YEAR_RANGE : RUNTIME_RANGE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return `${field} fora do intervalo aceito`;
  return value;
}

/** Shape and vocabulary only; meaning is checked by `validateModelQuery`. */
export function parseModelQuery(raw: unknown): ModelQuery | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'a resposta não é um objeto JSON';
  const record = raw as Record<string, unknown>;
  const lists: Partial<Record<typeof LIST_FIELDS[number], string[]>> = {};
  for (const field of LIST_FIELDS) {
    const list = readList(record, field);
    if (typeof list === 'string') return list;
    lists[field] = list;
  }
  const genres = new Map(MODEL_GENRES.map(genre => [fold(genre), fold(genre)]));
  const countries = new Map(MODEL_COUNTRIES.map(code => [fold(code), code]));
  const canonical = (values: string[], vocabulary: Map<string, string>, field: string): string[] | string => {
    const unknown = values.find(value => !vocabulary.has(fold(value)));
    return unknown ? `${field} contém um valor fora do catálogo: ${unknown}` : [...new Set(values.map(value => vocabulary.get(fold(value))!))];
  };
  const query: ModelQuery = { requiredGenres: [], anyOfGenres: [], excludedGenres: [], preferredGenres: [], countries: [], excludedCountries: [], keywords: lists.keywords! };
  for (const field of ['requiredGenres', 'anyOfGenres', 'excludedGenres', 'preferredGenres'] as const) {
    const values = canonical(lists[field]!, genres, field);
    if (typeof values === 'string') return values;
    query[field] = values;
  }
  for (const field of ['countries', 'excludedCountries'] as const) {
    const values = canonical(lists[field]!, countries, field);
    if (typeof values === 'string') return values;
    query[field] = values;
  }
  for (const field of NUMBER_FIELDS) {
    const value = readNumber(record, field);
    if (typeof value === 'string') return value;
    if (value !== undefined) query[field] = value;
  }
  return query;
}

/** The tighter of two sets of limits. */
function intersectConstraints(a: Filters, b: Filters): Filters {
  const result: Filters = {};
  const pick = (key: 'minYear' | 'maxYear' | 'minRuntime' | 'maxRuntime', choose: (x: number, y: number) => number): void => {
    const values = [a[key], b[key]].filter((value): value is number => value !== undefined);
    if (values.length) result[key] = values.reduce((x, y) => choose(x, y));
  };
  pick('minYear', Math.max); pick('maxYear', Math.min);
  pick('minRuntime', Math.max); pick('maxRuntime', Math.min);
  return result;
}

/**
 * Keywords must come from the request itself: a model that "helpfully" adds a
 * subject would otherwise become a hidden requirement. Genre and country words
 * are dropped as the rule-based parser drops them, and so is anything the
 * request rejects ("sem sustos" must never search for "sustos").
 */
function groundedKeywords(keywords: string[], prompt: string, negated: string[]): string[] {
  const promptWords = foldWords(prompt).split(/\s+/).filter(Boolean);
  const tokens = keywords.flatMap(keyword => parseSearchQuery(keyword).lexicalTokens);
  return [...new Set(tokens.filter(token => promptWords.some(word => fuzzyMatch(token, word))
    && !negated.some(word => fuzzyMatch(token, word))))].slice(0, MAX_ITEMS);
}

/**
 * Validates the model's answer for this prompt and turns it into the query the
 * engine already consumes. Explicit exclusions and limits the rule-based
 * parser recognizes are kept even when the model leaves them out.
 */
export function validateModelQuery(raw: unknown, prompt: string): ModelQueryValidation {
  if (!shouldInterpretWithModel(prompt)) return reject('o pedido não é interpretado pelo modelo');
  const parsed = parseModelQuery(raw);
  if (typeof parsed === 'string') return reject(parsed);
  const rules = parseSearchQuery(prompt);
  // The rules already explain a contradiction precisely. An exclusion they
  // cannot map ("sem sustos") is what the model is for, as long as it maps it.
  const uncheckedIssues = rules.uncheckedExclusions.length;
  if (rules.issues.length > uncheckedIssues) return reject('o parser por regras encontrou um problema no pedido');
  const excludedGenres = new Set([...parsed.excludedGenres, ...rules.excludedGenres]);
  const excludedCountries = new Set([...parsed.excludedCountries, ...rules.excludedCountries]);
  if (uncheckedIssues && excludedGenres.size + excludedCountries.size === rules.excludedGenres.size + rules.excludedCountries.size) {
    return reject('o modelo não traduziu a exclusão que as regras não reconhecem');
  }
  const required = parsed.requiredGenres;
  let anyOf = parsed.anyOfGenres.filter(genre => !required.includes(genre));
  if (anyOf.length === 1) { required.push(anyOf[0]); anyOf = []; }
  if (required.some(genre => excludedGenres.has(genre))) return reject('um gênero aparece como exigido e excluído');
  if (anyOf.length && anyOf.every(genre => excludedGenres.has(genre))) return reject('todas as alternativas de gênero estão excluídas');
  anyOf = anyOf.filter(genre => !excludedGenres.has(genre));
  if (parsed.countries.length && parsed.countries.every(country => excludedCountries.has(country))) return reject('todos os países pedidos estão excluídos');
  const countries = parsed.countries.filter(country => !excludedCountries.has(country));

  const constraints = intersectConstraints({
    ...(parsed.minYear !== undefined ? { minYear: parsed.minYear } : {}),
    ...(parsed.maxYear !== undefined ? { maxYear: parsed.maxYear } : {}),
    ...(parsed.minRuntime !== undefined ? { minRuntime: parsed.minRuntime } : {}),
    ...(parsed.maxRuntime !== undefined ? { maxRuntime: parsed.maxRuntime } : {}),
  }, rules.constraints);
  if ((constraints.minYear ?? -Infinity) > (constraints.maxYear ?? Infinity)) return reject('o período não tem interseção');
  if ((constraints.minRuntime ?? -Infinity) > (constraints.maxRuntime ?? Infinity)) return reject('a duração não tem interseção');

  const preferredGenres = new Set(parsed.preferredGenres.filter(genre => !excludedGenres.has(genre) && !required.includes(genre)));
  const lexicalTokens = groundedKeywords(parsed.keywords, prompt, rules.uncheckedExclusions.flatMap(phrase => phrase.split(' ')));
  const clauses: QueryClause[] = [
    ...required.map(genre => [[{ kind: 'genre' as const, values: [genre] }]]),
    ...(anyOf.length ? [anyOf.map(genre => [{ kind: 'genre' as const, values: [genre] }])] : []),
    ...(countries.length ? [countries.map(country => [{ kind: 'country' as const, values: [country] }])] : []),
  ];
  const hasCriteria = clauses.length || excludedGenres.size || excludedCountries.size || preferredGenres.size
    || lexicalTokens.length || Object.keys(constraints).length;
  if (!hasCriteria) return reject('o modelo não extraiu nenhum critério');

  const genreLabel = (genre: string): string => GENRE_LABELS[genre] ?? genre;
  const interpretation = [
    ...(preferredGenres.size ? [`Priorizar ${[...preferredGenres].map(genreLabel).join(' e ')}`] : []),
    ...clauses.map(alternatives => alternatives.map(branch => branch.map(requirementLabel).join(' e ')).join(' ou ')),
    ...[...excludedGenres].map(genre => `Sem ${genreLabel(genre)}`),
    ...[...excludedCountries].map(code => `Excluir produção: ${COUNTRIES.find(country => country.code === code)!.label}`),
    ...describeConstraints(constraints),
    ...(lexicalTokens.length ? [`Termos: ${lexicalTokens.join(', ')}`] : []),
  ];
  return {
    ok: true,
    query: {
      clean: fold(prompt.trim()),
      tokens: foldWords(prompt).split(/\s+/).filter(Boolean),
      lexicalTokens,
      genres: new Set(required),
      excludedGenres,
      countries: new Set(countries.length === 1 ? countries : []),
      excludedCountries,
      constraints,
      preferredGenres,
      themeHints: rules.themeHints.filter(group => !group.some(genre => excludedGenres.has(genre))),
      interpretation,
      franchiseAliases: rules.franchiseAliases,
      clauses,
      issues: [],
      uncheckedExclusions: [],
    },
  };
}
