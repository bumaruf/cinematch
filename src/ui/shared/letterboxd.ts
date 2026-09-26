// First path segments of Letterboxd pages that are not member profiles.
const SITE_ROUTES = new Set([
  'films', 'film', 'lists', 'members', 'journal', 'activity',
  'search', 'settings', 'about', 'welcome', 'pro', 'legal', 'apps',
]);

/** The member whose page this is, or null for site pages. */
export function usernameFromLetterboxdUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)letterboxd\.com$/.test(parsed.hostname)) return null;
  const [first] = parsed.pathname.split('/').filter(Boolean);
  if (!first || SITE_ROUTES.has(first.toLowerCase()) || !/^[a-zA-Z0-9_-]+$/.test(first)) return null;
  return first;
}
