import type { KeywordEvidence } from '../film.ts';
import { COUNTRIES } from './countries.ts';
import { containsPhrase, fold, foldWords } from '../text.ts';

/** These expansions help lexical lookup; they cannot establish cinematic traits. */
export const GENRE_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  action: ['ação', 'action', 'adrenalina', 'luta', 'combate', 'explosão', 'perseguição'],
  adventure: ['aventura', 'adventure', 'exploração', 'jornada', 'expedição', 'missão'],
  animation: ['animação', 'animation', 'desenho animado', 'cartoon', 'animated'],
  biography: ['biografia', 'biography', 'biopic', 'baseado em fatos reais', 'história real', 'vida real'],
  comedy: ['comédia', 'comedy', 'humor', 'engraçado', 'risada', 'comédia romântica'],
  crime: ['crime', 'criminal', 'policial', 'detetive', 'assassinato', 'gangster', 'gângster', 'mafia', 'máfia', 'tráfico', 'assalto', 'sequestro', 'ladrão'],
  documentary: ['documentário', 'documentary', 'entrevista', 'reportagem', 'real'],
  drama: ['drama', 'dramático', 'emocional', 'intense', 'poderoso', 'relações humanas'],
  family: ['família', 'family', 'criança', 'infantil', 'kids'],
  fantasy: ['fantasia', 'fantasy', 'magia', 'mágico', 'feiticeiro', 'dragão', 'elfos', 'realismo mágico', 'magical realism'],
  'film-noir': ['film noir', 'noir', 'neo-noir', 'crime noir', 'anos 40', 'anos 50', 'detetive', 'femme fatale', 'sombrio'],
  history: ['história', 'history', 'histórico', 'época', 'antiguidade', 'medieval', 'império', 'baseado em fatos'],
  horror: ['terror', 'horror', 'medo', 'assustador', 'sobrenatural', 'demônio', 'fantasma', 'monstro', 'slasher', 'psicológico'],
  music: ['música', 'music', 'musical', 'canção', 'banda', 'concerto', 'rock', 'jazz'],
  musical: ['musical', 'canto', 'dança', 'coreografia', 'broadway'],
  mystery: ['mistério', 'mystery', 'suspense', 'enigma', 'investigação', 'quem fez', 'whodunit'],
  romance: ['romance', 'amor', 'love', 'paixão', 'relacionamento', 'casal', 'encontro', 'reencontro', 'desencontro'],
  'sci-fi': ['ficção científica', 'sci-fi', 'science fiction', 'futurismo', 'tecnologia', 'inteligência artificial', 'espaço', 'alienígena', 'robô', 'distopia', 'utopia', 'viagem no tempo'],
  sport: ['esporte', 'sport', 'futebol', 'basquete', 'boxe', 'competição', 'campeonato', 'atleta'],
  thriller: ['thriller', 'suspense', 'tensão', 'perseguição', 'paranoia', 'conspiração', 'serial killer', 'psicológico'],
  war: ['guerra', 'war', 'war movie', 'guerra bélica', 'war film', 'combate', 'batalha', 'soldado', 'exército', 'bélico', 'conflito armado', 'segunda guerra', 'vietnam', 'trincheira'],
  western: ['faroeste', 'western', 'cowboy', 'pistoleiro', 'velho oeste', 'sheriff', 'bandido', 'duelo', 'saloon', 'spaghetti western'],
};

const GENERATED = new Set([...Object.values(GENRE_KEYWORDS).flat(), ...COUNTRIES.flatMap((country) => country.aliases),
  'american', 'italian', 'japanese', 'brazilian', 'german', 'korean', 'british', 'french',
  'popular', 'aclamado', 'obra-prima', 'masterpiece', 'cult', 'contemporâneo', 'duração média', 'filme longo', 'filme curto', 'compacto', 'épico', 'vintage', 'golden age', 'era de ouro'].map(foldWords));
// Older enrichment copied these traits from a director or production country
// to every film. A synopsis can still establish them, but the inherited tag cannot.
const LEGACY_STYLE_TERMS = new Set([
  'slow cinema', 'contemplativo', 'filosófico', 'espiritual', 'arte', 'existencial',
  'surreal', 'surrealismo', 'sonho', 'experimental', 'intelectual', 'nouvelle vague',
  'autobiográfico', 'neorrealismo', 'samurai', 'honra', 'cotidiano', 'tatami',
  'crime organizado', 'corleone', 'melancolia', 'dark comedy', 'humor negro',
  'slow burn', 'terror psicológico', 'horror elevado', 'luto', 'folk horror',
  'terror atmosférico', 'horror histórico', 'natureza', 'poético', 'infância',
  'coming of age', 'crítica social', 'alienação', 'camorra', 'paris', 'roma',
  'tóquio', 'tokyo', 'seoul', 'buenos aires', 'gore', 'realidade vs sonho',
  'obsessão', 'autodestruição', 'perturbador', 'weird', 'bizarro', 'absurdo',
  'satírico', 'provocador', 'visceral', 'psicodélico', 'claustrofóbico',
  'humor seco', 'quirky', 'excêntrico', 'personagens complexos',
  'mindfuck', 'não linear', 'tempo', 'paradoxo', 'inteligente', 'complexo',
  'sombrio', 'diálogos afiados', 'violência estilizada', 'nova york',
].map(foldWords));

export function isGeneratedKeyword(term: string): boolean {
  return GENERATED.has(foldWords(term)) || /^(?:anos )?\d+(?:s)?$/.test(foldWords(term));
}

export interface EvidenceFilm {
  title?: string;
  originalTitle?: string;
  director?: string;
  genres?: readonly string[];
  keywords?: readonly string[];
  keywordEvidence?: readonly KeywordEvidence[];
  pitch?: string;
}
const specificCache = new WeakMap<EvidenceFilm, string[]>();
const descriptiveCache = new WeakMap<EvidenceFilm, string[]>();

/** Old catalogs are handled conservatively without rewriting users' data. */
export function specificKeywords(film: EvidenceFilm): string[] {
  const cached = specificCache.get(film); if (cached) return cached;
  const metadata = new Set([film.title, film.originalTitle, film.director, ...(film.genres ?? [])].filter(Boolean).map((value) => foldWords(value!)));
  const sources = new Map((film.keywordEvidence ?? []).map((entry) => [foldWords(entry.term), entry.source]));
  const keywords = [...new Set((film.keywords ?? []).filter((term) => {
    const key = foldWords(term);
    if (!key || metadata.has(key) || /\d/.test(key)) return false;
    const source = sources.get(key);
    if (source === 'film') return true;
    if (source && source !== 'legacy') return false;
    return !isGeneratedKeyword(term) && !LEGACY_STYLE_TERMS.has(key) && !/^cinema |^drama |^terror |^romance |^animacao |ghibli/.test(key);
  }).map(fold))];
  specificCache.set(film, keywords); return keywords;
}

const CONCEPTS: Readonly<Record<string, readonly string[]>> = {
  memoria: ['memoria', 'memory', 'amnesia', 'lembrancas'],
  identidade: ['identidade', 'identity', 'dupla vida', 'double life'],
  vinganca: ['vinganca', 'revenge', 'vengeance'],
  investigacao: ['investigacao', 'investigation', 'investigating'],
  corrupcao: ['corrupcao', 'corruption', 'corrupt'],
  luto: ['luto', 'grief', 'mourning'],
  isolamento: ['isolamento', 'isolation', 'solidao', 'loneliness'],
  amizade: ['amizade', 'friendship'],
  amadurecimento: ['coming of age', 'adolescencia', 'adolescence'],
  viagemTemporal: ['viagem no tempo', 'time travel', 'time loop', 'paradoxo temporal'],
  realidadeVirtual: ['realidade virtual', 'virtual reality'],
  inteligenciaArtificial: ['inteligencia artificial', 'artificial intelligence'],
  distopia: ['distopia', 'dystopia', 'dystopian'],
};

/** Concepts from the actual synopsis, not a genre's automatically added tags. */
export function descriptiveTags(film: EvidenceFilm): string[] {
  const cached = descriptiveCache.get(film); if (cached) return cached;
  const text = foldWords(film.pitch ?? '');
  const tags = [...specificKeywords(film), ...Object.entries(CONCEPTS).filter(([, aliases]) => aliases.some((term) => containsPhrase(text, term))).map(([concept]) => `conceito:${concept}`)];
  descriptiveCache.set(film, tags); return tags;
}
