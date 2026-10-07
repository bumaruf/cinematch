import { containsPhrase, fold, foldWords } from '../text.ts';
import { COUNTRIES, productionCountries } from '../catalog/countries.ts';
import type { CatalogFilm, Filters } from '../film.ts';
import { passesConstraints } from './filters.ts';

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
    .split(/[\s,.:;!?/\-_()]+/)
    .filter((word) => word.length >= 2)
    .some((word) => fuzzyMatch(token, word));
}

export interface SearchQuery {
  /** Folded prompt, used for whole-phrase title matches. */
  clean: string;
  tokens: string[];
  /** Tokens still to be matched literally (genre aliases already applied). */
  lexicalTokens: string[];
  /** Folded canonical genres that every result must have. */
  genres: Set<string>;
  excludedGenres: Set<string>;
  countries: Set<string>;
  excludedCountries: Set<string>;
  constraints: Filters;
  preferredGenres: Set<string>;
  interpretation: string[];
  franchiseAliases: string[];
}

/** Extract explicit requirements before matching the remaining words. */
export function parseSearchQuery(prompt: string): SearchQuery {
  const literalTitle = prompt.trim().match(/^["“](.+)["”]$/)?.[1];
  if (literalTitle) {
    const clean = fold(literalTitle);
    const tokens = foldWords(literalTitle).split(/\s+/).filter(Boolean);
    return { clean, tokens, lexicalTokens: tokens, genres: new Set(), excludedGenres: new Set(),
      countries: new Set(), excludedCountries: new Set(), constraints: {}, preferredGenres: new Set(),
      interpretation: [`Título: ${literalTitle}`], franchiseAliases: [] };
  }
  const clean = fold(prompt.trim());
  // "sci-fi", "sci fi" and "sci/fi" are the same query.
  const intent = foldWords(prompt).replace(/\s+/g, ' ');
  let remaining = intent;
  const genres = new Set<string>();
  const excludedGenres = new Set<string>();
  const countries = new Set<string>();
  const excludedCountries = new Set<string>();
  const preferredGenres = new Set<string>();
  const constraints: Filters = {};
  const interpretation: string[] = [];
  const consume = (pattern: RegExp, apply: (match: RegExpMatchArray) => void): void => {
    for (const match of remaining.matchAll(pattern)) {
      apply(match);
      const index = match.index!;
      remaining = remaining.slice(0, index) + ' '.repeat(match[0].length) + remaining.slice(index + match[0].length);
    }
  };
  const negateAt = (index: number): boolean => {
    const prefix = intent.slice(0, index);
    const negative = [...prefix.matchAll(/\b(?:sem|exceto|evitar|excluindo|nao quero|nao|without)\b/g)].at(-1)?.index ?? -1;
    const positive = [...prefix.matchAll(/\b(?:mas|com|incluindo)\b/g)].at(-1)?.index ?? -1;
    return negative > positive;
  };
  // Explicit periods and durations become hard constraints, never keywords.
  consume(/\b(?:entre|de)\s+(18\d{2}|19\d{2}|20\d{2})\s+(?:e|a|ate)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, (m) => {
    constraints.minYear = Number(m[1]); constraints.maxYear = Number(m[2]);
  });
  consume(/\b(?:anos|decada de)\s+(\d{4}|\d{2})s?\b/g, (m) => {
    const value = Number(m[1]);
    const year = value < 100 ? (value < 30 ? 2000 : 1900) + value : value;
    constraints.minYear = Math.floor(year / 10) * 10; constraints.maxYear = constraints.minYear + 9;
  });
  consume(/\b(?:apos|depois de|a partir de)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, (m) => { constraints.minYear = Number(m[1]) + (m[0].startsWith('a partir') ? 0 : 1); });
  consume(/\b(?:antes de|ate)\s+(18\d{2}|19\d{2}|20\d{2})\b/g, (m) => { constraints.maxYear = Number(m[1]) - (m[0].startsWith('antes') ? 1 : 0); });
  consume(/\b(?:ate|no maximo|menos de|mais de|pelo menos)\s+(\d{1,3})\s*(?:minutos|min|m)\b/g, (m) => {
    const minutes = Number(m[1]);
    if (/^(mais de|pelo menos)/.test(m[0])) constraints.minRuntime = minutes + (m[0].startsWith('mais') ? 1 : 0);
    else constraints.maxRuntime = minutes - (m[0].startsWith('menos') ? 1 : 0);
  });
  consume(/\b(?:ate|no maximo|menos de|mais de|pelo menos)\s+(\d)\s*(?:h|horas?)(?:\s*(?:e\s*)?(\d{1,2})\s*(?:minutos|min)?)?\b/g, (m) => {
    const minutes = Number(m[1]) * 60 + Number(m[2] || 0);
    if (/^(mais de|pelo menos)/.test(m[0])) constraints.minRuntime = minutes + (m[0].startsWith('mais') ? 1 : 0);
    else constraints.maxRuntime = minutes - (m[0].startsWith('menos') ? 1 : 0);
  });
  consume(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, (m) => { constraints.minYear = Number(m[1]); constraints.maxYear = Number(m[1]); });
  const aliases = COUNTRIES.flatMap((country) => country.aliases.map((alias) => ({ ...country, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, code } of aliases) consume(new RegExp(`\\b${alias}\\b`, 'g'), (m) => { (negateAt(m.index!) ? excludedCountries : countries).add(code); });
  for (const [term, genre] of GENRE_INTENT_ENTRIES) {
    consume(new RegExp(`\\b${term}\\b`, 'g'), (m) => {
      for (const canonical of Array.isArray(genre) ? genre : [genre]) (negateAt(m.index!) ? excludedGenres : genres).add(fold(canonical));
    });
  }
  consume(/\b(?:leve|tranquilo|confortavel)\b/g, (m) => {
    if (negateAt(m.index!)) return;
    for (const genre of ['comedy', 'family']) preferredGenres.add(genre);
    for (const genre of ['horror', 'thriller', 'war']) excludedGenres.add(genre);
    interpretation.push('Clima leve: priorizar comédia e família');
  });
  const lexicalTokens = remaining.split(/\s+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  const labels: Record<string, string> = { horror: 'terror', thriller: 'suspense', crime: 'crime', comedy: 'comédia', romance: 'romance', drama: 'drama', animation: 'animação', 'sci-fi': 'ficção científica', war: 'guerra', action: 'ação', documentary: 'documentário', mystery: 'mistério', fantasy: 'fantasia', western: 'faroeste', family: 'família' };
  for (const genre of genres) interpretation.push(labels[genre] ?? genre);
  for (const genre of excludedGenres) interpretation.push(`Sem ${labels[genre] ?? genre}`);
  for (const country of countries) interpretation.push(`Produção: ${COUNTRIES.find((item) => item.code === country)!.label}`);
  for (const country of excludedCountries) interpretation.push(`Excluir produção: ${COUNTRIES.find((item) => item.code === country)!.label}`);
  if (constraints.minYear && constraints.maxYear) interpretation.push(constraints.minYear === constraints.maxYear ? `Ano: ${constraints.minYear}` : `${constraints.minYear}–${constraints.maxYear}`);
  else if (constraints.minYear) interpretation.push(`A partir de ${constraints.minYear}`);
  else if (constraints.maxYear) interpretation.push(`Até ${constraints.maxYear}`);
  if (constraints.maxRuntime !== undefined) interpretation.push(`Até ${constraints.maxRuntime} min`);
  if (constraints.minRuntime !== undefined) interpretation.push(`Pelo menos ${constraints.minRuntime} min`);
  return {
    clean, tokens: intent.split(/\s+/).filter(Boolean), lexicalTokens, genres, excludedGenres,
    countries, excludedCountries, constraints, preferredGenres, interpretation,
    franchiseAliases: FRANCHISE_ALIASES[clean] ?? [],
  };
}

export function passesQuery(film: CatalogFilm, query: SearchQuery): boolean {
  if (query.genres.size || query.excludedGenres.size) {
    const genres = new Set(film.genres.map(fold));
    if (![...query.genres].every((genre) => genres.has(genre))) return false;
    if ([...query.excludedGenres].some((genre) => genres.has(genre))) return false;
  }
  if (query.countries.size || query.excludedCountries.size) {
    const countries = productionCountries(film.country);
    if (![...query.countries].every((country) => countries.has(country))) return false;
    if ([...query.excludedCountries].some((country) => countries.has(country))) return false;
  }
  return passesConstraints(film, query.constraints);
}
