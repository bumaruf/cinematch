import type { Plugin } from 'vite';

const DATASET = /[\\/]src[\\/]data[\\/]films-dataset\.js$/;

/** The films and provenance of a films-dataset.js written by tools/catalog. */
export function parseDataset(text: string): { films: unknown[]; source: string | undefined } {
  const start = text.indexOf('[', text.search(/EXPANDED_FILM_DATABASE\s*=/));
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('films-dataset.js sem EXPANDED_FILM_DATABASE.');
  const source = /CATALOG_SOURCE\s*=\s*"([^"]*)"/.exec(text.slice(end))?.[1];
  return { films: JSON.parse(text.slice(start, end + 1)) as unknown[], source };
}

/**
 * The real catalog is tens of MB of JavaScript, more than Vitest's module
 * transform accepts. In tests the dataset module reads the file and parses
 * its JSON array instead, so Vite only transforms these few lines.
 */
export function testDataset(): Plugin {
  return {
    name: 'cinematch-test-dataset',
    enforce: 'pre',
    load(id) {
      const path = id.split('?')[0];
      if (!DATASET.test(path)) return null;
      // Resolved relative to src/data/films-dataset.js.
      return `import { readFileSync } from 'node:fs';
import { parseDataset } from '../../tools/build/test-dataset.ts';
const dataset = parseDataset(readFileSync(${JSON.stringify(path)}, 'utf8'));
export const EXPANDED_FILM_DATABASE = dataset.films;
export const CATALOG_SOURCE = dataset.source;
`;
    },
  };
}
