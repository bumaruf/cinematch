import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import type { CatalogFilm } from '../../src/domain/film.ts';

export function film(slug: string, values: Partial<CatalogFilm> = {}): CatalogFilm {
  return { title: slug, originalTitle: slug, slug, year: 1995, director: `Diretor ${slug}`, runtime: 100,
    country: 'United States', imdbRating: 7.7, imdbVotes: 10000, imdbId: `tt-${slug}`, themes: [], genres: ['Drama'], keywords: [], pitch: '', ...values };
}

export function discoveryCatalog() {
  return createCatalog([
    film('seen', { director: 'A', genres: ['Drama', 'Sci-Fi'], pitch: 'Uma investigação sobre memória e identidade.' }),
    ...Array.from({ length: 6 }, (_, i) => film(`known-${i}`, { director: 'A', genres: ['Drama', 'Sci-Fi'], imdbRating: 7.8 })),
    ...Array.from({ length: 6 }, (_, i) => film(`bridge-${i}`, { director: `B${i}`, country: 'Japan', genres: ['Drama', 'Sci-Fi'], pitch: 'Uma investigação sobre memória e identidade.' })),
    ...Array.from({ length: 6 }, (_, i) => film(`animation-${i}`, { director: `C${i}`, country: 'Japan', genres: ['Animation', 'Family'], imdbRating: 8.4 })),
  ]);
}
