import fs from 'node:fs';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { getThemeCriteria, THEMES_CATALOG } from '../../src/domain/themes/themes.ts';
import { relatedThemeEligibility, themeEligibility } from '../../src/domain/recommend/theme-eligibility.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';

const catalog = loadCatalog();
if (!catalog.films.length) throw new Error('Gere o catálogo real antes desta auditoria.');
const now = new Date('2026-10-07T15:00:00Z');
const themes = THEMES_CATALOG.map(theme => {
  const criteria = getThemeCriteria(theme.id);
  const eligible = catalog.films.filter(film => themeEligibility(film, criteria).eligible);
  const result = recommend({ profile: null, themeId: theme.id }, catalog, now);
  return { id: theme.id, title: theme.title, eligible: eligible.length,
    nearby: catalog.films.filter(film => !themeEligibility(film, criteria).eligible && relatedThemeEligibility(film, criteria).eligible).length,
    top: result.recommendations.map(film => ({ title: film.originalTitle, slug: film.catalogSlug, fit: film.themeFit ?? 'exact' })),
    violations: result.recommendations.filter(film => !(film.themeFit === 'related' ? relatedThemeEligibility : themeEligibility)(catalog.bySlug(film.catalogSlug)!, criteria).eligible).map(film => film.catalogSlug) };
});
fs.mkdirSync('e2e-screenshots', { recursive: true });
fs.writeFileSync('e2e-screenshots/theme-quality.json', JSON.stringify({ catalog: catalog.info, themes }, null, 2));
console.log(JSON.stringify(themes.map(theme => ({ id: theme.id, eligible: theme.eligible, nearby: theme.nearby, top: theme.top.slice(0, 3), violations: theme.violations })), null, 2));
if (themes.some(theme => theme.violations.length)) process.exitCode = 1;
