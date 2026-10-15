import { fold, foldWords, WORD_SEPARATORS } from '../text.ts';
import type { CatalogFilm, Filters } from '../film.ts';
import { passesConstraints } from './filters.ts';
import { extractQueryConstraints } from './query-constraints.ts';
import { extractQueryRequirements, passesQueryRequirements, type QueryClause } from './query-requirements.ts';

const FRANCHISE_ALIASES: Record<string, string[]> = {
  marvel: [
    'marvel', 'avengers', 'vingadores', 'iron man', 'homem de ferro',
    'captain america', 'capitao america', 'black panther', 'pantera negra',
    'thor', 'spider man', 'homem aranha', 'guardians of the galaxy', 'guardioes da galaxia',
    'doctor strange', 'doutor estranho', 'hulk', 'black widow', 'viuva negra',
    'shang chi', 'eternals', 'eternos', 'ant man', 'homem formiga', 'deadpool',
    'wolverine', 'x men', 'quarteto fantastico', 'fantastic four',
  ],
};

// Terms with a well-defined cinematic meaning must use the catalog genre as a
// hard constraint. This is an ontology of the catalog's canonical genres, not
// a list for individual search examples: a title containing "terror" is not
// necessarily Horror.
const GENRE_INTENTS: Record<string, string | string[]> = {
  terror: 'Horror', horror: 'Horror', scary: 'Horror', slasher: 'Horror',
  assustador: 'Horror', sobrenatural: 'Horror',
  suspense: 'Thriller', thriller: 'Thriller',
  misterio: 'Mystery', mystery: 'Mystery', detetive: 'Mystery', detetives: 'Mystery',
  detective: 'Mystery', detectives: 'Mystery', investigacao: 'Mystery',
  crime: 'Crime', criminal: 'Crime', mafia: 'Crime', policial: 'Crime',
  acao: 'Action', action: 'Action', aventura: 'Adventure', adventure: 'Adventure',
  comedia: 'Comedy', comedy: 'Comedy', humor: 'Comedy',
  romance: 'Romance', romantico: 'Romance', romantica: 'Romance', romantic: 'Romance',
  'rom com': ['Comedy', 'Romance'], romcom: ['Comedy', 'Romance'],
  drama: 'Drama',
  animacao: 'Animation', animation: 'Animation', anime: 'Animation',
  documentario: 'Documentary', documentary: 'Documentary',
  guerra: 'War', war: 'War', faroeste: 'Western', western: 'Western',
  musical: 'Musical', musica: 'Music', fantasia: 'Fantasy', fantasy: 'Fantasy',
  biografia: 'Biography', biography: 'Biography', esporte: 'Sport', desporto: 'Sport',
  giallo: ['Horror', 'Mystery'], satira: 'Comedy',
  'artes marciais': 'Action',
  'film noir': 'Film-Noir', noir: 'Film-Noir', 'neo noir': 'Film-Noir', neonoir: 'Film-Noir',
  // The catalog canonicalizes this as "Sci-Fi"; keeping the aliases aligned
  // prevents a valid Portuguese search from being filtered down to zero.
  ficcao: 'Sci-Fi', 'ficcao cientifica': 'Sci-Fi', 'science fiction': 'Sci-Fi',
  'sci fi': 'Sci-Fi', scifi: 'Sci-Fi',
  'space opera': ['Sci-Fi', 'Adventure'],
  'super hero': ['Action', 'Sci-Fi'], 'super heroi': ['Action', 'Sci-Fi'], superheroi: ['Action', 'Sci-Fi'],
};
// Longest first, so "neo noir" wins over "noir".
const GENRE_INTENT_ENTRIES = Object.entries(GENRE_INTENTS).sort(([a], [b]) => b.length - a.length);

// Portuguese connectors too generic to be search signals.
const STOPWORDS = new Set([
  'de', 'da', 'do', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'as', 'os', 'um', 'uma',
  'uns', 'umas', 'que', 'com', 'para', 'por', 'anos', 'ano', 'filme',
  'filmes', 'ver', 'quero', 'gosto', 'tipo', 'como', 'mas', 'mais',
  'sem', 'nao', 'exceto', 'evitar', 'excluindo', 'without', 'seja', 'sejam',
  'algo', 'algum', 'alguma', 'hoje', 'assistir', 'minha', 'meu', 'mae', 'pai', 'familia',
  'ate', 'minutos', 'min', 'horas', 'hora', 'producao', 'produzido', 'produzida',
  'ou', 'or', 'nem', 'tambem', 'apenas', 'somente', 'precisa', 'preciso', 'ser', 'ter',
  'prefiro', 'porem', 'contudo', 'incluindo', 'maximo', 'menos', 'pelo', 'desde',
]);

// Keywords that appear in >15% of the catalog: genre-level noise for search.
const GENERIC_KEYWORDS = new Set([
  'drama', 'dramatico', 'emocional', 'intense', 'poderoso', 'relacoes humanas',
  'contemporaneo', 'duracao media', 'convencional', 'filme longo', 'epico',
  'anos 2000', 'anos 2010', 'anos 2020', '2000s', '2010s',
  'crime', 'thriller', 'criminal', 'policial', 'detetive', 'assassinato',
  'gangster', 'mafia', 'trafico', 'assalto', 'sequestro', 'ladrao',
  'suspense', 'tensao', 'adrenalina', 'perseguicao', 'paranoia',
  'adventure', 'aventura', 'exploracao', 'jornada', 'expedicao', 'missao',
  'action', 'acao', 'luta', 'combate', 'explosao',
  'comedy', 'comedia', 'humor', 'engracado', 'comedia romantica', 'risada',
  'psicologico',
]);

export function isSpecificKeyword(keyword: string): boolean {
  return !GENERIC_KEYWORDS.has(fold(keyword));
}

const PT_SUFFIXES = [
  'mente', 'acao', 'ções', 'ismo', 'ista',
  'eira', 'eiro', 'iana', 'iano', 'avel', 'ivel',
  'icas', 'icos', 'osas', 'osos', 'adas', 'ados',
  'ica', 'ico', 'osa', 'oso', 'ada', 'ado',
  'ais', 'eis', 'ois', 'ias', 'ios', 'oes',
  'ia', 'io', 'al', 'ar', 'er', 'ir', 'as', 'os', 'es',
  'a', 'o', 'e', 's',
];

/** Strips common Portuguese suffixes: "italiana"/"italiano" share a stem. */
export function stemPt(word: string): string {
  if (word.length < 4) return word;
  const suffix = PT_SUFFIXES.find((value) => word.length > value.length + 3 && word.endsWith(value));
  return suffix ? word.slice(0, -suffix.length) : word;
}

/** Substring (≥70% of the length), shared 5+ char stem or 85% shared prefix. */
export function fuzzyMatch(token: string, word: string): boolean {
  if (token === word) return true;
  if (word.includes(token) && token.length >= word.length * 0.7) return true;
  if (token.includes(word) && word.length >= token.length * 0.7) return true;
  const stemA = stemPt(token);
  const stemB = stemPt(word);
  if (stemA.length >= 5 && stemB.length >= 5 && stemA === stemB) return true;
  const prefixLength = Math.min(token.length, word.length);
  if (prefixLength >= 5) {
    const checked = Math.ceil(prefixLength * 0.85);
    if (token.substring(0, checked) === word.substring(0, checked)) return true;
  }
  return false;
}

export function fuzzyMatchInText(token: string, text: string): boolean {
  if (!text || !token) return false;
  if (text.includes(token)) return true;
  return text
    .split(WORD_SEPARATORS)
    .filter((word) => word.length >= 2)
    .some((word) => fuzzyMatch(token, word));
}

/**
 * Whether fuzzyMatchInText(token, text) can hold for a text containing this
 * word. For a token without separators the two are equivalent, so a word
 * index finds every film a lexical token can match.
 */
export function wordMatchesToken(token: string, word: string): boolean {
  return word.includes(token) || (word.length >= 2 && fuzzyMatch(token, word));
}

export interface SearchQuery {
  /** Folded prompt, used for whole-phrase title matches. */
  clean: string;
  tokens: string[];
  /** Tokens still to be matched literally (genre aliases already applied). */
  lexicalTokens: string[];
  /** Requirements shared by all alternatives; safe for narrowing the index. */
  genres: Set<string>;
  excludedGenres: Set<string>;
  countries: Set<string>;
  excludedCountries: Set<string>;
  constraints: Filters;
  preferredGenres: Set<string>;
  interpretation: string[];
  franchiseAliases: string[];
  clauses: QueryClause[];
  issues: string[];
  /** Negated phrases that map to no genre or country; each also raises one issue. */
  uncheckedExclusions: string[];
}

/** Extract explicit requirements before matching the remaining words. */
export function parseSearchQuery(prompt: string): SearchQuery {
  const literalTitle = prompt.trim().match(/^["“](.+)["”]$/)?.[1];
  if (literalTitle) {
    const clean = fold(literalTitle);
    const tokens = foldWords(literalTitle).split(/\s+/).filter(Boolean);
    return { clean, tokens, lexicalTokens: tokens, genres: new Set(), excludedGenres: new Set(),
      countries: new Set(), excludedCountries: new Set(), constraints: {}, preferredGenres: new Set(),
      interpretation: [`Título: ${literalTitle}`], franchiseAliases: [], clauses: [], issues: [], uncheckedExclusions: [] };
  }
  const clean = fold(prompt.trim());
  // "sci-fi", "sci fi" and "sci/fi" are the same query.
  // Keep clause boundaries: folding punctuation away made negations leak.
  const intent = fold(prompt).replace(/[^a-z0-9,;.!?]+/g, ' ').replace(/\s+/g, ' ');
  const temporal = extractQueryConstraints(intent);
  const requirements = extractQueryRequirements(temporal.remaining, GENRE_INTENT_ENTRIES);
  const { constraints } = temporal;
  const { genres, excludedGenres, countries, excludedCountries, preferredGenres, interpretation, clauses } = requirements;
  const lexicalTokens = foldWords(requirements.remaining).split(/\s+/).filter(word => word.length >= 3 && !STOPWORDS.has(word));
  // Unrecognized exclusions must never become positive lexical requirements.
  const negativeText = requirements.remaining.replace(/\bnao (?:(?:precisa|preciso) (?:ser|ter)|so|apenas|somente)\b/g, ' ');
  const exclusionIssues: string[] = [];
  const uncheckedExclusions: string[] = [];
  if (/\b(?:ou|or|sem|exceto|nem|without)\s*$/.test(intent)) exclusionIssues.push('O pedido terminou com uma alternativa ou exclusão incompleta. Complete o gênero ou país depois de “ou” ou “sem”.');
  for (const match of negativeText.matchAll(/\b(?:sem filmes? com|sem|exceto|evitar|excluindo|without|nem|nao(?: quero| seja)?)\b([^,;.!?]*)/g)) {
    const scope = match[1].split(/\b(?:mas|porem|contudo|prefiro|quero|com|incluindo)\b/)[0];
    const unknown = foldWords(scope).split(/\s+/).filter(word => word.length >= 3 && !STOPWORDS.has(word));
    if (unknown.length) uncheckedExclusions.push(unknown.join(' '));
    if (unknown.length) exclusionIssues.push(`Não consigo verificar a exclusão “sem ${unknown.join(' ')}” pelos dados disponíveis. Use gêneros ou países, como “sem terror”.`);
  }
  interpretation.push(...describeConstraints(constraints));
  return {
    clean, tokens: foldWords(prompt).split(/\s+/).filter(Boolean), lexicalTokens, genres, excludedGenres,
    countries, excludedCountries, constraints, preferredGenres, interpretation,
    franchiseAliases: FRANCHISE_ALIASES[clean] ?? [],
    clauses, issues: [...temporal.issues, ...requirements.issues, ...exclusionIssues], uncheckedExclusions,
  };
}

/** Period and runtime limits, in the words shown to the user. */
export function describeConstraints(constraints: Filters): string[] {
  const labels: string[] = [];
  if (constraints.minYear && constraints.maxYear) labels.push(constraints.minYear === constraints.maxYear ? `Ano: ${constraints.minYear}` : `${constraints.minYear}–${constraints.maxYear}`);
  else if (constraints.minYear) labels.push(`A partir de ${constraints.minYear}`);
  else if (constraints.maxYear) labels.push(`Até ${constraints.maxYear}`);
  if (constraints.maxRuntime !== undefined) labels.push(`Até ${constraints.maxRuntime} min`);
  if (constraints.minRuntime !== undefined) labels.push(`Pelo menos ${constraints.minRuntime} min`);
  return labels;
}

export function passesQuery(film: CatalogFilm, query: SearchQuery): boolean {
  return query.issues.length === 0 && passesQueryRequirements(film, query) && passesConstraints(film, query.constraints);
}
