import type { Catalog } from '../catalog/catalog.ts';
import { descriptiveTags, type EvidenceFilm } from '../catalog/evidence.ts';
import type { EnrichedFilm, FilmIdentity, UserProfile } from '../film.ts';
import { fold } from '../text.ts';

export interface TasteMatch {
  eligible: boolean;
  score: number;
  reason: string;
  hasPreferences: boolean;
  sameDirector: boolean;
}
export type TasteCandidate = EvidenceFilm & { country?: string; tasteTags?: readonly string[] };
export type TasteMatcher = (film: TasteCandidate) => TasteMatch;
interface Signal extends EnrichedFilm { tags: Set<string>; weight: number; directorKey: string; genreKeys: string[] }

export interface TasteOptions {
  /** Films the user marked "Não combina comigo": negative signals like a low rating. */
  rejected?: readonly FilmIdentity[];
}

/** Each further liked film that supports a match adds a little, with a cap. */
const SUPPORT_PER_SIGNAL = 2.5;
const MAX_SUPPORT = 10;

/**
 * The descriptive tags that can relate two films: synopsis concepts, and
 * keywords shared by a few catalog films but not by many. The packaged
 * catalog carries them precomputed (tasteTags); others are derived here.
 */
export function tasteTags(film: TasteCandidate, catalog: Catalog): readonly string[] {
  if (film.tasteTags) return film.tasteTags;
  const common = Math.max(2, catalog.films.length * 0.01);
  return descriptiveTags(film).filter((tag) => {
    if (tag.startsWith('conceito:')) return true;
    const frequency = catalog.keywordFrequency(tag);
    return tag.length >= 5 && frequency >= 2 && frequency <= common;
  });
}

/** Indexed evidence keeps work proportional to relevant signals, not history size. */
export function createTasteMatcher(profile: Partial<UserProfile>, catalog: Catalog, { rejected = [] }: TasteOptions = {}): TasteMatcher {
  const favorites = new Set((profile.favorites ?? []).map((film) => fold(film.slug || film.title)));
  const records = new Map<string, EnrichedFilm>();
  for (const raw of [...(profile.films ?? []), ...(profile.favorites ?? []).map((film) => ({ ...film, isFavorite: true }))]) {
    const film = catalog.enrich(raw);
    const key = fold(film.catalogSlug || film.slug || `${film.title}|${film.year ?? ''}`);
    const previous = records.get(key);
    records.set(key, { ...previous, ...film, rating: film.rating ?? previous?.rating,
      isFavorite: Boolean(film.isFavorite || previous?.isFavorite || favorites.has(fold(film.slug || film.title))) });
  }
  const ratings = [...records.values()].map((film) => film.rating).filter((rating): rating is number => typeof rating === 'number').sort((a, b) => a - b);
  // Respect personal rating scales with enough evidence, without treating low
  // ratings as preferences. Sparse histories keep an absolute positive floor.
  const cutoff = ratings.length >= 8 ? Math.max(2.5, ratings[Math.floor((ratings.length - 1) * 0.7)]) : 3.5;
  // Dislikes follow the same personal scale: a generous rater's lowest notes
  // count as negative even above 2 stars, but never reach the liked range.
  const dislikeCutoff = ratings.length >= 8 ? Math.max(2, Math.min(cutoff - 1, ratings[Math.floor((ratings.length - 1) * 0.15)])) : 2;
  const tagsOf = (film: TasteCandidate): Set<string> => new Set(tasteTags(film, catalog));
  const liked: Signal[] = [...records.values()].filter((film) => film.isFavorite || (film.rating ?? 0) >= cutoff)
    .map((film) => ({ ...film, tags: tagsOf(film), directorKey: fold(film.director), genreKeys: film.genres.map(fold),
      weight: film.isFavorite ? 1.25 : 1 + Math.max(0, (film.rating ?? cutoff) - cutoff) * 0.15 }));
  if (liked.length === 0) return () => ({ eligible: false, score: 0, reason: '', hasPreferences: false, sameDirector: false });
  const rejectedFilms = rejected.flatMap((identity) => {
    const film = catalog.resolve(identity).film;
    return film ? [film] : [];
  });
  const disliked = [...[...records.values()].filter((film) => !film.isFavorite && typeof film.rating === 'number' && film.rating <= dislikeCutoff), ...rejectedFilms]
    .map((film) => ({ ...film, tags: tagsOf(film) }));
  const directors = new Map<string, Set<Signal>>();
  const tags = new Map<string, Set<Signal>>();
  const genreWeight = new Map<string, number>();
  let totalWeight = 0;
  for (const signal of liked) {
    totalWeight += signal.weight;
    const director = signal.directorKey;
    if (director) { const group = directors.get(director) ?? new Set(); group.add(signal); directors.set(director, group); }
    for (const tag of signal.tags) { const group = tags.get(tag) ?? new Set(); group.add(signal); tags.set(tag, group); }
    for (const genre of signal.genreKeys) genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + signal.weight / Math.max(1, signal.genres.length));
  }
  const negativeDirectors = new Set(disliked.map((film) => fold(film.director)).filter(Boolean));
  const negativeTags = new Set(disliked.flatMap((film) => [...film.tags]));
  const cache = new WeakMap<TasteCandidate, TasteMatch>();
  return (film) => {
    const cached = cache.get(film); if (cached) return cached;
    const candidateTags = tagsOf(film);
    const genres = new Set((film.genres ?? []).map(fold));
    const director = fold(film.director);
    const relevant = new Set(directors.get(director) ?? []);
    for (const tag of candidateTags) for (const signal of tags.get(tag) ?? []) relevant.add(signal);
    let best = { score: 0, reason: '', sameDirector: false };
    let supporting = 0;
    for (const signal of relevant) {
      const shared = [...signal.tags].filter((tag) => candidateTags.has(tag));
      const sameDirector = Boolean(director && director === signal.directorKey);
      const overlap = signal.genreKeys.filter((genre) => genres.has(genre)).length;
      if (!sameDirector && !(shared.length >= 2 && overlap >= 1)) continue;
      supporting++;
      const score = (sameDirector ? 42 : 28) + Math.min(12, shared.length * 4) + Math.min(6, overlap * 2) + (signal.isFavorite ? 8 : (signal.rating ?? 0) >= 4.5 ? 4 : 0);
      if (score > best.score) best = { score, sameDirector,
        reason: sameDirector
          ? `Mesmo diretor de “${signal.title}”, que você ${signal.isFavorite ? 'favoritou' : `avaliou com ${String(signal.rating).replace('.', ',')} estrelas`}`
          : `Relacionado a “${signal.title}” por ${shared.slice(0, 2).map((tag) => tag.replace('conceito:', '')).join(' e ')}` };
    }
    // Genre affinity helps browsing but never establishes a strong match.
    const genreAffinity = [...genres].reduce((total, genre) => total + (genreWeight.get(genre) ?? 0) / Math.max(1, totalWeight), 0) * 16;
    const negativeOverlap = [...candidateTags].filter((tag) => negativeTags.has(tag)).length;
    const penalty = Math.min(24, (negativeDirectors.has(director) ? 18 : 0) + (negativeOverlap >= 2 ? 10 : 0));
    // A film close to many liked films is a safer bet than one close to a single film.
    const support = Math.min(MAX_SUPPORT, Math.max(0, supporting - 1) * SUPPORT_PER_SIGNAL);
    const match = { eligible: best.score > 0 && best.score - penalty >= 30, score: Math.max(0, best.score + support + genreAffinity - penalty),
      reason: best.reason, hasPreferences: liked.length > 0, sameDirector: best.sameDirector };
    cache.set(film, match); return match;
  };
}
