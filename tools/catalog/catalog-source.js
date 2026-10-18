// Provenance of src/data/films-dataset.js. Only a catalog built from Wikidata
// (CC0) may be packaged for the Chrome Web Store; tools that keep its
// provenance write the marker again, others drop it, and tools/package.js
// then refuses to package.

export const PUBLISHABLE_SOURCE = 'wikidata';

/** The dataset's CATALOG_SOURCE, or '' when it has none. */
export async function readCatalogSource() {
  const dataset = await import('../../src/data/films-dataset.js').catch(() => null);
  return typeof dataset?.CATALOG_SOURCE === 'string' ? dataset.CATALOG_SOURCE : '';
}

/** The line that records the provenance at the end of the dataset file. */
export function catalogSourceLine(source) {
  return source ? `\nexport const CATALOG_SOURCE = ${JSON.stringify(source)};\n` : '';
}

/**
 * The films as a JSON array with one film per line: much smaller than an
 * indented array, and still readable in diffs.
 * @param {readonly unknown[]} films
 */
export function filmRows(films) {
  return films.length ? `[\n${films.map((film) => `  ${JSON.stringify(film)}`).join(',\n')}\n]` : '[]';
}
