const DIACRITICS = /[̀-ͯ]/g;

/**
 * Bounded memo for pure string functions called for every catalog film on
 * every request. Clearing at the cap keeps memory predictable.
 */
function memoize(fn: (value: string) => string, cap = 100_000): (value: string) => string {
  const cache = new Map<string, string>();
  return (value) => {
    let result = cache.get(value);
    if (result === undefined) {
      if (cache.size >= cap) cache.clear();
      result = fn(value);
      cache.set(value, result);
    }
    return result;
  };
}

const foldString = memoize((value) => value.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim());

/** Lowercase, trimmed and without accents: the base for every comparison. */
export function fold(value: unknown): string {
  return foldString(String(value ?? ''));
}

/** Where free-text matching splits folded fields into words. */
export const WORD_SEPARATORS = /[\s,.:;!?/\-_()]+/;

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
  return normalizeTitleString(String(value ?? ''));
}

const normalizeTitleString = memoize((value) =>
  fold(value)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/^(the|a|an|o|os|as|um|uma|le|la|les|der|die|das)\s+/i, '')
    .replace(/[:\-–—.,'"!?()[\]{}_/]/g, ' ')
    .replace(/\b(vol|volume|pt|part|parte)\s*([0-9ivx]+)\b/gi, '$2')
    .replace(/\s+/g, ' ')
    .trim(),
);

/**
 * Slug key: accepts a full Letterboxd film URL and ignores the "-1999"
 * release-year suffix Letterboxd adds to disambiguate titles.
 */
export function normalizeSlug(value: unknown): string {
  return normalizeSlugString(String(value ?? ''));
}

const normalizeSlugString = memoize((value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/[^/]+\/film\//, '')
    .replace(/^\/|\/$/g, '')
    .replace(/-\d{4}$/, '')
    .replace(/[^a-z0-9]/g, ''),
);

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
  let pattern = phrasePatterns.get(phrase);
  if (!pattern) {
    const escaped = fold(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
    if (phrasePatterns.size >= 10_000) phrasePatterns.clear();
    phrasePatterns.set(phrase, pattern);
  }
  return pattern.test(text);
}

const phrasePatterns = new Map<string, RegExp>();
