/** Curated cinematic atmospheres the user can browse. */

export interface ThemeCategory {
  id: string;
  label: string;
}

/** Hard eligibility contract of a theme, evaluated on catalog metadata. */
export interface ThemeCriteria {
  requiredAnyGenres?: string[];
  excludedAnyGenres?: string[];
  minSignals: number;
  signals: string[];
  excludedSignals?: string[];
  minYear?: number;
  maxImdbVotes?: number;
  minImdbRating?: number;
}

export interface Theme {
  id: string;
  category: string;
  title: string;
  /** Fits a chip: the popup lists every theme at once. */
  shortTitle: string;
  icon: string;
  vibe: string;
  keywords: string[];
}

export const THEME_CATEGORIES: readonly ThemeCategory[] = [
  { id: 'all', label: 'Todos os Temas' },
  { id: 'atmosphere', label: 'Atmosfera & Visual' },
  { id: 'mindfuck', label: 'Mindfuck & Mistério' },
  { id: 'melancholy', label: 'Melancolia & Drama' },
  { id: 'scifi', label: 'Sci-Fi & Cyberpunk' },
  { id: 'thriller', label: 'Tensão & Paranoia' },
  { id: 'cult', label: 'Cult & Joias Ocultas' },
  { id: 'comfort', label: 'Comfort & Poético' }
];

// Curated eligibility contracts. Generated `film.themes` labels can help rank
// candidates, but must never bypass these hard cinematic constraints.
export const THEME_CRITERIA: Readonly<Record<string, ThemeCriteria>> = Object.freeze({
  'cyberpunk-neon-noir': {
    requiredAnyGenres: ['Sci-Fi'], excludedAnyGenres: ['Adventure', 'Fantasy'], minSignals: 1,
    signals: ['cyberpunk', 'neo-noir', 'neo noir', 'dystopia', 'distopia', 'neon', 'android', 'robot', 'replicant', 'virtual reality', 'realidade virtual', 'hacker', 'inteligencia artificial', 'megacity']
  },
  'slow-cinema-contemplative': {
    requiredAnyGenres: ['Drama'], excludedAnyGenres: ['Action', 'Adventure', 'Fantasy', 'War', 'Sport'], minSignals: 1,
    signals: ['slow cinema', 'contemplative', 'contemplativo', 'long take', 'plano longo', 'solitude', 'solidao', 'meditative', 'meditativo', 'rural', 'cotidiano', 'intimista']
  },
  'mindfuck-broken-reality': {
    requiredAnyGenres: ['Thriller', 'Mystery', 'Sci-Fi'], minSignals: 1,
    excludedSignals: ['superhero', 'super-heroi', 'super heroi', 'batman', 'marvel', 'dc comics'],
    signals: ['mindfuck', 'non-linear', 'nao linear', 'surreal', 'alternate reality', 'realidade alternativa', 'memory loss', 'perda de memoria', 'dream', 'sonho', 'unreliable narrator', 'narrador nao confiavel', 'hallucination', 'alucinacao', 'dissociation', 'dissociacao', 'time loop', 'paradox', 'paradoxo']
  },
  'existential-urban-melancholy': {
    requiredAnyGenres: ['Drama', 'Romance'], excludedAnyGenres: ['Adventure', 'Fantasy', 'War'], minSignals: 1,
    signals: ['urban alienation', 'alienacao urbana', 'metropole', 'loneliness', 'solidao', 'isolation', 'isolamento', 'wanderer', 'vagando', 'madrugada', 'nocturnal', 'nocturno']
  },
  'cozy-bittersweet-coming-of-age': {
    requiredAnyGenres: ['Drama', 'Comedy', 'Romance', 'Animation'], excludedAnyGenres: ['Action', 'War', 'Crime', 'Horror'], minSignals: 1,
    signals: ['coming of age', 'youth', 'juventude', 'adolescent', 'teen', 'school', 'escola', 'friendship', 'amizade', 'childhood', 'infancia', 'summer', 'verao']
  },
  'psychological-slow-burn-horror': {
    requiredAnyGenres: ['Horror'], excludedAnyGenres: ['Action', 'Adventure'], minSignals: 1,
    excludedSignals: ['slasher', 'zombie', 'zumbi', 'monster', 'monstro', 'grindhouse', 'gore'],
    signals: ['slow-burn', 'slow burn', 'paranoia', 'gothic', 'gotico', 'supernatural', 'sobrenatural', 'folk horror', 'dread', 'occult', 'oculto', 'atmospheric', 'atmosferico']
  },
  'hidden-gems-underrated': {
    excludedAnyGenres: ['Documentary'], maxImdbVotes: 50000, minImdbRating: 7.1, minSignals: 0,
    signals: ['underrated', 'hidden gem', 'independent', 'independente', 'cult', 'underseen']
  },
  'acid-satire-dark-comedy': {
    requiredAnyGenres: ['Comedy'], minSignals: 1,
    signals: ['satire', 'satira', 'dark comedy', 'humor negro', 'social critique', 'critica social', 'cynical', 'cinico', 'absurd', 'class struggle', 'sociedade']
  },
  'philosophical-hard-scifi': {
    requiredAnyGenres: ['Sci-Fi'], excludedAnyGenres: ['Animation', 'Adventure', 'Fantasy', 'Action', 'Comedy'], minSignals: 1,
    excludedSignals: ['superhero', 'super-heroi', 'super heroi', 'justice league', 'batman', 'superman', 'marvel'],
    signals: ['philosophical', 'filosofico', 'cosmic', 'cosmos', 'artificial intelligence', 'inteligencia artificial', 'language', 'linguagem', 'time paradox', 'paradoxo temporal', 'alien', 'extraterrestre', 'scientific', 'cientifico']
  },
  'paranoia-70s-conspiracy-thriller': {
    requiredAnyGenres: ['Thriller', 'Mystery', 'Crime'], minSignals: 1,
    signals: ['paranoia', 'conspiracy', 'conspiracao', 'surveillance', 'vigilancia', 'political', 'politico', 'investigation', 'investigacao', 'government', 'governo', 'espionage', 'espionagem', 'wiretap', 'escuta']
  },
  'dreamlike-magical-realism': {
    requiredAnyGenres: ['Fantasy', 'Drama', 'Romance'], excludedAnyGenres: ['Action', 'Adventure', 'Sci-Fi', 'Horror'], minSignals: 1,
    signals: ['magical realism', 'realismo magico', 'dreamlike', 'dream', 'sonho', 'surreal', 'oniric', 'ethereal', 'fantasy', 'fantasia', 'poetic', 'poetico']
  },
  'claustrophobic-single-location': {
    requiredAnyGenres: ['Thriller', 'Horror', 'Drama', 'Mystery'], excludedAnyGenres: ['Romance'], minSignals: 1,
    signals: ['single location', 'one location', 'claustrophobia', 'claustrofobia', 'confined', 'confinado', 'locked', 'trapped', 'bunker', 'prison', 'prisao', 'elevator', 'elevador']
  },
  'poetic-romance-fleeting-encounters': {
    requiredAnyGenres: ['Romance'], excludedAnyGenres: ['Action', 'Adventure', 'Crime', 'War', 'Western'], minSignals: 1,
    signals: ['fleeting', 'brief encounter', 'one night', 'despedida', 'longing', 'yearning', 'unrequited', 'desencontro', 'encounter', 'encontro', 'conversation', 'viagem']
  },
  'gritty-90s-crime-neo-realism': {
    requiredAnyGenres: ['Crime'], excludedAnyGenres: ['Fantasy', 'Adventure', 'Action', 'Comedy', 'Sport'], minYear: 1980, minSignals: 1,
    signals: ['gritty', 'raw', 'urban', 'gang', 'gangue', 'marginal', 'slum', 'favela', 'hood', 'survival', 'sobrevivencia']
  },
  'whimsical-cozy-comfort': {
    requiredAnyGenres: ['Comedy', 'Animation', 'Family', 'Romance', 'Drama'], excludedAnyGenres: ['Action', 'Crime', 'War', 'Horror', 'Thriller'], minSignals: 1,
    signals: ['cozy', 'comfort', 'heartwarming', 'feel-good', 'family', 'familia', 'friendship', 'amizade', 'food', 'comida', 'cooking', 'cozinha', 'kindness', 'gentileza']
  }
});

export const THEMES_CATALOG: readonly Theme[] = [
  {
    id: 'cyberpunk-neon-noir',
    category: 'scifi',
    title: 'Cyberpunk & Neo-Noir Chuvoso',
    shortTitle: 'Cyberpunk',
    icon: '🌧️',
    vibe: 'Cidades distópicas noturnas, chuva infinita, reflexos de neon, solidão existencial e sintetizadores analógicos.',
    keywords: ['cyberpunk', 'neo-noir', 'dystopia', 'synthwave', 'existentialism', 'urban loneliness']
  },
  {
    id: 'slow-cinema-contemplative',
    category: 'atmosphere',
    title: 'Cinema Lento & Contemplativo',
    shortTitle: 'Cinema lento',
    icon: '🌾',
    vibe: 'Planos longos e hipnóticos, silêncios que dizem tudo, beleza bucólica ou melancólica, tempo dilatado.',
    keywords: ['slow cinema', 'contemplative', 'poetic', 'long takes', 'spiritual cinema', 'atmospheric']
  },
  {
    id: 'mindfuck-broken-reality',
    category: 'mindfuck',
    title: 'Mindfuck & Realidades Fragmentadas',
    shortTitle: 'Realidade fragmentada',
    icon: '🌀',
    vibe: 'Narrativas não lineares, quebra de percepção, labirintos psicológicos, desfechos que viram a cabeça.',
    keywords: ['mindfuck', 'psychological puzzle', 'non-linear', 'surrealism', 'existential thriller']
  },
  {
    id: 'existential-urban-melancholy',
    category: 'melancholy',
    title: 'Melancolia Urbana Noturna',
    shortTitle: 'Melancolia urbana',
    icon: '🌃',
    vibe: 'Personagens vagando por metrópoles na madrugada, conexões efêmeras, desencontros e isolamento humano.',
    keywords: ['urban alienation', 'night wanderers', 'wong kar-wai vibe', 'loneliness', 'nocturnal']
  },
  {
    id: 'cozy-bittersweet-coming-of-age',
    category: 'melancholy',
    title: 'Coming-of-Age Agridoce & Nostálgico',
    shortTitle: 'Coming-of-age',
    icon: '📼',
    vibe: 'O fim da juventude, verões inesquecíveis, descobertas dolorosas e a passagem agridoce do tempo.',
    keywords: ['coming of age', 'nostalgia', 'youth', 'bittersweet', 'friendship', 'summer']
  },
  {
    id: 'psychological-slow-burn-horror',
    category: 'thriller',
    title: 'Terror Atmosférico & Slow-Burn',
    shortTitle: 'Terror lento',
    icon: '🕯️',
    vibe: 'Horror que se constrói no detalhe e na paranoia, sem sustos baratos, com dread psicológico opressor.',
    keywords: ['elevated horror', 'slow-burn', 'folk horror', 'dread', 'psychological terror', 'gothic']
  },
  {
    id: 'hidden-gems-underrated',
    category: 'cult',
    title: 'Joias Escondidas & Obscuras',
    shortTitle: 'Joias escondidas',
    icon: '💎',
    vibe: 'Obras-primas pouco faladas, tesouros internacionais fora do radar de Hollywood que merecem aclamação.',
    keywords: ['underrated', 'hidden gem', 'cult classic', 'independent cinema', 'underseen']
  },
  {
    id: 'acid-satire-dark-comedy',
    category: 'comfort',
    title: 'Sátira Social & Humor Ácido',
    shortTitle: 'Sátira ácida',
    icon: '🍸',
    vibe: 'Ironia cortante, crítica impiedosa à sociedade contemporânea, elegância cínica e riso desconfortável.',
    keywords: ['dark comedy', 'social satire', 'cynical', 'wit', 'absurdism', 'class struggle']
  },
  {
    id: 'philosophical-hard-scifi',
    category: 'scifi',
    title: 'Ficção Científica Filosófica',
    shortTitle: 'Sci-fi filosófica',
    icon: '🪐',
    vibe: 'Grandes dilemas existenciais sobre a humanidade, tempo, linguagem, inteligência artificial e o cosmos.',
    keywords: ['hard sci-fi', 'philosophical', 'space exploration', 'cosmic awe', 'time paradox']
  },
  {
    id: 'paranoia-70s-conspiracy-thriller',
    category: 'thriller',
    title: 'Thriller de Paranoia & Conspiração',
    shortTitle: 'Paranoia',
    icon: '📻',
    vibe: 'Estética analógica dos anos 70/80, escutas telefônicas, vigilância opressiva, ninguém é confiável.',
    keywords: ['paranoia', 'conspiracy', '70s cinema', 'surveillance', 'political thriller']
  },
  {
    id: 'dreamlike-magical-realism',
    category: 'atmosphere',
    title: 'Realismo Mágico & Onírico',
    shortTitle: 'Realismo mágico',
    icon: '✨',
    vibe: 'A fronteira entre o sonho e o mundo real desmorona em beleza poética, cores hipnotizantes e lirismo.',
    keywords: ['magical realism', 'dreamlike', 'ethereal', 'surreal fantasy', 'poetic vision']
  },
  {
    id: 'claustrophobic-single-location',
    category: 'thriller',
    title: 'Tensão Claustrofóbica (Um Único Cenário)',
    shortTitle: 'Um só cenário',
    icon: '🚪',
    vibe: 'Personagens confinados em um único espaço sob pressão extrema, revelando seus piores segredos.',
    keywords: ['single location', 'chamber drama', 'claustrophobia', 'tense dialogue', 'bottle movie']
  },
  {
    id: 'poetic-romance-fleeting-encounters',
    category: 'melancholy',
    title: 'Romance Efêmero & Desencontros',
    shortTitle: 'Desencontros',
    icon: '🥀',
    vibe: 'Amores intensos que duram poucas horas ou que nunca chegam a se concretizar por completo.',
    keywords: ['before trilogy vibe', 'fleeting love', 'long conversations', 'romantic yearning', 'melodrama']
  },
  {
    id: 'gritty-90s-crime-neo-realism',
    category: 'cult',
    title: 'Crime Urbano Cru & Cinema Marginal',
    shortTitle: 'Crime cru',
    icon: '🚬',
    vibe: 'Ruas impiedosas, realismo cru, personagens à margem da lei lutando pela sobrevivência imediata.',
    keywords: ['gritty crime', 'neo-realism', 'marginal cinema', 'street level', 'raw energy']
  },
  {
    id: 'whimsical-cozy-comfort',
    category: 'comfort',
    title: 'Comfort Cinema & Afeto Quentinho',
    shortTitle: 'Comfort cinema',
    icon: '☕',
    vibe: 'Filmes reconfortantes para dias difíceis, comédia suave, gastronomia acolhedora e gentileza humana.',
    keywords: ['cozy', 'comfort movie', 'heartwarming', 'feel-good', 'gentle humanism']
  }
];

export function getThemeById(themeId: string | null | undefined): Theme | null {
  return THEMES_CATALOG.find((theme) => theme.id === themeId) ?? null;
}

export function getThemeCriteria(themeId: string | null | undefined): ThemeCriteria | null {
  return (themeId && THEME_CRITERIA[themeId]) || null;
}

export function searchThemes(query: string): readonly Theme[] {
  const q = query.toLowerCase().trim();
  if (!q) return THEMES_CATALOG;
  return THEMES_CATALOG.filter(
    (theme) =>
      theme.title.toLowerCase().includes(q) ||
      theme.vibe.toLowerCase().includes(q) ||
      theme.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
  );
}
