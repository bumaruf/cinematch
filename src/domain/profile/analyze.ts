import type { Catalog } from '../catalog/catalog.ts';
import type { EnrichedFilm, UserProfile } from '../film.ts';
import { normalizeTitle, slugKey } from '../text.ts';
import { createWatchedIndex, type WatchedEntry, type WatchedIndex } from './watched.ts';

export interface RatedFilm {
  title: string;
  year: number | null;
  rating: number | null;
  slug: string;
  isFavorite: boolean;
  director: string;
  genres: string[];
  keywords: string[];
  runtime: number | null;
  country: string;
}

export interface ProfileStats {
  avgRating: number;
  fiveStarCount: number;
  fourHalfCount: number;
  fourStarCount: number;
  threeHalfCount: number;
  favoritesCount: number;
  dislikedCount: number;
  totalRated: number;
}

export interface AnalyzedProfile {
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  totalLoggedFilms: number;
  totalAnalyzed: number;
  topFilms: RatedFilm[];
  fiveStarFilms: RatedFilm[];
  fourHalfFilms: RatedFilm[];
  fourStarFilms: RatedFilm[];
  threeHalfFilms: RatedFilm[];
  dislikedFilms: RatedFilm[];
  watchedList: WatchedEntry[];
  stats: ProfileStats;
  lastSync: string;
}

const EMPTY_STATS: ProfileStats = {
  avgRating: 0,
  fiveStarCount: 0,
  fourHalfCount: 0,
  fourStarCount: 0,
  threeHalfCount: 0,
  favoritesCount: 0,
  dislikedCount: 0,
  totalRated: 0,
};

function toRated(film: EnrichedFilm, year: number | null, rating: number | null, slug: string): RatedFilm {
  return {
    title: film.title,
    year,
    rating,
    slug,
    isFavorite: Boolean(film.isFavorite),
    director: film.director,
    genres: film.genres,
    keywords: film.keywords,
    runtime: film.runtime,
    country: film.country,
  };
}

export function analyzeProfile(profile: UserProfile | null | undefined, catalog: Catalog, now: Date): AnalyzedProfile {
  if (!profile?.films) {
    return {
      username: profile?.username || 'Anônimo',
      displayName: profile?.displayName || 'Cinéfilo',
      avatarUrl: '',
      bio: '',
      totalLoggedFilms: 0,
      totalAnalyzed: 0,
      topFilms: [],
      fiveStarFilms: [],
      fourHalfFilms: [],
      fourStarFilms: [],
      threeHalfFilms: [],
      dislikedFilms: [],
      watchedList: [],
      stats: EMPTY_STATS,
      lastSync: now.toISOString(),
    };
  }

  const { username, displayName, favorites = [], films, totalFilms = 0 } = profile;
  const fiveStar: RatedFilm[] = [];
  const fourHalf: RatedFilm[] = [];
  const fourStar: RatedFilm[] = [];
  const threeHalf: RatedFilm[] = [];
  const disliked: RatedFilm[] = [];
  const watchedList: WatchedEntry[] = [];
  let ratingSum = 0;
  let ratedCount = 0;

  for (const raw of films) {
    const film = catalog.enrich(raw);
    const title = film.title ? film.title.trim() : '';
    if (!title) continue;
    const year = film.year ? Number.parseInt(String(film.year), 10) : null;
    const slug = slugKey(film.slug);
    watchedList.push({
      title,
      year,
      slug,
      catalogSlug: slugKey(film.catalogSlug),
      catalogTitleAmbiguous: film.catalogTitleAmbiguous,
      rating: film.rating,
      normalizedTitle: normalizeTitle(title),
    });

    const rating = typeof film.rating === 'number' && !Number.isNaN(film.rating) ? film.rating : null;
    if (rating === null) {
      if (film.isFavorite) fiveStar.push({ ...toRated(film, year, null, slug), isFavorite: true });
      continue;
    }
    ratingSum += rating;
    ratedCount++;
    const entry = toRated(film, year, rating, slug);
    if (rating >= 5 || film.isFavorite) fiveStar.push(entry);
    else if (rating >= 4.5) fourHalf.push(entry);
    else if (rating >= 4) fourStar.push(entry);
    else if (rating >= 3.5) threeHalf.push(entry);
    else if (rating <= 2) disliked.push(entry);
  }

  // Pinned favorites always count as five-star taste signals.
  for (const raw of favorites) {
    const favorite = catalog.enrich(raw);
    const present = fiveStar.some(
      (film) => (film.slug && film.slug === favorite.slug) || normalizeTitle(film.title) === normalizeTitle(favorite.title),
    );
    if (present) continue;
    const slug = favorite.slug || '';
    fiveStar.unshift({
      ...toRated(favorite, favorite.year || null, watchedList.find((film) => film.slug && film.slug === slug)?.rating ?? null, slug),
      isFavorite: true,
    });
  }

  const preferred = [...fiveStar, ...fourHalf, ...fourStar, ...threeHalf];
  return {
    username,
    displayName: displayName || username,
    avatarUrl: profile.avatarUrl || '',
    bio: profile.bio || '',
    totalLoggedFilms: totalFilms || films.length,
    totalAnalyzed: films.length,
    topFilms: preferred.slice(0, 100),
    fiveStarFilms: fiveStar.slice(0, 50),
    fourHalfFilms: fourHalf.slice(0, 50),
    fourStarFilms: fourStar.slice(0, 40),
    threeHalfFilms: threeHalf.slice(0, 40),
    dislikedFilms: disliked.slice(0, 30),
    watchedList,
    stats: {
      avgRating: ratedCount > 0 ? Number.parseFloat((ratingSum / ratedCount).toFixed(2)) : 3.8,
      fiveStarCount: films.filter((film) => film.rating === 5).length,
      fourHalfCount: fourHalf.length,
      fourStarCount: fourStar.length,
      threeHalfCount: threeHalf.length,
      favoritesCount: favorites.length,
      dislikedCount: disliked.length,
      totalRated: ratedCount,
    },
    lastSync: profile.lastSync || now.toISOString(),
  };
}

export function watchedIndexOf(analyzed: AnalyzedProfile): WatchedIndex {
  return createWatchedIndex(analyzed.watchedList);
}

/** Histogram of ratings in half-star buckets, from 0.5 to 5. */
export function ratingHistogram(profile: UserProfile): { rating: number; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ rating: (i + 1) / 2, count: 0 }));
  for (const film of profile.films) {
    if (typeof film.rating !== 'number') continue;
    const bucket = buckets[Math.round(film.rating * 2) - 1];
    if (bucket) bucket.count++;
  }
  return buckets;
}
