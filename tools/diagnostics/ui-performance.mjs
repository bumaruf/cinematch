// Measures what a user feels in the built extension (dist/): popup and panel
// opening, a climate click, a search, with the service worker cold and warm.
// Synthetic CSV profile with ~940 films; long tasks are main-thread stalls.
//
//   npm run build
//   CHROMIUM_PATH=/path/to/chromium node tools/diagnostics/ui-performance.mjs [report.json]
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(repo, 'dist');
const { EXPANDED_FILM_DATABASE: films } = await import(pathToFileURL(join(repo, 'src/data/films-dataset.js')).href);
if (!films.length) throw new Error('Gere o catálogo real antes desta medição.');

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cm-perf-')), {
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  channel: 'chromium',
  ignoreDefaultArgs: ['--disable-extensions'],
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'],
});
// Every page records its long tasks from the first script on.
await context.addInitScript(() => {
  const store = /** @type {{ __longTasks: number[] }} */ (/** @type {unknown} */ (window));
  store.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) store.__longTasks.push(Math.round(entry.duration));
  }).observe({ type: 'longtask', buffered: true });
});

const report = { profileFilms: 0, steps: [] };
const step = (name, ms, extra = {}) => {
  report.steps.push({ name, ms: Math.round(ms), ...extra });
  console.log(`${name.padEnd(52)} ${String(Math.round(ms)).padStart(6)} ms ${Object.keys(extra).length ? JSON.stringify(extra) : ''}`);
};
const longTasks = (page) => page.evaluate(() => {
  const store = /** @type {{ __longTasks: number[] }} */ (/** @type {unknown} */ (window));
  const tasks = store.__longTasks;
  store.__longTasks = [];
  return tasks;
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 20000 });
  const url = (path) => `chrome-extension://${new URL(worker.url()).host}/${path}`;

  const setup = await context.newPage();
  await setup.goto(url('src/ui/pages/options/index.html'));
  const send = (action, payload) => setup.evaluate(([a, p]) => chrome.runtime.sendMessage({ action: a, payload: p }), [action, payload]);
  const cdp = await context.newCDPSession(setup);
  const stopWorkers = async () => {
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await new Promise((r) => setTimeout(r, 500));
  };

  // A history the size of a real heavy user: the most voted films, mixed ratings.
  const picked = [...films].sort((a, b) => b.imdbVotes - a.imdbVotes).slice(0, 940);
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const row = (f) => `2026-01-01,${quote(f.originalTitle)},${f.year},https://letterboxd.com/film/${f.slug}/`;
  const ratings = [5, 4.5, 4, 3.5, 3, 2.5, 2, 4, 3.5, 1];
  const imported = await send('importCsvProfile', { files: [
    { name: 'watched.csv', text: ['Date,Name,Year,Letterboxd URI', ...picked.map(row)].join('\n') },
    { name: 'ratings.csv', text: ['Date,Name,Year,Letterboxd URI,Rating', ...picked.map((f, i) => `${row(f)},${ratings[i % ratings.length]}`)].join('\n') },
  ] });
  if (!imported.ok) throw new Error(imported.error);
  report.profileFilms = imported.data.profile.filmCount;
  const payload = await setup.evaluate(async () => JSON.stringify(await chrome.runtime.sendMessage({ action: 'getActiveProfile' })).length);
  step('tamanho da resposta getActiveProfile (bytes)', 0, { bytes: payload });

  // Raw message latency, worker cold then warm.
  for (const [label, cold] of [['frio', true], ['quente', false]]) {
    if (cold) await stopWorkers();
    for (const action of ['getSettings', 'getActiveProfile']) {
      const t = performance.now(); await send(action); step(`mensagem ${action} (worker ${label})`, performance.now() - t);
    }
  }

  async function popupRun(label, cold) {
    if (cold) await stopWorkers();
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 600 });
    const t0 = performance.now();
    await popup.goto(url('src/ui/pages/popup/index.html'));
    const tDom = performance.now();
    // Ready means the profile header, or the restored results of the last session.
    await popup.waitForFunction(() => {
      const visible = (element) => element && element.offsetParent !== null;
      return visible(document.querySelector('#profileLoaded')) || visible(document.querySelector('#moviesContainer article'));
    }, null, { timeout: 30000 });
    step(`popup ${label}: HTML pronto`, tDom - t0);
    step(`popup ${label}: conteúdo visível`, performance.now() - t0, { longTasks: await longTasks(popup) });
    // A reopened popup restores the last results; start from its home view.
    if (await popup.locator('#btnNewSearch').isVisible()) await popup.click('#btnNewSearch');
    const t1 = performance.now();
    await popup.click('.chip >> nth=2');
    await popup.waitForSelector('#moviesContainer[aria-busy="false"] article', { timeout: 30000 });
    step(`popup ${label}: clima → cards`, performance.now() - t1, { longTasks: await longTasks(popup) });
    await popup.click('#btnNewSearch');
    await popup.fill('#customPromptInput', 'suspense ou ficção científica sem terror até 1h40');
    const t2 = performance.now();
    await popup.click('#btnGenerateCustom');
    await popup.waitForSelector('#moviesContainer[aria-busy="false"] article', { timeout: 30000 });
    step(`popup ${label}: busca composta → cards`, performance.now() - t2, { longTasks: await longTasks(popup) });
    await popup.close();
  }
  await popupRun('frio', true);
  await popupRun('quente', false);

  // A person looks at the popup before clicking; the warm-up uses that time.
  {
    await stopWorkers();
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 400, height: 600 });
    await popup.goto(url('src/ui/pages/popup/index.html'));
    await popup.waitForTimeout(1500);
    if (await popup.locator('#btnNewSearch').isVisible()) await popup.click('#btnNewSearch');
    const t = performance.now();
    await popup.click('.chip >> nth=4');
    await popup.waitForSelector('#moviesContainer[aria-busy="false"] article', { timeout: 30000 });
    step('popup frio: clima → cards, 1,5 s após abrir', performance.now() - t, { longTasks: await longTasks(popup) });
    await popup.close();
  }

  async function dashboardRun(label, cold) {
    if (cold) await stopWorkers();
    const dashboard = await context.newPage();
    await dashboard.setViewportSize({ width: 1280, height: 860 });
    const t0 = performance.now();
    await dashboard.goto(url('src/ui/pages/dashboard/index.html'));
    await dashboard.waitForSelector('#dashDailyRecHero:not(.hidden)', { timeout: 30000 });
    step(`painel ${label}: filme do dia visível`, performance.now() - t0, { longTasks: await longTasks(dashboard) });
    const t1 = performance.now();
    await dashboard.click('#dashThemesGrid [data-theme-id] >> nth=0');
    await dashboard.waitForSelector('#dashMoviesGrid article', { timeout: 30000 });
    step(`painel ${label}: clima → grade`, performance.now() - t1, { longTasks: await longTasks(dashboard) });
    const t2 = performance.now();
    await dashboard.click('.nav-item[data-tab="dna"]');
    await dashboard.waitForTimeout(50);
    await dashboard.click('.nav-item[data-tab="history"]');
    await dashboard.waitForTimeout(50);
    await dashboard.click('.nav-item[data-tab="curator"]');
    step(`painel ${label}: troca de abas`, performance.now() - t2, { longTasks: await longTasks(dashboard) });
    await dashboard.close();
  }
  await dashboardRun('frio', true);
  await dashboardRun('quente', false);

  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
} finally {
  await context.close();
}
