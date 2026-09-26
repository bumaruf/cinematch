/**
 * Stress test suite — testa casos extremos e edge cases do motor de recomendação
 */
import { recommend } from '../../src/domain/recommend/engine.ts';
import { parseDecade } from '../../src/domain/recommend/filters.ts';
import { analyzeProfile } from '../../src/domain/profile/analyze.ts';
import { loadCatalog } from '../../src/infrastructure/catalog.ts';
import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { THEMES_CATALOG, getThemeById } from '../../src/domain/themes/themes.ts';

// Adapters from the pre-refactor API this script was written against.
const catalog = loadCatalog();
const LocalRecommender = {
  generateLocalRecommendations: ({ userProfile, themeObj = null, customPrompt = '', filters = {} }) =>
    recommend(
      { profile: userProfile, themeId: themeObj?.id ?? null, customPrompt: customPrompt ?? '', filters: { ...filters, ...(filters?.decade ? parseDecade(filters.decade) : {}) } },
      catalog,
      new Date(),
    ),
};
const UserProfiler = { analyzeProfile: (profile) => analyzeProfile(profile, catalog, new Date()) };

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    errors.push(`${label}: ${detail}`);
  }
}

// ─── 1. Database integrity ────────────────────────────────────────────────────
console.log('\n1. Integridade do Banco de Dados:');

assert(Array.isArray(EXPANDED_FILM_DATABASE), 'EXPANDED_FILM_DATABASE é um array');
assert(EXPANDED_FILM_DATABASE.length > 1000, `Banco tem mais de 1000 filmes (tem ${EXPANDED_FILM_DATABASE.length})`);

// Check for duplicate slugs
const slugSet = new Set();
let dupSlugs = 0;
for (const f of EXPANDED_FILM_DATABASE) {
  if (f.slug && slugSet.has(f.slug)) dupSlugs++;
  else if (f.slug) slugSet.add(f.slug);
}
assert(dupSlugs === 0, `Sem slugs duplicados (${dupSlugs} duplicados encontrados)`);

// Check required fields
const missingTitle = EXPANDED_FILM_DATABASE.filter(f => !f.title || !f.title.trim()).length;
const missingYear = EXPANDED_FILM_DATABASE.filter(f => !f.year || isNaN(f.year)).length;
const missingSlug = EXPANDED_FILM_DATABASE.filter(f => !f.slug || !f.slug.trim()).length;
const invalidRuntime = EXPANDED_FILM_DATABASE.filter(f => f.runtime !== undefined && (isNaN(f.runtime) || f.runtime < 0)).length;
const futureYear = EXPANDED_FILM_DATABASE.filter(f => f.year > 2027).length;
const pastYear = EXPANDED_FILM_DATABASE.filter(f => f.year < 1880).length;

assert(missingTitle === 0, `Sem filmes sem título (${missingTitle} encontrados)`);
assert(missingYear < 10, `Quase todos com ano (${missingYear} sem ano)`, `${missingYear} filmes sem ano`);
assert(missingSlug < 5, `Quase todos com slug (${missingSlug} sem slug)`, `${missingSlug} filmes sem slug`);
assert(invalidRuntime === 0, `Sem durações inválidas (${invalidRuntime} encontradas)`);
assert(futureYear === 0, `Sem filmes com ano futuro irreal > 2027 (${futureYear} encontrados)`);
assert(pastYear === 0, `Sem filmes com ano impossível < 1880 (${pastYear} encontrados)`);

// Check themes are valid
const validThemeIds = new Set(THEMES_CATALOG.map(t => t.id));
let invalidThemeCount = 0;
for (const f of EXPANDED_FILM_DATABASE) {
  for (const tid of (f.themes || [])) {
    if (!validThemeIds.has(tid)) invalidThemeCount++;
  }
}
assert(invalidThemeCount === 0, `Todos os theme IDs são válidos (${invalidThemeCount} inválidos)`);

// ─── 2. LocalRecommender stress tests ─────────────────────────────────────────
console.log('\n2. Stress Tests do Motor de Recomendação:');

const profileBase = {
  username: 'stresstest',
  displayName: 'Stress Test',
  films: [
    { title: 'Parasita', slug: 'parasite', year: 2019, rating: 5.0 },
    { title: 'Clube da Luta', slug: 'fight-club', year: 1999, rating: 4.5 },
    { title: 'Pulp Fiction', slug: 'pulp-fiction', year: 1994, rating: 5.0 },
  ],
  favorites: [{ title: 'Parasita', slug: 'parasite' }]
};

// Test with null/empty inputs
try {
  const r1 = LocalRecommender.generateLocalRecommendations({ userProfile: profileBase, customPrompt: '', filters: {} });
  assert(r1 && r1.recommendations, 'Funciona com customPrompt vazio');
} catch(e) { assert(false, 'Funciona com customPrompt vazio', e.message); }

try {
  const r2 = LocalRecommender.generateLocalRecommendations({ userProfile: profileBase, customPrompt: null, filters: {} });
  assert(r2 && r2.recommendations, 'Funciona com customPrompt null');
} catch(e) { assert(false, 'Funciona com customPrompt null', e.message); }

try {
  const r3 = LocalRecommender.generateLocalRecommendations({ userProfile: profileBase, themeObj: null, customPrompt: '', filters: null });
  assert(r3 && r3.recommendations, 'Funciona com filters null');
} catch(e) { assert(false, 'Funciona com filters null', e.message); }

// Test with profile with no films
try {
  const emptyProfile = { username: 'empty', displayName: 'Empty', films: [], favorites: [] };
  const r4 = LocalRecommender.generateLocalRecommendations({ userProfile: emptyProfile, customPrompt: 'terror', filters: {} });
  assert(r4 && Array.isArray(r4.recommendations), 'Funciona com perfil sem filmes');
  assert(r4.recommendations.length > 0, 'Retorna resultados mesmo sem perfil');
} catch(e) { assert(false, 'Funciona com perfil sem filmes', e.message); }

// Test never recommends watched films
const watchedSlugs = profileBase.films.map(f => f.slug);
try {
  const r5 = LocalRecommender.generateLocalRecommendations({ userProfile: profileBase, customPrompt: 'crime', filters: {} });
  const contaminated = r5.recommendations.filter(r => watchedSlugs.includes(r.letterboxdSlug || r.slug));
  assert(contaminated.length === 0, 'Nunca recomenda filmes já assistidos', contaminated.map(f => f.title).join(', '));
} catch(e) { assert(false, 'Nunca recomenda filmes já assistidos', e.message); }

// Test all 15 themes don't crash
console.log('\n3. Teste todos os 15 Temas:');
for (const theme of THEMES_CATALOG) {
  try {
    const r = LocalRecommender.generateLocalRecommendations({ userProfile: profileBase, themeObj: theme, customPrompt: '', filters: {} });
    assert(r && Array.isArray(r.recommendations) && r.recommendations.length > 0,
      `Tema "${theme.title}" retorna resultados`);
  } catch(e) {
    assert(false, `Tema "${theme.title}" não crasha`, e.message);
  }
}

// Test all runtime filters
console.log('\n4. Stress de Filtros de Duração:');
const runtimeFilters = ['under-90', 'over-120', 'under-60', 'any'];
for (const rf of runtimeFilters) {
  try {
    const r = LocalRecommender.generateLocalRecommendations({
      userProfile: profileBase, customPrompt: 'drama', filters: { runtimeFilter: rf, maxRuntime: rf }
    });
    assert(r && r.recommendations, `Filtro de duração "${rf}" funciona`);
    if (rf === 'under-90') {
      const violating = r.recommendations.filter(rec => rec.runtimeMinutes && rec.runtimeMinutes > 90);
      assert(violating.length === 0, `Filtro under-90 respeita limite`, violating.map(f=>`${f.title}(${f.runtimeMinutes}m)`).join(', '));
    }
    if (rf === 'over-120') {
      const violating = r.recommendations.filter(rec => rec.runtimeMinutes && rec.runtimeMinutes < 120);
      assert(violating.length === 0, `Filtro over-120 respeita limite`, violating.map(f=>`${f.title}(${f.runtimeMinutes}m)`).join(', '));
    }
  } catch(e) {
    assert(false, `Filtro de duração "${rf}" funciona`, e.message);
  }
}

// Test decade filters
console.log('\n5. Stress de Filtros de Década:');
const decadeFilters = ['2020-2026', '2010-2019', '1990-1999', '1900-1969'];
for (const df of decadeFilters) {
  try {
    const r = LocalRecommender.generateLocalRecommendations({
      userProfile: profileBase, customPrompt: 'drama', filters: { decade: df }
    });
    assert(r && r.recommendations, `Filtro de década "${df}" funciona`);
    if (r.recommendations.length > 0) {
      const [start, end] = df.split('-').map(Number);
      const violating = r.recommendations.filter(rec => {
        const film = EXPANDED_FILM_DATABASE.find(f => f.slug === (rec.letterboxdSlug || rec.slug));
        return film && film.year && (film.year < start || film.year > end);
      });
      assert(violating.length === 0, `Filtro década "${df}" respeita anos`, violating.map(f=>`${f.title}(${f.year})`).join(', '));
    }
  } catch(e) {
    assert(false, `Filtro de década "${df}" funciona`, e.message);
  }
}

// Test extreme text searches
console.log('\n6. Stress de Buscas Extremas:');
const extremeSearches = [
  { q: '', label: 'busca vazia' },
  { q: '   ', label: 'só espaços' },
  { q: 'xyzxyzxyz', label: 'busca sem resultado' },
  { q: 'a'.repeat(500), label: 'string muito longa (500 chars)' },
  { q: '💀🎬🍿', label: 'emojis' },
  { q: '<script>alert(1)</script>', label: 'XSS injection attempt' },
  { q: "'; DROP TABLE films; --", label: 'SQL injection attempt' },
  { q: 'interestelar', label: 'busca simples' },
  { q: 'diretor japonês anos 70', label: 'frase longa complexa' },
  { q: 'TERROR PSICOLÓGICO', label: 'maiúsculas' },
];
for (const {q, label} of extremeSearches) {
  try {
    const r = LocalRecommender.generateLocalRecommendations({
      userProfile: profileBase, customPrompt: q, filters: {}
    });
    assert(r && Array.isArray(r.recommendations), `Busca extrema "${label}" não crasha`);
  } catch(e) {
    assert(false, `Busca extrema "${label}" não crasha`, e.message);
  }
}

// Test UserProfiler with edge cases
console.log('\n7. Stress do Profiler:');
try {
  const analyzed = UserProfiler.analyzeProfile(profileBase);
  assert(analyzed && analyzed.stats, 'analyzeProfile retorna stats');
  assert(typeof analyzed.stats.fiveStarCount === 'number', 'fiveStarCount é número');
} catch(e) { assert(false, 'analyzeProfile não crasha', e.message); }

try {
  const analyzed2 = UserProfiler.analyzeProfile({ username: 'x', films: null, favorites: null });
  assert(analyzed2 !== null && analyzed2 !== undefined, 'analyzeProfile funciona com films null');
} catch(e) { assert(false, 'analyzeProfile com films null', e.message); }

try {
  const analyzed3 = UserProfiler.analyzeProfile(null);
  assert(analyzed3 !== null, 'analyzeProfile funciona com profile null');
} catch(e) { assert(false, 'analyzeProfile com profile null', e.message); }

try {
  const bigProfile = {
    username: 'biguser',
    films: Array.from({length: 5000}, (_, i) => ({
      title: `Film ${i}`,
      slug: `film-${i}`,
      year: 1990 + (i % 35),
      rating: (i % 5) + 1
    })),
    favorites: []
  };
  const r = LocalRecommender.generateLocalRecommendations({
    userProfile: bigProfile, customPrompt: 'drama', filters: {}
  });
  assert(r && r.recommendations, 'Funciona com perfil gigante (5000 filmes)');
} catch(e) { assert(false, 'Funciona com perfil gigante (5000 filmes)', e.message); }

// Recommendations must have required fields
console.log('\n8. Validação dos Campos das Recomendações:');
try {
  const r = LocalRecommender.generateLocalRecommendations({
    userProfile: profileBase, customPrompt: 'suspense thriller', filters: {}
  });
  for (const rec of r.recommendations) {
    assert(typeof rec.title === 'string' && rec.title.length > 0, `Rec "${rec.title}" tem título`);
    assert(typeof rec.year === 'number' || rec.year === null, `Rec "${rec.title}" tem ano válido`);
    assert(typeof rec.pitch === 'string', `Rec "${rec.title}" tem pitch`);
    assert(typeof rec.letterboxdSlug === 'string', `Rec "${rec.title}" tem letterboxdSlug`);
    assert(rec.affinityReason === null || typeof rec.affinityReason === 'string', `Rec "${rec.title}" tem affinityReason válido`);
  }
} catch(e) { assert(false, 'Campos das recomendações OK', e.message); }

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Resultado dos Stress Tests: ${passed} passaram | ${failed} falharam`);
if (errors.length > 0) {
  console.log('\nProblemas encontrados:');
  errors.forEach(e => console.log(`  ❌ ${e}`));
}
console.log('='.repeat(50));
