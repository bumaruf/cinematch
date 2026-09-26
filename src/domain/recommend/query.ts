import { containsPhrase, fold, foldWords } from '../text.ts';

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
  crime: 'Crime', criminal: 'Crime', mafia: 'Crime', policial: 'Policial',
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
  classico: 'Clássico', mudo: 'Mudo', giallo: 'Giallo', satira: 'Sátira',
  'road movie': 'Road Movie', 'filme de estrada': 'Road Movie',
  'artes marciais': 'Artes Marciais',
  'film noir': 'Film-Noir', noir: 'Film-Noir', 'neo noir': 'Neo-Noir', neonoir: 'Neo-Noir',
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
  'de', 'da', 'do', 'em', 'no', 'na', 'ao', 'aos', 'as', 'os', 'um', 'uma',
  'uns', 'umas', 'que', 'com', 'para', 'por', 'anos', 'ano', 'filme',
  'filmes', 'ver', 'quero', 'gosto', 'tipo', 'como', 'mas', 'mais',
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
  franchiseAliases: string[];
}

/** "anos 80" also searches for the "1980s" catalog tag. */
function expandDecades(prompt: string): string {
  return prompt
    .replace(/anos\s+50s?/gi, 'anos 50 1950s')
    .replace(/anos\s+60s?/gi, 'anos 60 1960s')
    .replace(/anos\s+70s?/gi, 'anos 70 1970s')
    .replace(/anos\s+80s?/gi, 'anos 80 1980s')
    .replace(/anos\s+90s?/gi, 'anos 90 1990s')
    .replace(/anos\s+2000s?/gi, 'anos 2000 2000s')
    .replace(/anos\s+2010s?/gi, 'anos 2010 2010s');
}

export function parseSearchQuery(prompt: string): SearchQuery {
  const expanded = expandDecades(prompt);
  const clean = fold(expanded);
  // "sci-fi", "sci fi" and "sci/fi" are the same query.
  const intent = foldWords(expanded).replace(/\s+/g, ' ');
  const tokens = intent
    ? intent.split(/[\s,.;:!?+\-_/]+/).filter((word) => {
        if (!word) return false;
        if (/^\d+$/.test(word)) return word.length >= 2;
        return word.length >= 3 && !STOPWORDS.has(word);
      })
    : [];

  const genres = new Set<string>();
  const matchedAliases: string[] = [];
  for (const [term, genre] of GENRE_INTENT_ENTRIES) {
    if (!containsPhrase(intent, term)) continue;
    if (matchedAliases.some((matched) => matched.includes(term))) continue;
    matchedAliases.push(term);
    for (const canonical of Array.isArray(genre) ? genre : [genre]) genres.add(fold(canonical));
  }
  // An alias already interpreted as a genre need not appear literally too.
  const aliasTokens = new Set(matchedAliases.flatMap((alias) => alias.split(' ')));

  return {
    clean,
    tokens,
    lexicalTokens: tokens.filter((token) => !aliasTokens.has(token)),
    genres,
    franchiseAliases: tokens.length === 1 ? (FRANCHISE_ALIASES[clean] ?? []) : [],
  };
}
