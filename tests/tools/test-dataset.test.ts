import { describe, expect, it } from 'vitest';
import { filmRows } from '../../tools/catalog/catalog-source.js';
import { parseDataset } from '../../tools/build/test-dataset.ts';

describe('parseDataset', () => {
  it('reads the films and provenance the catalog tools write', () => {
    const films = [{ id: 'a', title: 'A [1]' }, { id: 'b', title: 'B' }];
    const text = `/** header [x] */\n\nexport const EXPANDED_FILM_DATABASE = ${filmRows(films)};\n\nexport const CATALOG_SOURCE = "wikidata";\n`;
    expect(parseDataset(text)).toEqual({ films, source: 'wikidata' });
  });

  it('reads the empty stub without provenance', () => {
    expect(parseDataset('// stub\nexport const EXPANDED_FILM_DATABASE = [];\n')).toEqual({ films: [], source: undefined });
  });
});
