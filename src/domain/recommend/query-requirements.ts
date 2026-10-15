import { COUNTRIES, productionCountries } from '../catalog/countries.ts';
import type { CatalogFilm } from '../film.ts';
import { fold } from '../text.ts';

export interface QueryRequirement { kind: 'genre' | 'country'; values: string[] }
/** All clauses must hold; within a clause, alternatives contain conjunctive terms. */
export type QueryClause = QueryRequirement[][];

export const GENRE_LABELS: Record<string, string> = {
  horror: 'terror', thriller: 'suspense', crime: 'crime', comedy: 'comédia', romance: 'romance',
  drama: 'drama', animation: 'animação', 'sci-fi': 'ficção científica', war: 'guerra', action: 'ação',
  adventure: 'aventura', documentary: 'documentário', mystery: 'mistério', fantasy: 'fantasia',
  western: 'faroeste', family: 'família', 'film-noir': 'noir', musical: 'musical', music: 'música',
  biography: 'biografia', sport: 'esporte', history: 'história',
};
export const requirementLabel = (term: QueryRequirement): string => term.kind === 'genre'
  ? term.values.map(value => GENRE_LABELS[value] ?? value).join(' e ')
  : `Produção: ${term.values.map(value => COUNTRIES.find(country => country.code === value)!.label).join(' e ')}`;

export function extractQueryRequirements(source: string, genreEntries: [string, string | string[]][]) {
  let remaining = source;
  const terms: (QueryRequirement & { start: number; end: number; light?: boolean })[] = [];
  const aliases = [
    ...genreEntries.map(([alias, genres]) => ({ alias, kind: 'genre' as const, values: (Array.isArray(genres) ? genres : [genres]).map(fold) })),
    ...COUNTRIES.flatMap(country => country.aliases.map(alias => ({ alias, kind: 'country' as const, values: [country.code] }))),
    ...['leve', 'tranquilo', 'confortavel'].map(alias => ({ alias, kind: 'genre' as const, values: [], light: true })),
  ].sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, ...term } of aliases) {
    for (const match of remaining.matchAll(new RegExp(`\\b${alias}\\b`, 'g'))) {
      const start = match.index!;
      terms.push({ ...term, start, end: start + match[0].length });
      remaining = remaining.slice(0, start) + ' '.repeat(match[0].length) + remaining.slice(start + match[0].length);
    }
  }
  terms.sort((a, b) => a.start - b.start);
  const clauses: QueryClause[] = [];
  const excludedGenres = new Set<string>();
  const excludedCountries = new Set<string>();
  const preferredGenres = new Set<string>();
  const notes: string[] = [];
  let clause: QueryClause = [];
  let branch: QueryRequirement[] = [];
  let mode: 'positive' | 'negative' | 'optional' = 'positive';
  let previousEnd = 0;
  const flush = (): void => {
    if (branch.length) clause.push(branch);
    if (clause.length) clauses.push(clause);
    branch = []; clause = [];
  };
  // Commas and explicit positive transitions close a negative scope. "Nem"
  // starts it again; "não só" and "não precisa ser" are not exclusions.
  const controls = /\b(?:nao (?:precisa|preciso) (?:ser|ter)|nao (?:so|apenas|somente)|nao quero|nao seja|sem|exceto|evitar|excluindo|without|nem|nao|mas tambem|mas|porem|contudo|prefiro|quero|com|incluindo)\b|[,;.!?]/g;
  for (const term of terms) {
    const gap = source.slice(previousEnd, term.start);
    let boundary = false;
    for (const control of gap.matchAll(controls)) {
      const word = control[0];
      if (/^(nao (?:precisa|preciso))/.test(word)) { flush(); mode = 'optional'; boundary = true; }
      else if (/^(sem|exceto|evitar|excluindo|without|nem|nao(?! (so|apenas|somente)))/.test(word)) { flush(); mode = 'negative'; boundary = true; }
      else {
        if (mode !== 'positive' || /^[,;.!?]$|^(mas|porem|contudo)/.test(word)) { flush(); boundary = true; }
        mode = 'positive';
      }
    }
    if (term.light) {
      if (mode === 'positive') {
        for (const genre of ['comedy', 'family']) preferredGenres.add(genre);
        for (const genre of ['horror', 'thriller', 'war']) excludedGenres.add(genre);
        notes.push('Clima leve: priorizar comédia e família');
      }
    } else if (mode === 'negative') {
      for (const value of term.values) (term.kind === 'genre' ? excludedGenres : excludedCountries).add(value);
    } else if (mode === 'optional') {
      notes.push(`Não exigir ${requirementLabel(term).toLocaleLowerCase('pt-BR')}`);
    } else {
      if (!boundary && /\b(?:ou|or)\b/.test(gap) && branch.length) { clause.push(branch); branch = []; }
      branch.push({ kind: term.kind, values: term.values });
    }
    previousEnd = term.end;
  }
  flush();
  // "Drama italiano ou francês" shares drama with both production origins.
  // Fully specified branches ("suspense italiano ou drama francês") keep
  // their own pairings. A comma is the explicit way to share any other term.
  for (const alternatives of clauses) {
    const first = alternatives[0];
    if (first.some(term => term.kind === 'genre') && first.some(term => term.kind === 'country')) {
      for (const branch of alternatives.slice(1)) {
        if (branch.every(term => term.kind === 'country')) branch.unshift(...first.filter(term => term.kind === 'genre'));
      }
    }
  }
  // Only requirements shared by all alternatives may narrow the candidate index.
  const mandatory = (kind: QueryRequirement['kind']): Set<string> => new Set(clauses.flatMap(alternatives => {
    const values = alternatives.map(branch => new Set(branch.filter(term => term.kind === kind).flatMap(term => term.values)));
    return [...values[0]].filter(value => values.every(set => set.has(value)));
  }));
  const interpretation = [...new Set(notes), ...clauses.map(alternatives => alternatives.map(branch => {
    const text = branch.map(requirementLabel).join(' e ');
    return alternatives.length > 1 && branch.length > 1 ? `(${text})` : text;
  }).join(' ou '))];
  for (const genre of excludedGenres) interpretation.push(`Sem ${GENRE_LABELS[genre] ?? genre}`);
  for (const country of excludedCountries) interpretation.push(`Excluir produção: ${COUNTRIES.find(item => item.code === country)!.label}`);
  const impossible = clauses.some(alternatives => alternatives.every(branch => branch.some(term =>
    term.values.some(value => (term.kind === 'genre' ? excludedGenres : excludedCountries).has(value)))));
  return { remaining, clauses, genres: mandatory('genre'), countries: mandatory('country'), excludedGenres, excludedCountries,
    preferredGenres, interpretation, issues: impossible ? ['O pedido exige e exclui os mesmos critérios, sem uma alternativa possível. Revise os gêneros ou países incluídos e excluídos.'] : [] };
}

export function passesQueryRequirements(film: CatalogFilm, query: {
  clauses: QueryClause[]; excludedGenres: Set<string>; excludedCountries: Set<string>;
}): boolean {
  if (!query.clauses.length && !query.excludedGenres.size && !query.excludedCountries.size) return true;
  const genres = new Set(film.genres.map(fold));
  const countries = productionCountries(film.country);
  if ([...query.excludedGenres].some(genre => genres.has(genre))) return false;
  if ([...query.excludedCountries].some(country => countries.has(country))) return false;
  return query.clauses.every(alternatives => alternatives.some(branch => branch.every(term =>
    term.values.every(value => (term.kind === 'genre' ? genres : countries).has(value)))));
}
