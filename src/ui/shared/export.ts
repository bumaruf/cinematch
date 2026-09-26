import { letterboxdLink, type FilmLike } from './film.ts';

/** Plain-text list for pasting into a chat or a note. */
export function recommendationsText(heading: string, films: readonly FilmLike[]): string {
  return films.reduce(
    (text, film, i) =>
      `${text}${i + 1}. ${film.title} (${film.year || 'N/A'})${film.director ? ` - Dir. ${film.director}` : ''}\n` +
      `${film.pitch ? `   ${film.pitch}\n` : ''}   ${letterboxdLink(film)}\n\n`,
    `${heading}\n\n`,
  );
}
