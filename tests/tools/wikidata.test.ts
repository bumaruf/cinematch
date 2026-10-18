import { describe, expect, test } from 'vitest';
import { normalizeCatalogFilm } from '../../src/domain/catalog/catalog.ts';
import { selectCatalogCandidates } from '../../tools/catalog/selection.js';
import {
  buildFilm, canonicalGenres, candidatesQuery, countryName, DETAIL_QUERIES, filmKeyword, groupByFilm, localizedLabelsQuery, parseCandidates, parseRows,
  pitchFromArticle, runtimeMinutes, sitelinkScore,
} from '../../tools/catalog/wikidata.js';

const binding = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { type: 'literal', value }]));
const results = (...rows: Record<string, string>[]) => ({ results: { bindings: rows.map(binding) } });
const entity = (id: string) => `http://www.wikidata.org/entity/${id}`;

describe('Wikidata catalog import', () => {
  test('the candidate query keeps feature films with an IMDb id in the requested years', () => {
    const query = candidatesQuery({ fromYear: 1970, toYear: 1972, minSitelinks: 3 });
    expect(query).toContain('wdt:P31 wd:Q11424');
    expect(query).toContain('wdt:P345 ?imdb');
    expect(query).toContain('YEAR(?date) >= 1970 && YEAR(?date) <= 1972');
    expect(query).toContain('?links >= 3');
    expect(query).toContain('FILTER NOT EXISTS { ?film wdt:P31 wd:Q24862 }');
    expect(DETAIL_QUERIES.labels(['Q1', 'Q2'])).toContain('VALUES ?film { wd:Q1 wd:Q2 }');
  });

  test('candidates are parsed, and rows without a valid id or year are dropped', () => {
    const parsed = parseCandidates(results(
      { film: entity('Q47703'), imdbId: 'tt0068646', year: '1972', sitelinks: '120', genres: 'Q130232 Q959790', classes: 'Q11424' },
      { film: entity('Q1'), imdbId: 'nm0000001', year: '1972', sitelinks: '5', genres: '', classes: '' },
      { film: entity('Q2'), imdbId: 'tt0000002', year: '', sitelinks: '5', genres: '', classes: '' },
    ));
    expect(parsed).toEqual([{ id: 'Q47703', imdbId: 'tt0068646', year: 1972, sitelinks: 120, genreIds: ['Q130232', 'Q959790'], classIds: ['Q11424'] }]);
  });

  test('genre and class labels map to the canonical genres the engine uses', () => {
    expect(canonicalGenres(['drama film', 'crime film'])).toEqual(['Crime', 'Drama']);
    expect(canonicalGenres(['romantic comedy', 'comedy-drama'])).toEqual(['Comedy', 'Drama', 'Romance']);
    expect(canonicalGenres(['science fiction film', 'dystopian film', 'cyberpunk'])).toEqual(['Sci-Fi']);
    expect(canonicalGenres(['animated feature film', 'film based on literature', 'LGBT-related film'])).toEqual(['Animation']);
    expect(canonicalGenres(['film noir'])).toEqual(['Film-Noir']);
    expect(canonicalGenres(['live-action animated film', 'action film'])).toEqual(['Action', 'Animation']);
    expect(canonicalGenres(['live-action film'])).toEqual([]);
    expect(canonicalGenres(['neo-noir'])).toEqual(['Crime']);
    expect(canonicalGenres(['anti-war film', 'western film', 'spaghetti western'])).toEqual(['War', 'Western']);
    expect(canonicalGenres(['biographical film', 'historical film', 'sports film', 'musical film', 'concert film'])).toEqual(['Biography', 'History', 'Music', 'Musical', 'Sport']);
  });

  test('country names follow the catalog spelling', () => {
    expect(countryName("People's Republic of China")).toBe('China');
    expect(countryName('West Germany')).toBe('Germany');
    expect(countryName('Brazil')).toBe('Brazil');
    expect(countryName('Alemanha Ocidental')).toBe('Alemanha');
    expect(countryName('Estados Unidos')).toBe('Estados Unidos');
  });

  test('countries, subjects and genre keywords use Portuguese labels, else English', () => {
    const query = DETAIL_QUERIES.countryLabels(['Q1']);
    expect(query).toContain('"pt-br"');
    expect(query).toContain('COALESCE(?ptBr, ?pt, ?en)');
    expect(localizedLabelsQuery(['Q2'])).toContain('VALUES ?film { wd:Q2 }');
    expect(filmKeyword('filme de terror psicológico')).toBe('terror psicológico');
    expect(filmKeyword('filme')).toBe('');
  });

  test('the main runtime ignores short versions and longer cuts', () => {
    expect(runtimeMinutes([10_500, 9_000, 1_200])).toBe(150);
    expect(runtimeMinutes([1_500])).toBe(25);
    expect(runtimeMinutes([])).toBe(0);
  });

  test('the synopsis comes from the plot section, or else from the lead', () => {
    const article = [
      'O Poderoso Chefão é um filme norte-americano de 1972 dirigido por Francis Ford Coppola.',
      '',
      '== Enredo ==',
      'Em 1945, Don Vito Corleone, chefe de uma família mafiosa de Nova York, recebe pedidos no casamento da filha. Seu filho Michael, herói de guerra, mantém distância dos negócios. Um atentado muda tudo. Michael assume o lugar do pai.',
      '',
      '== Elenco ==',
      'Marlon Brando como Vito Corleone.',
    ].join('\n');
    expect(pitchFromArticle(article)).toBe('Em 1945, Don Vito Corleone, chefe de uma família mafiosa de Nova York, recebe pedidos no casamento da filha. Seu filho Michael, herói de guerra, mantém distância dos negócios. Um atentado muda tudo.');
    expect(pitchFromArticle('Um filme brasileiro de 2002 sobre a vida na Cidade de Deus, no Rio de Janeiro.[1]\n\n== Elenco ==\nAlguém'))
      .toBe('Um filme brasileiro de 2002 sobre a vida na Cidade de Deus, no Rio de Janeiro.');
    expect(pitchFromArticle('Curto.')).toBe('');
  });

  test('a film record carries Wikidata facts, the Letterboxd slug when known and no IMDb score', () => {
    const candidate = { id: 'Q47703', imdbId: 'tt0068646', year: 1972, sitelinks: 120, genreIds: ['Q130232', 'Q959790'], classIds: ['Q11424'] };
    const genreLabels = new Map([['Q130232', 'drama film'], ['Q959790', 'gangster film'], ['Q11424', 'film']]);
    const rows = parseRows(results(
      { film: entity('Q47703'), lang: 'pt-br', label: 'O Poderoso Chefão' },
      { film: entity('Q47703'), lang: 'en', label: 'The Godfather' },
    ));
    const details = {
      labels: groupByFilm(rows).get('Q47703'),
      originalTitle: [{ film: 'Q47703', label: 'The Godfather' }],
      directors: [{ film: 'Q47703', label: 'Francis Ford Coppola', links: 90 }, { film: 'Q47703', label: 'Uncredited', links: 1 }],
      durations: [{ film: 'Q47703', seconds: 10_500 }],
      countryLabels: [{ film: 'Q47703', label: 'Estados Unidos' }],
      languages: [{ film: 'Q47703', label: 'en' }],
      letterboxd: [{ film: 'Q47703', label: 'the-godfather' }],
      subjectTerms: [
        { film: 'Q47703', en: 'organized crime', label: 'crime organizado' },
        { film: 'Q47703', en: 'crime drama', label: 'crime drama' },
        { film: 'Q47703', en: 'Q123' },
      ],
    };
    const localized = new Map([['Q959790', 'filme de gângster']]);
    const film = buildFilm(candidate, details, genreLabels, 'Uma sinopse real da Wikipédia, longa o bastante.', localized);
    expect(film).toMatchObject({
      title: 'The Godfather', originalTitle: 'The Godfather', year: 1972, director: 'Francis Ford Coppola', slug: 'the-godfather',
      runtime: 175, runtimeKnown: true, country: 'Estados Unidos', originalLanguage: 'en', imdbId: 'tt0068646',
      imdbRating: 0, imdbVotes: 0, genres: ['Crime', 'Drama'], pitch: 'Uma sinopse real da Wikipédia, longa o bastante.',
    });
    expect(film!.keywordEvidence!.find(entry => entry.term === 'drama')?.source).toBe('genre');
    // Wikidata's specific labels are shown in Portuguese (from Wikidata, else a
    // short dictionary); the English form still feeds theme matching.
    expect(film!.keywordEvidence!.filter(entry => entry.source === 'film' || entry.source === 'film-en')).toEqual([
      { term: 'gângster', source: 'film' }, { term: 'gangster', source: 'film-en' },
      { term: 'crime organizado', source: 'film' }, { term: 'organized crime', source: 'film-en' },
      { term: 'drama policial', source: 'film' }, { term: 'crime drama', source: 'film-en' },
    ]);
    // Letterboxd's English title matches the user's history; the Brazilian one stays searchable.
    expect(film!.keywords).toContain('o poderoso chefão');
    expect(normalizeCatalogFilm(film!).country).toBe('Estados Unidos');
  });

  test('without a Letterboxd id the slug comes from the English title; shorts and untitled films are skipped', () => {
    const candidate = { id: 'Q1', imdbId: 'tt1', year: 2001, sitelinks: 4, genreIds: [], classIds: [] };
    const labels = [{ film: 'Q1', lang: 'en', label: 'Amélie' }];
    expect(buildFilm(candidate, { labels }, new Map(), '')).toMatchObject({ slug: 'amelie', title: 'Amélie', director: 'Diretor Desconhecido', country: 'Internacional' });
    expect(buildFilm(candidate, { labels }, new Map(), '')?.pitch).toMatch(/^Um dos grandes marcos/);
    expect(buildFilm(candidate, { labels, durations: [{ film: 'Q1', seconds: 600 }] }, new Map(), '')).toBeNull();
    expect(buildFilm(candidate, {}, new Map(), '')).toBeNull();
  });

  test('selection by sitelinks keeps each period represented', () => {
    const movies = [
      ...Array.from({ length: 15 }, (_, i) => ({ tconst: `tt-old-${i}`, year: 1900, genres: ['Drama'], sitelinks: 3 + i })),
      ...Array.from({ length: 30 }, (_, i) => ({ tconst: `tt-new-${i}`, year: 2020, genres: ['Action'], sitelinks: 100 + i })),
    ];
    const selected = selectCatalogCandidates(movies, 20, 2026, sitelinkScore);
    expect(selected.filter(movie => movie.year === 1900)).toHaveLength(10);
    expect(selected[0].tconst).toBe('tt-old-14');
  });
});
