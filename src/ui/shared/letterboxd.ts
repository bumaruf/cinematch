// First path segments of Letterboxd pages that are not member profiles.
const SITE_ROUTES = new Set([
  'films', 'film', 'lists', 'members', 'people', 'journal', 'activity',
  'search', 'settings', 'about', 'welcome', 'pro', 'patron', 'legal', 'apps',
  'hq', 'contact', 'sign-in', 'sign-out', 'create-account', 'podcast',
  'showdown', 'reviewers', 'tmdb', 'imdb', 'csi', 'ajax', 'api', 'year-in-review',
  // Crew and company pages share the first path segment with members.
  'actor', 'director', 'co-director', 'producer', 'executive-producer', 'writer',
  'original-writer', 'story', 'editor', 'cinematography', 'composer', 'songs',
  'crew', 'studio', 'casting', 'production-design', 'art-direction', 'set-decoration',
  'visual-effects', 'special-effects', 'costume-design', 'makeup', 'hairstyling',
  'sound', 'lighting', 'stunts', 'choreography', 'title-design', 'camera-operator',
  'assistant-director', 'additional-directing', 'narrator',
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
