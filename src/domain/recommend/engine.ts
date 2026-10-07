import type { Catalog } from '../catalog/catalog.ts';
import type { CatalogFilm, DiscoveryMode, FilmIdentity, Filters, RecommendationResult, UserProfile } from '../film.ts';
import { analyzeProfile } from '../profile/analyze.ts';
import { createFilmIdentityIndex } from '../profile/identity.ts';
import { catalogIdentity, createWatchedIndex, toWatchedEntry } from '../profile/watched.ts';
import { createTasteMatcher } from '../taste/taste-match.ts';
import { containsPhrase, fold, foldWords } from '../text.ts';
import { getThemeById, getThemeCriteria } from '../themes/themes.ts';
import { passesConstraints } from './filters.ts';
import { fuzzyMatchInText, isSpecificKeyword, parseSearchQuery, passesQuery, type SearchQuery } from './query.ts';
import { toRecommendation } from './recommendation.ts';
import { matchesThemePacing, themeEligibility } from './theme-eligibility.ts';

export const MAX_RECOMMENDATIONS = 6;

export interface RecommendationRequest {
  profile: UserProfile | null;
  themeId?: string | null;
  customPrompt?: string;
  filters?: Filters;
  mode?: DiscoveryMode;
  excludedFilms?: readonly FilmIdentity[];
}

type FallbackMode = 'recent' | 'expanded' | 'expanded-recent' | null;

interface Ranked {
  film: CatalogFilm;
  keys: number[];
}

const FALLBACK_COMMENTS: Record<Exclude<FallbackMode, null>, string> = {
  recent: 'Não havia opções inéditas nesse recorte; incluí sugestões anteriores que você ainda não marcou como assistidas.',
  expanded: 'Seu histórico esgotou o recorte estrito; ampliei a seleção preservando os gêneros e exclusões deste clima.',
  'expanded-recent':
    'Seu histórico esgotou o recorte estrito; ampliei a seleção e incluí sugestões anteriores que você ainda não marcou como assistidas.',
};

const EMPTY_NOTICE = 'Nenhum filme novo encontrado: você já assistiu às opções compatíveis com este clima e seus filtros atuais.';

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
  const mode = request.mode ?? 'familiar';
  const blocked = createFilmIdentityIndex(request.excludedFilms ?? []);

  const analyzed = analyzeProfile(profile, catalog, now);
  const matchTaste = createTasteMatcher(profile ?? {}, catalog);
  const watched = createWatchedIndex(analyzed.watchedList);
  // Earlier recommendations are compared by slug and title only.
  const recent = createWatchedIndex(
    (filters.excludeRecent ?? []).filter((item) => item?.title).map((item) => ({ ...toWatchedEntry(item), catalogSlug: '' })),
  );
  const query = parseSearchQuery(prompt);

  const passesFilters = (film: CatalogFilm, { allowRecent = false } = {}): boolean => {
    const identity = catalogIdentity(film);
    if (blocked.has(identity)) return false;
    if (filters.avoidWatched !== false && watched.has(identity)) return false;
    // Keep thematic browsing varied, but never hide an unwatched film from an
    // explicit search merely because it appeared in an earlier recommendation.
    if (!allowRecent && !query.clean && recent.has(identity)) return false;
    if (!passesConstraints(film, filters)) return false;
    if (filters.nicheOnly && film.imdbVotes > 150000) return false;
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
    const rating = ((film.imdbRating || 0) * votes + 6.8 * 1000) / (votes + 1000);
    return Math.max(0, (rating - 6) * 4) + (filters.includeUnderrated && votes > 0 && votes < 50000 && rating >= 7 ? 2 : 0);
  };
  const affinityBonus = (film: CatalogFilm): number => {
    const taste = matchTaste(film);
    return taste.score * (mode === 'familiar' ? 0.7 : mode === 'explore' ? 0.5 : 0.18) +
      (mode !== 'familiar' && taste.hasPreferences && !taste.sameDirector ? 8 : 0);
  };

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
    let expandedCandidates: { film: CatalogFilm; signalCount: number }[] | null = null;
    const expanded = (): { film: CatalogFilm; signalCount: number }[] => (expandedCandidates ??= strict > 0 ? eligible(0) : strictCandidates);
    const collect = (candidates: readonly { film: CatalogFilm; signalCount: number }[], { allowRecent = false } = {}): Ranked[] =>
      candidates.flatMap(({ film, signalCount }) => {
        if (!passesFilters(film, { allowRecent })) return [];
        const semantic = Math.min(2, signalCount) * 6;
        return [{ film, keys: [semantic + affinityBonus(film) + qualityBonus(film), signalCount, film.imdbRating || 0] }];
      });
    // Reusing an unwatched earlier suggestion beats an empty theme; after
    // that, broaden the descriptive signal but keep the genre contract.
    ranked = collect(strictCandidates);
    if (ranked.length === 0) {
      ranked = collect(strictCandidates, { allowRecent: true });
      if (ranked.length > 0) fallback = 'recent';
    }
    if (ranked.length === 0 && strict > 0) {
      ranked = collect(expanded());
      if (ranked.length > 0) fallback = 'expanded';
    }
    if (ranked.length === 0 && strict > 0) {
      ranked = collect(expanded(), { allowRecent: true });
      if (ranked.length > 0) fallback = 'expanded-recent';
    }
    ranked.sort(byKeys);
  } else {
    ranked = catalog.films.flatMap((film) => {
      if (!passesFilters(film)) return [];
      const personal = matchTaste(film);
      if (mode === 'familiar' && personal.hasPreferences && !personal.eligible) return [];
      return [{ film, keys: [affinityBonus(film) + qualityBonus(film), film.imdbRating || 0] }];
    });
    ranked.sort(byKeys);
  }

  const recommendations = selectDiverse(ranked, MAX_RECOMMENDATIONS).map(({ film }) => {
    const taste = matchTaste(film);
    return toRecommendation(film, catalog, taste.eligible ? taste.reason : null);
  });
  const mapped = analyzed.totalLoggedFilms || analyzed.totalAnalyzed;
  const fallbackComment = fallback ? FALLBACK_COMMENTS[fallback] : '';
  return {
    themeName: query.clean ? `Busca: "${prompt}"` : (getThemeById(themeId)?.title ?? 'Recomendação especial'),
    curatorComment:
      recommendations.length > 0
        ? `Recomendações geradas a partir do seu DNA no Letterboxd${mapped > 0 ? ` (${mapped} filmes mapeados)` : ''}${filters.avoidWatched !== false ? ', excluindo os assistidos identificados no perfil' : ''}. ${fallbackComment}`.trim()
        : EMPTY_NOTICE,
    notice: recommendations.length === 0 ? EMPTY_NOTICE : fallbackComment,
    recommendations,
    allowRecentFallback: fallback === 'recent' || fallback === 'expanded-recent',
    interpretation: query.interpretation,
  };
}

/** Prefer at most two films from one director when the pool offers alternatives. */
function selectDiverse(ranked: Ranked[], limit: number): Ranked[] {
  const selected: Ranked[] = [];
  const deferred: Ranked[] = [];
  const directors = new Map<string, number>();
  for (const candidate of ranked) {
    const director = fold(candidate.film.director);
    if (director && (directors.get(director) ?? 0) >= 2) { deferred.push(candidate); continue; }
    selected.push(candidate);
    directors.set(director, (directors.get(director) ?? 0) + 1);
    if (selected.length === limit) return selected;
  }
  return [...selected, ...deferred].slice(0, limit);
}

interface Scorers {
  passesFilters: (film: CatalogFilm) => boolean;
  qualityBonus: (film: CatalogFilm) => number;
  affinityBonus: (film: CatalogFilm) => number;
  themeId: string | null;
}

/** Relevance of each field: a title hit is exactly what the user searched for. */
const WEIGHTS = { genre: 55, phrase: 60, title: 40, director: 28, genreToken: 20, keyword: 16, pitch: 12, country: 10 };

function rankSearch(catalog: Catalog, query: SearchQuery, scorers: Scorers): Ranked[] {
  const { lexicalTokens, franchiseAliases } = query;
  // At least 70% of the tokens must match; a single token always must.
  const minTokens = lexicalTokens.length === 1 ? 1 : Math.ceil(lexicalTokens.length * 0.7);
  const ranked: Ranked[] = [];
  const requiredGenre = query.genres.values().next().value;
  const candidates = requiredGenre ? catalog.filmsWithAnyGenre([requiredGenre]) : catalog.films;

  for (const film of candidates) {
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
