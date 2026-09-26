import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Controllers look elements up with byId(), which throws when the page's HTML
// lacks one, stopping the whole page. Catch that before the browser does.

const PAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/ui/pages');

for (const page of readdirSync(PAGES)) {
  test(`${page}: every element the controller needs exists in index.html`, () => {
    const html = readFileSync(join(PAGES, page, 'index.html'), 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const required = readdirSync(join(PAGES, page))
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) => [...readFileSync(join(PAGES, page, file), 'utf8').matchAll(/byId(?:<[^>]+>)?\('([^']+)'\)/g)].map((match) => match[1]));
    expect(required.length).toBeGreaterThan(0);
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
  });

  test(`${page}: index.html loads its TypeScript controller`, () => {
    const html = readFileSync(join(PAGES, page, 'index.html'), 'utf8');
    expect(html).toMatch(new RegExp(`<script type="module" src="\\./${page}\\.ts"></script>`));
  });
}
