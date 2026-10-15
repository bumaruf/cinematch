// Regenerates the README screenshots (docs/screenshots) from the built
// extension: a synthetic CSV profile, no personal data, real catalog posters.
//
//   npm run build
//   CHROMIUM_PATH=/path/to/chromium npm run screenshots
//
// Like e2e-smoke, it needs a browser that loads unpacked extensions from the
// command line: a Chromium build or Microsoft Edge, not branded Chrome.
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(repo, 'dist');
const out = process.argv[2] ?? join(repo, 'docs/screenshots');
const { EXPANDED_FILM_DATABASE: films } = await import(pathToFileURL(join(repo, 'src/data/films-dataset.js')).href);
if (!films.length) throw new Error('Gere o catálogo real antes das screenshots.');

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cm-shots-')), {
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  channel: 'chromium',
  ignoreDefaultArgs: ['--disable-extensions'],
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'],
  viewport: { width: 1280, height: 860 },
});

/** Lets posters (TMDB) and fonts finish before a capture. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 20000 });
  const url = (path) => `chrome-extension://${new URL(worker.url()).host}/${path}`;

  const dashboard = await context.newPage();
  await dashboard.goto(url('src/ui/pages/dashboard/index.html'));
  await dashboard.waitForTimeout(800);
  const send = (action, payload) => dashboard.evaluate(([a, p]) => chrome.runtime.sendMessage({ action: a, payload: p }), [action, payload]);

  // A taste profile: popular films by a dozen directors, mostly well rated.
  const byDirector = new Map();
  for (const film of films) if (film.imdbVotes > 200000) byDirector.set(film.director, [...(byDirector.get(film.director) ?? []), film]);
  const picked = [...byDirector.values()].filter((list) => list.length >= 5).slice(0, 12).flatMap((list) => list.slice(0, 5));
  const ratings = [5, 4.5, 4, 4.5, 3.5];
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const row = (f) => `2026-01-01,${quote(f.originalTitle)},${f.year},https://letterboxd.com/film/${f.slug}/`;
  const imported = await send('importCsvProfile', { files: [
    { name: 'watched.csv', text: ['Date,Name,Year,Letterboxd URI', ...picked.map(row)].join('\n') },
    { name: 'ratings.csv', text: ['Date,Name,Year,Letterboxd URI,Rating', ...picked.map((f, i) => `${row(f)},${ratings[i % ratings.length]}`)].join('\n') },
  ] });
  if (!imported.ok) throw new Error(imported.error);
  await send('getDailyPick', { refresh: true });

  // Painel: the daily pick and the climate picker.
  await dashboard.reload();
  await settle(dashboard);
  await dashboard.screenshot({ path: join(out, 'dashboard.png') });

  // Resultados: a climate's poster grid.
  const themeId = 'mindfuck-broken-reality';
  for (const collection of await dashboard.locator('#dashThemesGrid [aria-pressed]:not([data-theme-id])').all()) {
    if (await dashboard.locator(`[data-theme-id="${themeId}"]`).count()) break;
    await collection.click();
  }
  await dashboard.click(`[data-theme-id="${themeId}"]`);
  await dashboard.waitForSelector('#dashMoviesGrid article', { timeout: 20000 });
  await dashboard.locator('#dashResultsArea').evaluate((area) => area.scrollIntoView({ block: 'start' }));
  await settle(dashboard);
  await dashboard.screenshot({ path: join(out, 'resultados.png') });

  // Seu perfil.
  await dashboard.click('.nav-item[data-tab="dna"]');
  // The results capture scrolled the page; the profile starts at its header.
  await dashboard.evaluate(() => {
    window.scrollTo(0, 0);
    for (const element of document.querySelectorAll('*')) if (element.scrollTop) element.scrollTop = 0;
  });
  await settle(dashboard);
  await dashboard.screenshot({ path: join(out, 'perfil.png') });

  // Popup: a climate's list.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.goto(url('src/ui/pages/popup/index.html'));
  await popup.waitForSelector('#profileLoaded:not(.hidden)');
  await popup.click('.chip >> nth=1');
  await popup.waitForSelector('#moviesContainer article', { timeout: 20000 });
  await settle(popup);
  await popup.screenshot({ path: join(out, 'popup.png') });

  // Configurações.
  const options = await context.newPage();
  await options.goto(url('src/ui/pages/options/index.html'));
  await settle(options);
  await options.screenshot({ path: join(out, 'options.png') });

  console.log(`Screenshots em ${out}`);
} finally {
  await context.close();
}
