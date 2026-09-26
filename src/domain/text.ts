const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase, trimmed and without accents: the base for every comparison. */
export function fold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim();
}

/** Letters and digits only, separated by single spaces. */
export function foldWords(value: unknown): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Title key for matching across languages and sources: drops leading
 * articles and punctuation, and treats "vol 1"/"volume i" as "1"/"i".
 */
export function normalizeTitle(value: unknown): string {
  return fold(value)
    .replace(/^(the|a|an|o|os|as|um|uma|le|la|les|der|die|das)\s+/i, '')
    .replace(/[:\-–—.,'"!?()[\]{}_/]/g, ' ')
    .replace(/\b(vol|volume|pt|part|parte)\s*([0-9ivx]+)\b/gi, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Slug key: accepts a full Letterboxd film URL and ignores the "-1999"
 * release-year suffix Letterboxd adds to disambiguate titles.
 */
export function normalizeSlug(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/[^/]+\/film\//, '')
    .replace(/^\/|\/$/g, '')
    .replace(/-\d{4}$/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Lowercased, trimmed slug, as stored in profiles. */
export function slugKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: a.length + 1 }, (_, j) => j);
  for (let i = 1; i <= b.length; i++) {
    const current = [i];
    for (let j = 1; j <= a.length; j++) {
      current[j] =
        b[i - 1] === a[j - 1]
          ? previous[j - 1]
          : Math.min(previous[j - 1] + 1, current[j - 1] + 1, previous[j] + 1);
    }
    previous = current;
  }
  return previous[a.length];
}

/** Whole-phrase match inside already folded text. */
export function containsPhrase(text: string, phrase: string): boolean {
  const escaped = fold(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(text);
}
