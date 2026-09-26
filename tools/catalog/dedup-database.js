import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Remove title+year duplicates (keep the first one)
const seen = new Set();
const deduped = [];
let removed = 0;

for (const film of EXPANDED_FILM_DATABASE) {
  const key = (film.title + '|' + film.year).toLowerCase();
  if (seen.has(key)) {
    console.log('Removing duplicate:', film.title, '(' + film.year + ')', 'slug:', film.slug);
    removed++;
    continue;
  }
  seen.add(key);
  deduped.push(film);
}

console.log('Removed ' + removed + ' title+year duplicates');
console.log('Final count: ' + deduped.length + ' unique films');

const outputPath = resolve(__dirname, '..', '..', 'src', 'data', 'films-dataset.js');
const header = `/**
 * Letterboxd AI Curator - Complete Real Film Database
 * ${deduped.length} curated real films spanning all decades, genres, countries, and themes.
 * Auto-generated — DO NOT EDIT MANUALLY.
 */

export const EXPANDED_FILM_DATABASE = `;

const content = header + JSON.stringify(deduped, null, 2) + ';\n';
writeFileSync(outputPath, content, 'utf-8');
console.log('Written to ' + outputPath);
