import type { Catalog } from '../catalog/catalog.ts';
import type { CatalogFilm, FilmIdentity, Filters, RecommendationResult, UserProfile } from '../film.ts';
import { analyzeProfile } from '../profile/analyze.ts';
import { createFilmIdentityIndex } from '../profile/identity.ts';
import { catalogIdentity, createWatchedIndex, toWatchedEntry } from '../profile/watched.ts';
import { createTasteMatcher } from '../taste/taste-match.ts';
import { containsPhrase, fold, foldWords, WORD_SEPARATORS } from '../text.ts';
import { getThemeById, getThemeCriteria } from '../themes/themes.ts';
import { constraintConflict, passesConstraints } from './filters.ts';
import { fuzzyMatchInText, isSpecificKeyword, parseSearchQuery, passesQuery, type SearchQuery, wordMatchesToken } from './query.ts';
import { toRecommendation } from './recommendation.ts';
import { matchesThemePacing, relatedThemeEligibility, themeEligibility } from './theme-eligibility.ts';

export const MAX_RECOMMENDATIONS = 6;

export interface RecommendationRequest {
  profile: UserProfile | null;
  themeId?: string | null;
  customPrompt?: string;
  filters?: Filters;
  excludedFilms?: readonly FilmIdentity[];
  /** "Não combina comigo": excluded, and also negative taste signals. */
  rejectedFilms?: readonly FilmIdentity[];
  /**
   * Varies theme and general results between requests among candidates of
   * similar rank. Searches stay strictly ordered by relevance.
   */
  seed?: string;
}

/** Tunable weights of the ranking, kept together for diagnostics and A/B runs. */
export const SCORING = {
  /** Bayesian prior: unreliable ratings shrink toward this score... */
  ratingPrior: 6.8,
  /** ...as if it had this many extra votes. */
  priorVotes: 1000,
  qualityFloor: 6,
  qualityScale: 4,
  underratedBonus: 2,
  underratedMaxVotes: 50_000,
  underratedMinRating: 7,
  nicheMaxVotes: 150_000,
  affinityWeight: 0.7,
  /** Theme signals beyond this count do not add more relevance. */
  themeSignalCap: 2,
  themeSignalWeight: 6,
  maxPerDirector: 2,
  maxPerDecade: 3,
  /** Seeded exploration may move a candidate up by at most this many positions. */
  explorationSpread: 4,
} as const;

type FallbackMode = 'recent' | null;

interface Ranked {
  film: CatalogFilm;
  keys: number[];
  themeFit?: 'related';
}

const FALLBACK_COMMENTS: Record<Exclude<FallbackMode, null>, string> = {
  recent: 'Não havia opções inéditas nesse recorte; incluí sugestões anteriores que você ainda não marcou como assistidas.',
};

const EMPTY_NOTICE = 'Não encontrei opções com evidência suficiente para este pedido e seus filtros. Tente outro clima ou ajuste um filtro.';

const byKeys = (a: Ranked, b: Ranked): number => {
  for (let i = 0; i < a.keys.length; i++) {
    const difference = b.keys[i] - a.keys[i];
    if (difference) return difference;
  }
  return 0;
};

/**
 * Recommends unwatched catalog films for a free-text search, a theme, or
 * (with neither) the user's general taste.
 */
export function recommend(request: RecommendationRequest, catalog: Catalog, now: Date): RecommendationResult {
  const filters = request.filters ?? {};
  const prompt = request.customPrompt ?? '';
  const themeId = request.themeId ?? null;
  const criteria = getThemeCriteria(themeId);
  const profile = request.profile;
  const query = parseSearchQuery(prompt);
  const conflict = query.issues[0] ?? constraintConflict(filters, query.constraints);
  if (conflict) return {
    themeName: query.clean ? `Busca: "${prompt}"` : (getThemeById(themeId)?.title ?? 'Recomendação especial'),
    curatorComment: conflict, notice: conflict, recommendations: [], allowRecentFallback: false, interpretation: query.interpretation,
  };
  const blocked = createFilmIdentityIndex([...(request.excludedFilms ?? []), ...(request.rejectedFilms ?? [])]);

  const analyzed = analyzeProfile(profile, catalog, now);
  const matchTaste = createTasteMatcher(profile ?? {}, catalog, { rejected: request.rejectedFilms });
  const watched = createWatchedIndex(analyzed.watchedList);
  // Earlier recommendations are compared by slug and title only.
  const recent = createWatchedIndex(
    (filters.excludeRecent ?? []).filter((item) => item?.title).map((item) => ({ ...toWatchedEntry(item), catalogSlug: '' })),
  );

  const passesFilters = (film: CatalogFilm, { allowRecent = false } = {}): boolean => {
    const identity = catalogIdentity(film);
    if (blocked.has(identity)) return false;
    if (filters.avoidWatched !== false && watched.has(identity)) return false;
    // Keep thematic browsing varied, but never hide an unwatched film from an
    // explicit search merely because it appeared in an earlier recommendation.
    if (!allowRecent && !query.clean && recent.has(identity)) return false;
    if (!passesConstraints(film, filters)) return false;
    if (filters.nicheOnly && film.imdbVotes > SCORING.nicheMaxVotes) return false;
    if (filters.minVotes && (film.imdbVotes || 0) < Number(filters.minVotes)) return false;
    // A literal title match cannot override an explicit genre request
    // ("terror" must not return political terrorism dramas).
    if (!passesQuery(film, query)) return false;
    return true;
  };

  const qualityBonus = (film: CatalogFilm): number => {
    const votes = film.imdbVotes || 0;
    // Shrink unreliable ratings toward a conservative prior instead of allowing
    // a handful of votes to outrank established films on raw IMDb score.
    const rating = ((film.imdbRating || 0) * votes + SCORING.ratingPrior * SCORING.priorVotes) / (votes + SCORING.priorVotes);
    const underrated = filters.includeUnderrated && votes > 0 && votes < SCORING.underratedMaxVotes && rating >= SCORING.underratedMinRating;
    return Math.max(0, (rating - SCORING.qualityFloor) * SCORING.qualityScale) + (underrated ? SCORING.underratedBonus : 0);
  };
  const affinityBonus = (film: CatalogFilm): number => matchTaste(film).score * SCORING.affinityWeight;

  let ranked: Ranked[];
  let fallback: FallbackMode = null;
  if (query.tokens.length > 0) {
    ranked = rankSearch(catalog, query, { passesFilters, qualityBonus, affinityBonus, themeId });
  } else if (themeId) {
    const strict = criteria?.minSignals ?? 0;
    const themePool = catalog.filmsWithAnyGenre(criteria?.requiredAnyGenres ?? []);
    const eligible = (minSignals: number): { film: CatalogFilm; signalCount: number }[] =>
      themePool.flatMap((film) => {
        if (!matchesThemePacing(film, themeId)) return [];
        const eligibility = themeEligibility(film, criteria, minSignals);
        return eligibility.eligible ? [{ film, signalCount: eligibility.signalCount }] : [];
      });
    const strictCandidates = eligible(strict);
    const collect = (candidates: readonly { film: CatalogFilm; signalCount: number }[], { allowRecent = false, related = false } = {}): Ranked[] =>
      candidates.flatMap(({ film, signalCount }) => {
        if (!passesFilters(film, { allowRecent })) return [];
        const semantic = Math.min(SCORING.themeSignalCap, signalCount) * SCORING.themeSignalWeight;
        return [{ film, ...(related ? { themeFit: 'related' as const } : {}), keys: [semantic + affinityBonus(film) + qualityBonus(film), signalCount, film.imdbRating || 0] }];
      });
    // Reuse a compatible earlier suggestion, but never weaken the theme promise.
    ranked = collect(strictCandidates);
    if (ranked.length === 0) {
      ranked = collect(strictCandidates, { allowRecent: true });
      if (ranked.length > 0) fallback = 'recent';
    }
    ranked.sort(byKeys);
    if (ranked.length < MAX_RECOMMENDATIONS) {
      const exactIds = new Set(strictCandidates.map(candidate => candidate.film.slug));
      const related = themePool.flatMap(film => {
        if (exactIds.has(film.slug) || !matchesThemePacing(film, themeId)) return [];
        const evidence = relatedThemeEligibility(film, criteria);
        return evidence.eligible ? [{ film, signalCount: evidence.signalCount }] : [];
      });
      let nearby = collect(related, { related: true }).sort(byKeys);
      if (!ranked.length && !nearby.length) {
        nearby = collect(related, { related: true, allowRecent: true }).sort(byKeys);
        if (nearby.length) fallback = 'recent';
      }
      ranked.push(...nearby);
    }
  } else {
    const general = (allowRecent = false): Ranked[] => catalog.films.flatMap((film) => {
      if (!passesFilters(film, { allowRecent })) return [];
      const personal = matchTaste(film);
      return [{ film, keys: [personal.eligible ? 1 : 0, affinityBonus(film) + qualityBonus(film), film.imdbRating || 0] }];
    });
    ranked = general();
    if (!ranked.length) {
      ranked = general(true);
      if (ranked.length) fallback = 'recent';
    }
    ranked.sort(byKeys);
  }

  const prioritizeAffinity = !query.tokens.length && !themeId;
  const preferred = ranked.filter(candidate => prioritizeAffinity ? matchTaste(candidate.film).eligible : !candidate.themeFit);
  const preferredIds = new Set(preferred.map(candidate => candidate.film.slug));
  // Explicit searches keep their relevance order; browsing may vary.
  const explore = (candidates: Ranked[]): Ranked[] =>
    request.seed && !query.tokens.length ? exploreOrder(candidates, `${request.seed}|${themeId ?? ''}`) : candidates;
  // Searches are ranked by relevance; only browsing spreads across decades.
  const variety = { varyDecades: !query.tokens.length };
  const selected = selectDiverse(explore(preferred), MAX_RECOMMENDATIONS, [], variety);
  selected.push(...selectDiverse(explore(ranked.filter(candidate => !preferredIds.has(candidate.film.slug))), MAX_RECOMMENDATIONS - selected.length, selected, variety));
  const recommendations = selected.map(({ film, themeFit }) => {
    const taste = matchTaste(film);
    return { ...toRecommendation(film, catalog, taste.eligible ? taste.reason : null), ...(themeFit ? { themeFit } : {}) };
  });
  const mapped = analyzed.totalLoggedFilms || analyzed.totalAnalyzed;
  const nearbyCount = recommendations.filter(film => film.themeFit === 'related').length;
  const nearbyComment = nearbyCount ? `${nearbyCount} ${nearbyCount === 1 ? 'sugestão próxima' : 'sugestões próximas'} ao clima, com contexto compatível e sem confirmação de todos os detalhes de estilo.` : '';
  const fallbackComment = [fallback ? FALLBACK_COMMENTS[fallback] : '', nearbyComment].filter(Boolean).join(' ');
  return {
    themeName: query.clean ? `Busca: "${prompt}"` : (getThemeById(themeId)?.title ?? 'Recomendação especial'),
    curatorComment:
      recommendations.length > 0
        ? `Recomendações geradas a partir do seu DNA no Letterboxd${mapped > 0 ? ` (${mapped} filmes mapeados)` : ''}${filters.avoidWatched !== false ? ', excluindo os assistidos identificados no perfil' : ''}. ${fallbackComment}`.trim()
        : EMPTY_NOTICE,
    notice: recommendations.length === 0 ? EMPTY_NOTICE : fallbackComment,
    recommendations,
    allowRecentFallback: fallback === 'recent',
    interpretation: query.interpretation,
  };
}

/**
 * Deterministic for a seed: each candidate may rise at most
 * `explorationSpread` positions, so a weak film never leapfrogs the top.
 */
function exploreOrder(ranked: readonly Ranked[], seed: string): Ranked[] {
  const random = seededRandom(seed);
  return ranked
    .map((candidate, index) => ({ candidate, position: index - random() * SCORING.explorationSpread }))
    .sort((a, b) => a.position - b.position)
    .map(({ candidate }) => candidate);
}

/** Mulberry32 over a string hash: small, fast and stable across platforms. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (Math.imul(31, state) + seed.charCodeAt(i)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const decadeOf = (film: CatalogFilm): string => (film.year ? String(Math.floor(film.year / 10)) : '');

/**
 * Prefer at most two films from one director and three from one decade when
 * the pool offers alternatives. Limits relax in order: decade first, then
 * director, so a narrow pool still fills the list.
 */
function selectDiverse(ranked: Ranked[], limit: number, preceding: readonly Ranked[] = [], { varyDecades = true } = {}): Ranked[] {
  if (limit <= 0) return [];
  const selected: Ranked[] = [];
  const taken = new Set<Ranked>();
  const directors = new Map<string, number>();
  const decades = new Map<string, number>();
  const count = (film: CatalogFilm): void => {
    const director = fold(film.director);
    directors.set(director, (directors.get(director) ?? 0) + 1);
    const decade = decadeOf(film);
    decades.set(decade, (decades.get(decade) ?? 0) + 1);
  };
  for (const candidate of preceding) count(candidate.film);
  for (const { perDirector, perDecade } of [
    { perDirector: SCORING.maxPerDirector, perDecade: varyDecades ? SCORING.maxPerDecade : Infinity },
    { perDirector: SCORING.maxPerDirector, perDecade: Infinity },
    { perDirector: Infinity, perDecade: Infinity },
  ]) {
    for (const candidate of ranked) {
      if (taken.has(candidate)) continue;
      const director = fold(candidate.film.director);
      const decade = decadeOf(candidate.film);
      if (director && (directors.get(director) ?? 0) >= perDirector) continue;
      if (decade && (decades.get(decade) ?? 0) >= perDecade) continue;
      selected.push(candidate);
      taken.add(candidate);
      count(candidate.film);
      if (selected.length === limit) return selected;
    }
  }
  return selected;
}

interface Scorers {
  passesFilters: (film: CatalogFilm) => boolean;
  qualityBonus: (film: CatalogFilm) => number;
  affinityBonus: (film: CatalogFilm) => number;
  themeId: string | null;
}

/** Relevance of each field: a title hit is exactly what the user searched for. */
const WEIGHTS = { genre: 55, phrase: 60, title: 40, director: 28, genreToken: 20, keyword: 16, pitch: 12, country: 10 };

const tokenMatches = new WeakMap<Catalog, Map<string, ReadonlySet<CatalogFilm>>>();

/** Films whose searchable words can match the token, memoized per catalog. */
function filmsMatchingToken(catalog: Catalog, token: string): ReadonlySet<CatalogFilm> {
  let cache = tokenMatches.get(catalog);
  if (!cache) {
    cache = new Map();
    tokenMatches.set(catalog, cache);
  }
  let films = cache.get(token);
  if (films) return films;
  const found = new Set<CatalogFilm>();
  for (const [word, holders] of catalog.searchVocabulary()) {
    if (wordMatchesToken(token, word)) for (const film of holders) found.add(film);
  }
  films = found;
  cache.set(token, films);
  return films;
}

/**
 * Films that can score for at least one lexical token, or null when every
 * film must be scored: no lexical tokens, or franchise aliases matched by
 * phrase. A superset is enough; the full scoring still decides.
 */
function lexicalCandidates(catalog: Catalog, query: SearchQuery): ReadonlySet<CatalogFilm> | null {
  if (!query.lexicalTokens.length || query.franchiseAliases.length) return null;
  if (query.lexicalTokens.some((token) => WORD_SEPARATORS.test(token))) return null;
  if (query.lexicalTokens.length === 1) return filmsMatchingToken(catalog, query.lexicalTokens[0]);
  const union = new Set<CatalogFilm>();
  for (const token of query.lexicalTokens) for (const film of filmsMatchingToken(catalog, token)) union.add(film);
  return union;
}

function rankSearch(catalog: Catalog, query: SearchQuery, scorers: Scorers): Ranked[] {
  const { lexicalTokens, franchiseAliases } = query;
  // At least 70% of the tokens must match; a single token always must.
  const minTokens = lexicalTokens.length === 1 ? 1 : Math.ceil(lexicalTokens.length * 0.7);
  const ranked: Ranked[] = [];
  const requiredGenre = query.genres.values().next().value;
  const candidates = requiredGenre ? catalog.filmsWithAnyGenre([requiredGenre]) : catalog.films;
  const lexical = lexicalCandidates(catalog, query);

  for (const film of candidates) {
    if (lexical && !lexical.has(film)) continue;
    if (!scorers.passesFilters(film) || !matchesThemePacing(film, scorers.themeId)) continue;
    const searchDoc = catalog.searchDocument(film);
    const { title, originalTitle, director, country, pitch, genres, searchable } = searchDoc;
    const franchiseTitle = franchiseAliases.some((alias) => containsPhrase(title, alias) || containsPhrase(originalTitle, alias));
    const keywords = searchDoc.keywords.filter(isSpecificKeyword).join(' ');

    let relevance = lexicalTokens.length === 0 ? 1 : 0;
    let tokensMatched = 0;
    let titleMatches = 0;
    for (const genre of query.genres) if (fuzzyMatchInText(genre, genres)) relevance += WEIGHTS.genre;
    for (const genre of query.preferredGenres) if (film.genres.some((value) => fold(value) === genre)) relevance += 14;
    if (query.clean.length >= 4 && title.includes(query.clean)) relevance += WEIGHTS.phrase;

    for (const token of lexicalTokens) {
      let score = 0;
      if (!franchiseAliases.length && (fuzzyMatchInText(token, title) || fuzzyMatchInText(token, originalTitle))) {
        score += WEIGHTS.title;
        titleMatches++;
      }
      if (fuzzyMatchInText(token, director)) score += WEIGHTS.director;
      if (fuzzyMatchInText(token, genres)) score += WEIGHTS.genreToken;
      if (fuzzyMatchInText(token, keywords)) score += WEIGHTS.keyword;
      if (pitch.length > 50 && fuzzyMatchInText(token, pitch)) score += WEIGHTS.pitch;
      if (fuzzyMatchInText(token, country)) score += WEIGHTS.country;
      // Franchise searches need semantic coverage beyond a literal keyword.
      if (token === query.clean && franchiseAliases.some((alias) => containsPhrase(searchable, alias))) {
        score += franchiseTitle ? 80 : 36;
        if (franchiseTitle) titleMatches++;
      }
      if (score > 0) {
        relevance += score;
        tokensMatched++;
      }
    }

    if (tokensMatched < minTokens || relevance <= 0) continue;
    if (tokensMatched === lexicalTokens.length && lexicalTokens.length > 1) relevance += 25;
    relevance += scorers.qualityBonus(film) + scorers.affinityBonus(film);
    const exact = [title, originalTitle].some((value) => foldWords(value) === foldWords(query.clean));
    ranked.push({ film, keys: [exact ? 1 : 0, relevance, titleMatches, film.imdbRating || 0] });
  }
  return ranked.sort(byKeys);
}
