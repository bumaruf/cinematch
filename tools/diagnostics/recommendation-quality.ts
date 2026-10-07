import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { THEMES_CATALOG } from '../../src/domain/themes/themes.ts';
import type { UserProfile } from '../../src/domain/film.ts';

const catalog = loadCatalog();
if (!catalog.films.length) throw new Error('Gere o catálogo real antes desta auditoria.');
const now = new Date('2026-10-06T15:00:00Z');
function profile(username: string, directors: string[]): UserProfile {
  return { username, films: directors.flatMap((director) => catalog.films.filter((film) => film.director === director)
    .sort((a, b) => b.imdbVotes - a.imdbVotes).slice(0, 6).map((film) => ({ title: film.title, slug: film.slug, year: film.year, rating: 4.5 }))) };
}
const first = profile('thrillers', ['Christopher Nolan', 'David Fincher', 'Denis Villeneuve']);
const second = profile('animation', ['Hayao Miyazaki', 'Isao Takahata', 'Makoto Shinkai']);
const likedCounts = [first.films.length, second.films.length];
// Both profiles have watched the same films; only ratings differ. This isolates
// personalization from differences caused merely by the watched exclusion.
const firstLiked = [...first.films];
const secondLiked = [...second.films];
first.films.push(...secondLiked.map((film) => ({ ...film, rating: null })));
second.films.push(...firstLiked.map((film) => ({ ...film, rating: null })));
let identical = 0;
const themes = THEMES_CATALOG.map((theme) => {
  const a = recommend({ profile: first, themeId: theme.id }, catalog, now).recommendations.map((film) => film.catalogSlug);
  const b = recommend({ profile: second, themeId: theme.id }, catalog, now).recommendations.map((film) => film.catalogSlug);
  const same = a.length > 0 && JSON.stringify(a) === JSON.stringify(b);
  if (same) identical++;
  return { theme: theme.id, identical: same, shared: a.filter((slug) => b.includes(slug)).length, first: a, second: b };
});
const timings = [1, 50, 200].map((count) => {
  const input: UserProfile = { username: 'latency', films: catalog.films.slice(0, count).map((film) => ({ title: film.title, slug: film.slug, year: film.year, rating: 4.5 })) };
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now(); recommend({ profile: input, mode: 'explore' }, catalog, now); samples.push(Math.round(performance.now() - start));
  }
  return { films: count, samplesMs: samples, medianMs: [...samples].sort((a, b) => a - b)[1] };
});
console.log(JSON.stringify({ catalog: catalog.info, comparedProfiles: [first.films.length, second.films.length], likedCounts, identicalThemes: identical, totalThemes: themes.length, timings, themes }, null, 2));
