/** Reviewed regional names, bound to one IMDb identity and release year.
 * Do not infer these relationships by fuzzy title or franchise matching.
 */
export const FILM_IDENTITY_ALIASES: Readonly<Record<string, {
  year: number;
  titles: readonly string[];
  slugs: readonly string[];
  source: string;
}>> = {
  tt0241527: {
    year: 2001,
    titles: ["Harry Potter and the Philosopher's Stone", "Harry Potter and the Sorcerer's Stone"],
    slugs: ['harry-potter-and-the-philosophers-stone', 'harry-potter-and-the-sorcerers-stone'],
    source: 'https://letterboxd.com/film/harry-potter-and-the-philosophers-stone/',
  },
};
