import { createCatalog, type Catalog } from '../../src/domain/catalog/catalog.ts';
import type { UserProfile } from '../../src/domain/film.ts';
import { film } from './catalog.ts';

/**
 * A small catalog of fictional films that covers what the application flows
 * need: a climate with more films than one list (cyberpunk), a director the
 * taste profile loves, horror, short dramas and a range of popularity. It lets
 * the recommendation and daily-pick flows run in CI, where the real IMDb
 * catalog is not available.
 */
export function syntheticCatalog(): Catalog {
  const decades = [1970, 1980, 1990, 2000, 2010, 2020];
  return createCatalog([
    // The climate: Sci-Fi with cyberpunk and hacker evidence in the synopsis.
    ...Array.from({ length: 12 }, (_, i) => film(`neon-${i}`, {
      title: `Neon ${i}`,
      originalTitle: `Neon ${i}`,
      director: `Diretora Neon ${i}`,
      year: decades[i % decades.length] + i,
      runtime: 100 + i * 5,
      genres: ['Sci-Fi', 'Thriller'],
      imdbRating: 7 + (i % 5) * 0.3,
      imdbVotes: i < 4 ? 300_000 : 20_000,
      pitch: `Um hacker atravessa uma megacidade cyberpunk iluminada por neon na noite número ${i}.`,
    })),
    // The director the taste profile rated highly, and more of their films.
    film('obra-favorita', { title: 'Obra Favorita', director: 'Autora Querida', year: 2008, genres: ['Drama', 'Crime'], imdbRating: 8.5, imdbVotes: 500_000 }),
    ...Array.from({ length: 8 }, (_, i) => film(`querida-${i}`, {
      title: `Querida ${i}`,
      originalTitle: `Querida ${i}`,
      director: 'Autora Querida',
      year: 1985 + i * 4,
      runtime: 110 + i,
      genres: ['Drama', 'Crime'],
      imdbRating: 7.4 + (i % 4) * 0.2,
      imdbVotes: 80_000,
    })),
    // Horror for free-text searches.
    ...Array.from({ length: 6 }, (_, i) => film(`terror-${i}`, {
      title: `Casa Sombria ${i}`,
      originalTitle: `Casa Sombria ${i}`,
      director: `Diretor Terror ${i}`,
      year: 1975 + i * 8,
      genres: ['Horror'],
      imdbRating: 6.8 + i * 0.2,
      imdbVotes: 40_000,
    })),
    // Short dramas from different decades, for per-request filters.
    ...Array.from({ length: 8 }, (_, i) => film(`curta-${i}`, {
      title: `Drama Breve ${i}`,
      originalTitle: `Drama Breve ${i}`,
      director: `Diretor Breve ${i}`,
      year: 1960 + i * 8,
      runtime: 80 + i,
      genres: ['Drama'],
      imdbRating: 7.1,
      imdbVotes: 15_000,
    })),
    film('alien', { title: 'Alien', originalTitle: 'Alien', director: 'Diretor Espacial', year: 1979, genres: ['Sci-Fi', 'Horror'], imdbRating: 8.5, imdbVotes: 900_000 }),
    film('alien-a-volta', { title: 'Alien: A Volta', originalTitle: 'Alien: A Volta', director: 'Outro Diretor Espacial', year: 1986, genres: ['Sci-Fi', 'Action'], imdbRating: 8.3, imdbVotes: 800_000 }),
  ]);
}

/** Loves one film by "Autora Querida", so her other films are strong matches. */
export const syntheticTasteProfile: UserProfile = {
  username: 'taste',
  films: [{ title: 'Obra Favorita', slug: 'obra-favorita', year: 2008, rating: 5 }],
  favorites: [],
  lastSync: '2026-09-01T00:00:00.000Z',
};
