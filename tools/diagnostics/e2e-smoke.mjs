// End-to-end smoke test of the built extension (dist/): loads it in Chromium,
// imports a CSV profile through the real message contract, exercises every
// feature without network access to Letterboxd and screenshots the pages.
//
//   npm run e2e                     # needs a Chromium build (not branded Chrome,
//   CHROMIUM_PATH=/path/to/chrome   # which no longer loads unpacked extensions
//                                   # from the command line)
import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(repo, 'dist');
const shots = process.argv[2] ?? join(tmpdir(), 'cinematch-e2e');
mkdirSync(shots, { recursive: true });
const { EXPANDED_FILM_DATABASE: films } = await import(join(repo, 'src/data/films-dataset.js'));

const executablePath = process.env.CHROMIUM_PATH || chromium.executablePath();
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cm-')), {
  executablePath,
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'],
});

const problems = [];
const watch = (page, name) => {
  page.on('pageerror', (error) => problems.push(`${name} pageerror: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && problems.push(`${name} console: ${message.text()}`));
};

let [worker] = context.serviceWorkers();
worker ??= await context.waitForEvent('serviceworker', { timeout: 20000 });
const extensionId = new URL(worker.url()).host;
worker.on('console', (message) => message.type() === 'error' && problems.push(`worker console: ${message.text()}`));
console.log('extension id:', extensionId);

const url = (path) => `chrome-extension://${extensionId}/${path}`;
const dashboard = await context.newPage();
watch(dashboard, 'dashboard');
await dashboard.goto(url('src/ui/pages/dashboard/index.html'));
await dashboard.waitForTimeout(800);

const send = (action, payload) => dashboard.evaluate(([a, p]) => chrome.runtime.sendMessage({ action: a, payload: p }), [action, payload]);
const check = (label, condition, detail = '') => {
  console.log(`${condition ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) problems.push(`check failed: ${label} ${detail}`);
};

check('sem perfil no início', (await send('getActiveProfile')).data === null);

// A liked history: well-rated films by a few directors, with ratings from 1 to 5.
const byDirector = new Map();
for (const film of films) if (film.imdbVotes > 200000) byDirector.set(film.director, [...(byDirector.get(film.director) ?? []), film]);
const directors = [...byDirector.entries()].filter(([, list]) => list.length >= 5).slice(0, 12);
const picked = directors.flatMap(([, list]) => list.slice(0, 5));
const ratings = [5, 4.5, 4, 3, 1.5];
const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const watched = ['Date,Name,Year,Letterboxd URI', ...picked.map((f) => `2026-01-01,${quote(f.originalTitle)},${f.year},https://letterboxd.com/film/${f.slug}/`)].join('\n');
const rated = ['Date,Name,Year,Letterboxd URI,Rating', ...picked.map((f, i) => `2026-01-01,${quote(f.originalTitle)},${f.year},https://letterboxd.com/film/${f.slug}/,${ratings[i % 5]}`)].join('\n');

const imported = await send('importCsvProfile', { files: [{ name: 'watched.csv', text: watched }, { name: 'ratings.csv', text: rated }] });
check('importa CSV', imported.ok && imported.data.profile.films.length === picked.length, imported.ok ? `${imported.data.profile.films.length} filmes, autoritativo=${imported.data.authoritative}` : imported.error);

const theme = await send('generateRecommendations', { themeId: 'mindfuck-broken-reality', customPrompt: '', filters: {} });
check('recomenda por tema', theme.ok && theme.data.recommendations.length > 0, theme.ok ? theme.data.recommendations.map((r) => r.title).join(', ') : theme.error);
const watchedSlugs = new Set(picked.map((f) => f.slug));
check('não recomenda assistidos', theme.ok && theme.data.recommendations.every((r) => !watchedSlugs.has(r.letterboxdSlug)));

const search = await send('generateRecommendations', { themeId: null, customPrompt: 'terror anos 80', filters: { runtimeFilter: 'under-120' } });
check('busca em texto', search.ok && search.data.recommendations.length > 0, search.ok ? search.data.recommendations.map((r) => `${r.title} (${r.year}, ${r.runtimeMinutes}min)`).join(', ') : search.error);

const general = await send('generateRecommendations', {});
check('curadoria geral sem tema nem busca', general.ok, general.ok ? `${general.data.recommendations.length} filmes` : general.error);

const daily = await send('getDailyPick', { refresh: true });
check('filme do dia', daily.ok && Boolean(daily.data.data.film.title), daily.ok ? `${daily.data.data.film.title} — ${daily.data.data.curatorReason}` : daily.error);
const cached = await send('getDailyPick', {});
check('filme do dia em cache', cached.ok && cached.data.data.film.letterboxdSlug === daily.data.data.film.letterboxdSlug);

const film = theme.data.recommendations[0];
const saved = await send('toggleSavedFilm', film);
check('salva filme', saved.ok && saved.data.isSaved);
const list = await send('listSavedFilms');
check('lista salvos', list.ok && list.data.length === 1 && list.data[0].title === film.title);
const history = await send('listHistory');
check('histórico registrado', history.ok && history.data.length === 3, history.ok ? `${history.data.length} sessões` : history.error);
const settings = await send('updateSettings', { minVotes: 50000, avoidWatched: false });
check('atualiza configurações', settings.ok && settings.data.minVotes === 50000 && settings.data.avoidWatched === false);
const invalid = await dashboard.evaluate(() => chrome.runtime.sendMessage({ action: 'TEST_API_KEY', payload: {} }).catch((e) => `erro: ${e.message}`));
check('ação desconhecida é ignorada', invalid === undefined || String(invalid).startsWith('erro'), String(invalid));

// Pages render with the imported profile.
await dashboard.reload();
await dashboard.waitForTimeout(1500);
await dashboard.screenshot({ path: `${shots}/dashboard.png`, fullPage: false });
check('dashboard mostra o perfil', (await dashboard.textContent('#sideDisplayName'))?.trim() === 'Cinéfilo');
await dashboard.click('.nav-item[data-tab="dna"]');
await dashboard.waitForTimeout(300);
check('aba DNA preenchida', Number(await dashboard.textContent('#dnaTotalFilms')) === picked.length);
await dashboard.screenshot({ path: `${shots}/dna.png` });
await dashboard.click('.nav-item[data-tab="saved"]');
await dashboard.waitForTimeout(500);
check('aba salvos', (await dashboard.locator('#dashSavedContainer article').count()) === 1);

const popup = await context.newPage();
watch(popup, 'popup');
await popup.setViewportSize({ width: 440, height: 600 });
await popup.goto(url('src/ui/pages/popup/index.html'));
await popup.waitForTimeout(800);
check('popup mostra o perfil', !(await popup.locator('#profileLoaded').getAttribute('class'))?.includes('hidden'));
await popup.click('.chip >> nth=0');
await popup.waitForSelector('#moviesContainer article', { timeout: 15000 });
await popup.waitForTimeout(1500);
check('popup gera recomendações', (await popup.locator('#moviesContainer article').count()) > 0, `${await popup.locator('#moviesContainer article').count()} cards`);
await popup.screenshot({ path: `${shots}/popup.png` });

const options = await context.newPage();
watch(options, 'options');
await options.goto(url('src/ui/pages/options/index.html'));
await options.waitForTimeout(800);
check('opções refletem configurações', (await options.isChecked('#avoidWatched')) === false);
await options.screenshot({ path: `${shots}/options.png` });

await context.close();
// Remote images (TMDB) may be unreachable in this sandbox; they are not app errors.
const relevant = problems.filter((p) => !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR/.test(p));
console.log(relevant.length ? `\nPROBLEMAS:\n${relevant.join('\n')}` : '\nSem erros de página, console ou worker.');
console.log(`Screenshots: ${shots}`);
process.exit(relevant.length ? 1 : 0);
