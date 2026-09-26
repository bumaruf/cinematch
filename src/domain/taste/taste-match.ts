import type { Catalog } from '../catalog/catalog.ts';
import type { EnrichedFilm, UserProfile } from '../film.ts';
import { fold } from '../text.ts';

export interface TasteMatch {
  eligible: boolean;
  score: number;
  /** Why the film fits, in pt-BR, or '' when it does not. */
  reason: string;
  /** The profile has at least one liked film to compare against. */
  hasPreferences: boolean;
}

export type TasteMatcher = (film: TasteCandidate) => TasteMatch;

export interface TasteCandidate {
  title?: string;
  originalTitle?: string;
  director?: string;
  genres?: string[];
  keywords?: string[];
  country?: string;
}

interface Signal extends EnrichedFilm {
  tags: Set<string>;
}

// Broad tags, including generated genre synonyms, cannot establish a match.
const GENERIC_TAGS = new Set([
  'adrenalina',
  'combate',
  'explosao',
  'perseguicao',
  'criminal',
  'policial',
  'luta',
  'popular',
  'aclamado',
  'obra-prima',
  'masterpiece',
  'cult',
]);

/**
 * Builds a matcher that scores catalog films against the films the user
 * liked (4★+ or favorites) and penalizes those close to disliked ones (≤2★).
 */
export function createTasteMatcher(profile: Partial<UserProfile>, catalog: Catalog): TasteMatcher {
  const maxFrequency = catalog.films.length * 0.01;
  const tagsOf = (film: TasteCandidate): Set<string> => {
    const metadata = new Set([film.title, film.originalTitle, film.director, ...(film.genres ?? [])].map(fold));
    return new Set(
      (film.keywords ?? []).map(fold).filter((tag) => {
        const frequency = catalog.keywordFrequency(tag);
        return tag.length >= 5 && !metadata.has(tag) && !GENERIC_TAGS.has(tag) && !/\d/.test(tag) && frequency >= 2 && frequency <= maxFrequency;
      }),
    );
  };

  const favorites = new Set((profile.favorites ?? []).map((film) => fold(film.slug || film.title)));
  const records = new Map<string, EnrichedFilm>();
  for (const raw of [...(profile.films ?? []), ...(profile.favorites ?? []).map((film) => ({ ...film, isFavorite: true }))]) {
    const film = catalog.enrich(raw);
    const key = fold(film.slug || film.title);
    const previous = records.get(key);
    records.set(key, {
      ...previous,
      ...film,
      rating: film.rating ?? previous?.rating,
      isFavorite: Boolean(film.isFavorite || previous?.isFavorite || favorites.has(key)),
    });
  }
  const liked: Signal[] = [...records.values()]
    .filter((film) => film.isFavorite || (film.rating ?? 0) >= 4)
    .map((film) => ({ ...film, tags: tagsOf(film) }));
  const disliked: Signal[] = [...records.values()]
    .filter((film) => !film.isFavorite && typeof film.rating === 'number' && film.rating <= 2)
    .map((film) => ({ ...film, tags: tagsOf(film) }));
  const countries = new Set(liked.map((film) => fold(film.country)).filter(Boolean));

  return (film) => {
    const candidateTags = tagsOf(film);
    const genres = new Set((film.genres ?? []).map(fold));
    let best: { score: number; reason: string } | null = null;
    for (const signal of liked) {
      const shared = [...signal.tags].filter((tag) => candidateTags.has(tag));
      const sameDirector = Boolean(film.director && fold(film.director) === fold(signal.director));
      const genreOverlap = signal.genres.filter((genre) => genres.has(fold(genre))).length;
      // Unknown origin cannot be assumed familiar. Cross-origin discovery
      // requires a known liked director; metadata absence requires the same.
      const familiarOrigin = Boolean(film.country && countries.has(fold(film.country)));
      if (!sameDirector && !(familiarOrigin && shared.length >= 2 && genreOverlap >= 2)) continue;
      const score =
        (sameDirector ? 45 : 25) +
        Math.min(12, shared.length * 4) +
        Math.min(6, genreOverlap * 2) +
        (signal.isFavorite ? 8 : (signal.rating ?? 0) >= 4.5 ? 4 : 0);
      if (!best || score > best.score) {
        best = {
          score,
          reason: sameDirector
            ? `Mesmo diretor de “${signal.title}”, que você ${signal.isFavorite ? 'favoritou' : `avaliou com ${String(signal.rating).replace('.', ',')} estrelas`}`
            : `Relacionado a “${signal.title}” por ${shared.slice(0, 2).join(' e ')}, com origem presente nos seus filmes bem avaliados`,
        };
      }
    }
    const penalty = disliked.reduce(
      (total, signal) =>
        total +
        (film.director && fold(film.director) === fold(signal.director)
          ? 20
          : [...signal.tags].filter((tag) => candidateTags.has(tag)).length >= 2
            ? 10
            : 0),
      0,
    );
    return {
      eligible: Boolean(best && best.score - penalty >= 30),
      score: Math.max(0, (best?.score ?? 0) - penalty),
      reason: best?.reason ?? '',
      hasPreferences: liked.length > 0,
    };
  };
}
