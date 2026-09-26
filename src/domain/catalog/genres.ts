const PORTUGUESE_GENRES: Record<string, string | string[]> = {
  ação: 'Action',
  aventura: 'Adventure',
  comédia: 'Comedy',
  'ficção científica': 'Sci-Fi',
  suspense: 'Thriller',
  mistério: 'Mystery',
  faroeste: 'Western',
  guerra: 'War',
  terror: 'Horror',
  biografia: 'Biography',
  animação: 'Animation',
  família: 'Family',
  fantasia: 'Fantasy',
  histórico: 'History',
  história: 'History',
  música: 'Music',
  documentário: 'Documentary',
  'comédia dramática': ['Comedy', 'Drama'],
};

/** Maps Portuguese genre names to the catalog's canonical (IMDb) names. */
export function normalizeGenres(genres: readonly unknown[] = []): string[] {
  return [
    ...new Set(
      genres
        .filter((genre): genre is string => typeof genre === 'string')
        .flatMap((genre) => PORTUGUESE_GENRES[genre.toLowerCase().trim()] ?? genre.trim())
        .filter(Boolean),
    ),
  ];
}
