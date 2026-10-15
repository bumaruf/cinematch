import { expect, test } from 'vitest';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import {
  MODEL_GENRES,
  MODEL_QUERY_SCHEMA,
  shouldInterpretWithModel,
  validateModelQuery,
  type ModelQueryValidation,
} from '../../src/domain/recommend/query-model.ts';
import { parseSearchQuery } from '../../src/domain/recommend/query.ts';
import { film } from '../fixtures/catalog.ts';
import { FIXED_NOW } from '../helpers.ts';

const answer = (values: Record<string, unknown> = {}) => ({
  requiredGenres: [], anyOfGenres: [], excludedGenres: [], preferredGenres: [], countries: [], excludedCountries: [], keywords: [], ...values,
});
const accepted = (validation: ModelQueryValidation) => {
  if (!validation.ok) throw new Error(`rejeitada: ${validation.reason}`);
  return validation.query;
};
const rejected = (validation: ModelQueryValidation) => {
  if (validation.ok) throw new Error('aceita');
  return validation.reason;
};

test('a family request becomes preferences and an exclusion the rules could not read', () => {
  const prompt = 'filme para ver com a família';
  expect(parseSearchQuery(prompt).interpretation).toEqual([]);
  const query = accepted(validateModelQuery(answer({ preferredGenres: ['Family', 'Animation'], excludedGenres: ['Horror'] }), prompt));
  expect([...query.preferredGenres]).toEqual(['family', 'animation']);
  expect([...query.excludedGenres]).toEqual(['horror']);
  expect(query.clauses).toEqual([]);
  expect(query.lexicalTokens).toEqual([]);
  expect(query.interpretation).toEqual(['Priorizar família e animação', 'Sem terror']);

  const result = recommend({ profile: null, customPrompt: prompt, searchQuery: query }, createCatalog([
    film('family', { genres: ['Family', 'Animation'] }),
    film('drama', { genres: ['Drama'] }),
    film('horror', { genres: ['Horror', 'Family'] }),
  ]), FIXED_NOW);
  const slugs = result.recommendations.map(item => item.catalogSlug);
  expect(slugs[0]).toBe('family');
  expect(slugs).not.toContain('horror');
  expect(result.interpretation).toEqual(query.interpretation);
});

test('genres, countries, period and runtime map to the clauses the engine consumes', () => {
  const query = accepted(validateModelQuery(answer({
    anyOfGenres: ['Thriller', 'Sci-Fi'], excludedGenres: ['Horror'], countries: ['JP'],
    minYear: 1990, maxYear: 1999, maxRuntime: 110,
  }), 'algo tenso ou futurista do japão nos anos noventa, curtinho e sem sustos'));
  expect(query.clauses).toEqual([
    [[{ kind: 'genre', values: ['thriller'] }], [{ kind: 'genre', values: ['sci-fi'] }]],
    [[{ kind: 'country', values: ['JP'] }]],
  ]);
  expect([...query.genres]).toEqual([]);
  expect([...query.countries]).toEqual(['JP']);
  expect(query.constraints).toEqual({ minYear: 1990, maxYear: 1999, maxRuntime: 110 });
  expect(query.interpretation).toEqual(['suspense ou ficção científica', 'Produção: Japão', 'Sem terror', '1990–1999', 'Até 110 min']);

  const result = recommend({ profile: null, customPrompt: 'x', searchQuery: query }, createCatalog([
    film('yes', { genres: ['Thriller'], country: 'Japan', year: 1995, runtime: 100 }),
    film('scifi', { genres: ['Sci-Fi'], country: 'Japan', year: 1997, runtime: 90 }),
    film('horror', { genres: ['Thriller', 'Horror'], country: 'Japan', year: 1995, runtime: 100 }),
    film('us', { genres: ['Thriller'], year: 1995, runtime: 100 }),
    film('long', { genres: ['Thriller'], country: 'Japan', year: 1995, runtime: 140 }),
    film('old', { genres: ['Thriller'], country: 'Japan', year: 1980, runtime: 100 }),
  ]), FIXED_NOW);
  expect(result.recommendations.map(item => item.catalogSlug).sort()).toEqual(['scifi', 'yes']);
});

test('a single alternative becomes a requirement and labels accept any case', () => {
  const query = accepted(validateModelQuery(answer({ anyOfGenres: ['comedy'], requiredGenres: ['ROMANCE'] }), 'algo romântico e engraçado'));
  expect([...query.genres].sort()).toEqual(['comedy', 'romance']);
  expect(query.clauses).toHaveLength(2);
});

test.each([
  ['not an object', 'texto livre'],
  ['an array', []],
  ['null', null],
  ['a genre outside the catalog', answer({ requiredGenres: ['Telenovela'] })],
  ['a country outside the dictionary', answer({ countries: ['ZZ'] })],
  ['a list of numbers', answer({ keywords: [1, 2] })],
  ['too many items', answer({ excludedGenres: ['Horror', 'War', 'Crime', 'Drama', 'Comedy', 'Action', 'Western'] })],
  ['a fractional year', answer({ minYear: 1990.5 })],
  ['a year out of range', answer({ maxYear: 3000 })],
  ['a runtime given as text', answer({ maxRuntime: '90' })],
  ['a negative runtime', answer({ minRuntime: -10 })],
])('rejects %s', (_label, raw) => {
  expect(rejected(validateModelQuery(raw, 'drama leve'))).toBeTruthy();
});

test('rejects contradictions instead of silently dropping a requirement', () => {
  expect(rejected(validateModelQuery(answer({ requiredGenres: ['Horror'], excludedGenres: ['Horror'] }), 'filme de medo'))).toMatch(/exigido e excluído/);
  expect(rejected(validateModelQuery(answer({ anyOfGenres: ['Horror', 'War'], excludedGenres: ['Horror', 'War'] }), 'algo pesado'))).toMatch(/alternativas/);
  expect(rejected(validateModelQuery(answer({ countries: ['FR'], excludedCountries: ['FR'] }), 'algo europeu'))).toMatch(/países/);
  expect(rejected(validateModelQuery(answer({ minYear: 2010, maxYear: 2000 }), 'algo da virada do século'))).toMatch(/período/);
  expect(rejected(validateModelQuery(answer({ minRuntime: 150, maxRuntime: 90 }), 'algo longo e curto'))).toMatch(/duração/);
});

test('an empty answer leaves the request to the rules', () => {
  expect(rejected(validateModelQuery(answer(), 'surpreenda-me'))).toMatch(/nenhum critério/);
});

test('keywords must come from the request and never repeat genres or countries', () => {
  const query = accepted(validateModelQuery(answer({
    requiredGenres: ['Drama'], keywords: ['ditadura', 'Brasil', 'drama', 'política', 'vencedor do Oscar'],
  }), 'drama brasileiro sobre a ditadura'));
  expect(query.lexicalTokens).toEqual(['ditadura']);
  expect(query.interpretation).toContain('Termos: ditadura');
});

test('explicit exclusions and limits recognized by the rules survive a model that misses them', () => {
  const query = accepted(validateModelQuery(answer({ requiredGenres: ['Comedy'], maxRuntime: 120 }), 'comédia sem terror, até 90 minutos'));
  expect([...query.excludedGenres]).toEqual(['horror']);
  expect(query.constraints).toEqual({ maxRuntime: 90 });
});

test('a model answer that contradicts the rule-based limits is rejected', () => {
  expect(rejected(validateModelQuery(answer({ minYear: 2010 }), 'drama antes de 2000'))).toMatch(/período/);
});

test('requests the rules flag as contradictory keep the rules warning', () => {
  expect(rejected(validateModelQuery(answer({ requiredGenres: ['Horror'] }), 'terror sem terror'))).toMatch(/regras/);
});

test('quoted titles, empty and very long prompts are not sent to the model', () => {
  expect(shouldInterpretWithModel('"Brazil"')).toBe(false);
  expect(shouldInterpretWithModel('   ')).toBe(false);
  expect(shouldInterpretWithModel('a'.repeat(301))).toBe(false);
  expect(shouldInterpretWithModel('filme para ver com a família')).toBe(true);
  expect(rejected(validateModelQuery(answer({ requiredGenres: ['Drama'] }), '"Brazil"'))).toBeTruthy();
});

test('the response schema offers exactly the validated vocabulary', () => {
  expect(MODEL_QUERY_SCHEMA.properties.requiredGenres.items.enum).toEqual([...MODEL_GENRES]);
  for (const genre of MODEL_GENRES) {
    expect(validateModelQuery(answer({ requiredGenres: [genre] }), 'qualquer coisa').ok).toBe(true);
  }
});

test('an exclusion the rules cannot read is accepted only when the model maps it', () => {
  const prompt = 'comédia sem sustos';
  expect(parseSearchQuery(prompt).uncheckedExclusions).toEqual(['sustos']);
  const query = accepted(validateModelQuery(answer({ requiredGenres: ['Comedy'], excludedGenres: ['Horror'], keywords: ['sustos'] }), prompt));
  expect([...query.excludedGenres]).toEqual(['horror']);
  expect(query.lexicalTokens).toEqual([]);
  expect(rejected(validateModelQuery(answer({ requiredGenres: ['Comedy'] }), prompt))).toMatch(/exclusão/);
});
