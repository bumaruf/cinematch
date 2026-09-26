import type { Catalog } from '../catalog/catalog.ts';
import type { UserProfile } from '../film.ts';

export interface YearPhase {
  currentYear: number;
  thisYearCount: number;
  topGenres: { genre: string; count: number }[];
  topDirectors: { director: string; count: number }[];
  /** Average rating with one decimal, or '—' without ratings. */
  avgYearRating: string;
  phaseDescription: string;
  sampleFilms: string[];
}

function ranked(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** The user's cinematic phase this year: dominant genres and directors. */
export function analyzeYearPhase(profile: Partial<UserProfile> | null | undefined, catalog: Catalog, now: Date): YearPhase {
  const currentYear = now.getFullYear();
  const thisYearCount = profile?.thisYearCount || profile?.thisYearFilms?.length || 0;
  // Without this year's diary, the most recent library entries stand in.
  const pool = profile?.thisYearFilms?.length ? profile.thisYearFilms : (profile?.films ?? []).slice(0, 30);

  const genres = new Map<string, number>();
  const directors = new Map<string, number>();
  let ratingSum = 0;
  let ratedCount = 0;
  for (const raw of pool) {
    const film = catalog.enrich(raw);
    if (typeof film.rating === 'number' && !Number.isNaN(film.rating)) {
      ratingSum += film.rating;
      ratedCount++;
    }
    if (film.director) directors.set(film.director, (directors.get(film.director) ?? 0) + 1);
    for (const genre of film.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  }

  const topGenres = ranked(genres).map(([genre, count]) => ({ genre, count }));
  let phaseDescription = `Em ${currentYear}, você já registrou ${thisYearCount} filmes.`;
  if (topGenres.length >= 2) {
    phaseDescription += ` Sua fase atual tem forte afinidade por ${topGenres[0].genre} e ${topGenres[1].genre}.`;
  } else if (topGenres.length === 1) {
    phaseDescription += ` Sua fase atual está concentrada em ${topGenres[0].genre}.`;
  }

  return {
    currentYear,
    thisYearCount,
    topGenres,
    topDirectors: ranked(directors)
      .slice(0, 3)
      .map(([director, count]) => ({ director, count })),
    avgYearRating: ratedCount > 0 ? (ratingSum / ratedCount).toFixed(1) : '—',
    phaseDescription,
    sampleFilms: pool.slice(0, 6).map((film) => film.title),
  };
}
