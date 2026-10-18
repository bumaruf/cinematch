// Pure helpers for the Wikidata catalog importer (import-wikidata.js): SPARQL
// queries, result parsing, genre mapping and film records. Wikidata is CC0, so
// the catalog built from it can ship in the extension. Synopses come from
// Wikipedia (CC BY-SA 4.0, credited in the panel's "Fontes dos dados").

export const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
export const WIKIPEDIA_API = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

/** Not feature films for the catalog: short films, TV films, TV episodes; pornographic films. */
const EXCLUDED_CLASSES = ['Q24862', 'Q506240', 'Q21191270'];
const EXCLUDED_GENRES = ['Q185529'];

/**
 * Feature films with an IMDb id first released in [fromYear, toYear], with
 * their sitelink count (how many Wikipedias cover them: the popularity
 * signal), genres and classes. Split by years so each query stays fast.
 */
export function candidatesQuery({ fromYear, toYear, minSitelinks }) {
  return `SELECT ?film (SAMPLE(?imdb) AS ?imdbId) (MIN(YEAR(?date)) AS ?year) (SAMPLE(?links) AS ?sitelinks)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?genre), "entity/"); separator=" ") AS ?genres)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?class), "entity/"); separator=" ") AS ?classes)
WHERE {
  ?film wdt:P31 wd:Q11424; wdt:P345 ?imdb; wdt:P577 ?date; wikibase:sitelinks ?links.
  FILTER(?links >= ${Number(minSitelinks)} && STRSTARTS(?imdb, "tt"))
  FILTER(YEAR(?date) >= ${Number(fromYear)} && YEAR(?date) <= ${Number(toYear)})
  ${EXCLUDED_CLASSES.map((id) => `FILTER NOT EXISTS { ?film wdt:P31 wd:${id} }`).join('\n  ')}
  ${EXCLUDED_GENRES.map((id) => `FILTER NOT EXISTS { ?film wdt:P136 wd:${id} }`).join('\n  ')}
  OPTIONAL { ?film wdt:P136 ?genre }
  OPTIONAL { ?film wdt:P31 ?class }
}
GROUP BY ?film`;
}

const entityId = (uri) => String(uri ?? '').split('/').pop();
const value = (binding, name) => binding?.[name]?.value;

export function parseCandidates(json) {
  return (json?.results?.bindings ?? []).flatMap((binding) => {
    const id = entityId(value(binding, 'film'));
    const imdbId = value(binding, 'imdbId');
    const year = Number(value(binding, 'year'));
    if (!/^Q\d+$/.test(id) || !/^tt\d+$/.test(imdbId ?? '') || !Number.isInteger(year) || year < 1870) return [];
    const ids = (name) => String(value(binding, name) ?? '').split(' ').filter((item) => /^Q\d+$/.test(item));
    return [{ id, imdbId, year, sitelinks: Number(value(binding, 'sitelinks')) || 0, genreIds: ids('genres'), classIds: ids('classes') }];
  });
}

const values = (ids) => `VALUES ?film { ${ids.map((id) => `wd:${id}`).join(' ')} }`;

/**
 * The entity's Brazilian Portuguese label, else Portuguese, else English: the
 * panel shows countries and themes in Portuguese where Wikidata has them.
 */
function portugueseLabel(entity) {
  return `OPTIONAL { ${entity} rdfs:label ?ptBr. FILTER(LANG(?ptBr) = "pt-br") }
  OPTIONAL { ${entity} rdfs:label ?pt. FILTER(LANG(?pt) = "pt") }
  OPTIONAL { ${entity} rdfs:label ?en. FILTER(LANG(?en) = "en") }
  BIND(COALESCE(?ptBr, ?pt, ?en) AS ?label) FILTER(BOUND(?label))`;
}

/** One query per property keeps results flat: no cross product of optional values. */
export const DETAIL_QUERIES = {
  labels: (ids) => `SELECT ?film ?lang ?label WHERE { ${values(ids)}
  ?film rdfs:label ?label. BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("pt-br", "pt", "en")) }`,
  originalTitle: (ids) => `SELECT ?film ?label WHERE { ${values(ids)} ?film wdt:P1476 ?label. }`,
  directors: (ids) => `SELECT ?film ?label ?links WHERE { ${values(ids)}
  ?film wdt:P57 ?director. ?director rdfs:label ?label; wikibase:sitelinks ?links. FILTER(LANG(?label) = "en") }`,
  durations: (ids) => `SELECT ?film ?seconds WHERE { ${values(ids)}
  ?film p:P2047 ?statement. ?statement psn:P2047/wikibase:quantityAmount ?seconds; wikibase:rank ?rank.
  FILTER(?rank != wikibase:DeprecatedRank) }`,
  countryLabels: (ids) => `SELECT ?film ?label WHERE { ${values(ids)} ?film wdt:P495 ?country. ${portugueseLabel('?country')} }`,
  languages: (ids) => `SELECT ?film ?label WHERE { ${values(ids)} ?film wdt:P364/wdt:P218 ?label. }`,
  // English label (theme matching) and Portuguese one (shown) of each subject.
  subjectTerms: (ids) => `SELECT ?film ?en ?label WHERE { ${values(ids)}
  ?film wdt:P921 ?subject. ?subject rdfs:label ?en. FILTER(LANG(?en) = "en")
  OPTIONAL { ?subject rdfs:label ?ptBr. FILTER(LANG(?ptBr) = "pt-br") }
  OPTIONAL { ?subject rdfs:label ?pt. FILTER(LANG(?pt) = "pt") }
  BIND(COALESCE(?ptBr, ?pt) AS ?label) }`,
  letterboxd: (ids) => `SELECT ?film ?label WHERE { ${values(ids)} ?film wdt:P6127 ?label. }`,
  articles: (ids) => `SELECT ?film ?lang ?label WHERE { ${values(ids)}
  ?article schema:about ?film; schema:isPartOf ?site; schema:name ?label.
  VALUES (?site ?lang) { (<https://pt.wikipedia.org/> "pt") (<https://en.wikipedia.org/> "en") } }`,
};

/** Detail queries a checkpoint written before localized labels already holds for every film. */
export const LEGACY_DETAILS = ['labels', 'originalTitle', 'directors', 'durations', 'countries', 'languages', 'subjects', 'letterboxd', 'articles'];

export function entityLabelsQuery(ids) {
  return `SELECT ?film ?label WHERE { ${values(ids)} ?film rdfs:label ?label. FILTER(LANG(?label) = "en") }`;
}

/** Portuguese labels of entities (genres), with the English one as fallback. */
export function localizedLabelsQuery(ids) {
  return `SELECT ?film ?label WHERE { ${values(ids)} ${portugueseLabel('?film')} }`;
}

/** Rows of a detail query as { film, label, en, lang, links, seconds }. */
export function parseRows(json) {
  return (json?.results?.bindings ?? []).map((binding) => ({
    film: entityId(value(binding, 'film')),
    label: value(binding, 'label'),
    en: value(binding, 'en'),
    lang: value(binding, 'lang'),
    links: Number(value(binding, 'links')) || 0,
    seconds: Number(value(binding, 'seconds')),
  }));
}

/**
 * @type {[RegExp, string[]][]}
 * English genre or class labels mapped to the catalog's canonical genres
 * (the IMDb names the engine already uses). Labels with no rule are ignored.
 */
const GENRE_RULES = [
  [/documentar/, ['Documentary']],
  [/\banimat|\banime\b|stop-motion/, ['Animation']],
  [/science fiction|sci-fi|dystopi|cyberpunk|space opera/, ['Sci-Fi']],
  [/horror|slasher|zombie|splatter/, ['Horror']],
  [/thriller|\bspy\b|espionage/, ['Thriller']],
  [/crime|gangster|heist|neo-noir|police procedural|mafia/, ['Crime']],
  [/^film noir$/, ['Film-Noir']],
  [/myster|whodunit|detective/, ['Mystery']],
  [/comed|satir|parod|slapstick/, ['Comedy']],
  [/drama/, ['Drama']],
  [/romanc|romantic/, ['Romance']],
  [/\bwar film|\bwar drama|anti-war/, ['War']],
  [/western/, ['Western']],
  [/musical/, ['Musical']],
  [/\bmusic film|concert film|music documentary|rockumentary/, ['Music']],
  [/biograph|biopic/, ['Biography']],
  [/historical|period film|period drama/, ['History']],
  [/\bsports? film|boxing film|baseball film|association football film/, ['Sport']],
  [/family film|children'?s film/, ['Family']],
  [/fantasy|fairy tale|sword and sorcery/, ['Fantasy']],
  [/(?<!live-)\baction|martial arts|superhero|swashbuckler|wuxia/, ['Action']],
  [/adventure|swashbuckler/, ['Adventure']],
];

export function canonicalGenres(labels) {
  const genres = new Set();
  for (const label of labels) {
    const key = String(label ?? '').toLowerCase().trim();
    for (const [pattern, mapped] of GENRE_RULES) if (pattern.test(key)) for (const genre of mapped) genres.add(genre);
  }
  // Alphabetical, like IMDb's genre lists.
  return [...genres].sort();
}

/** Wikidata labels that differ from how the catalog names a production country. */
const COUNTRY_NAMES = {
  'Estados Unidos da América': 'Estados Unidos',
  'República Popular da China': 'China',
  'Reino dos Países Baixos': 'Países Baixos',
  'Alemanha Ocidental': 'Alemanha',
  'Alemanha Oriental': 'Alemanha',
  'República Federal da Alemanha': 'Alemanha',
  'República Democrática Alemã': 'Alemanha',
  'República da Irlanda': 'Irlanda',
  'República de Weimar': 'Alemanha',
  'Alemanha Nazi': 'Alemanha',
  'Alemanha nazista': 'Alemanha',
  'Império Alemão': 'Alemanha',
  'Império do Japão': 'Japão',
  'Império Russo': 'Rússia',
  'Reino de Itália': 'Itália',
  'Reino da Itália': 'Itália',
  'Hong Kong britânico': 'Hong Kong',
  "People's Republic of China": 'China',
  'Kingdom of the Netherlands': 'Netherlands',
  'West Germany': 'Germany',
  'East Germany': 'Germany',
  'Republic of Ireland': 'Ireland',
  'Weimar Republic': 'Germany',
  'Nazi Germany': 'Germany',
  'German Reich': 'Germany',
  'Empire of Japan': 'Japan',
  'Russian Empire': 'Russia',
  'Kingdom of Italy': 'Italy',
  'British Hong Kong': 'Hong Kong',
};

export function countryName(label) {
  return COUNTRY_NAMES[label] ?? label;
}

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Main runtime: the shortest version of at least 40 minutes (cuts and restorations run longer). */
export function runtimeMinutes(secondsList) {
  const minutes = secondsList.filter((seconds) => Number.isFinite(seconds) && seconds > 0).map((seconds) => Math.round(seconds / 60)).sort((a, b) => a - b);
  return minutes.find((value) => value >= 40) ?? minutes[0] ?? 0;
}

const PLOT_HEADINGS = /^(sinopse|enredo|resumo|trama|argumento|hist[oó]ria|plot|synopsis|premise|summary)$/i;

function sentences(text, max, maxLength) {
  const parts = (text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map((part) => part.trim());
  let result = '';
  for (const part of parts.slice(0, max)) {
    const next = result ? `${result} ${part}` : part;
    if (result && next.length > maxLength) break;
    result = next;
  }
  return result;
}

/**
 * A short synopsis from a Wikipedia article's plain text (exsectionformat=wiki):
 * the start of its plot section, or else the lead. Empty when too short.
 */
export function pitchFromArticle(text, { maxSentences = 3, maxLength = 420 } = {}) {
  const source = String(text ?? '');
  const sections = source.split(/^={2,}\s*(.+?)\s*={2,}\s*$/m);
  let body = sections[0];
  for (let i = 1; i < sections.length; i += 2) {
    if (PLOT_HEADINGS.test(sections[i].trim())) {
      body = sections[i + 1] ?? '';
      break;
    }
  }
  const paragraph = body.split(/\n\s*\n|\n/).map((line) => line.trim()).find((line) => line.length >= 40) ?? '';
  const pitch = sentences(paragraph.replace(/\[\d+\]/g, ''), maxSentences, maxLength);
  return pitch.length >= 25 ? pitch : '';
}

export function genericPitch(genres, year, director) {
  return `Um dos grandes marcos do gênero ${(genres.length ? genres : ['Drama']).slice(0, 2).join('/')} (${year}), dirigido por ${director}.`;
}

/** Popularity for selection: Wikipedias covering the film, on a log scale. */
export function sitelinkScore(candidate) {
  return Math.log10((candidate.sitelinks ?? 0) + 1) * 100;
}

function pickLabel(rows, langs) {
  for (const lang of langs) {
    const row = rows.find((item) => item.lang === lang && item.label);
    if (row) return row.label;
  }
  return '';
}

/**
 * The catalog record of one film. Ratings are 0: the extension downloads
 * IMDb's scores in each browser, and only a local build may add them.
 * @returns {import('../../src/domain/catalog/catalog.ts').RawCatalogFilm | null}
 */
export function buildFilm(candidate, details, genreLabels, pitch, localizedLabels = new Map()) {
  const labels = details.labels ?? [];
  const english = pickLabel(labels, ['en']);
  const portuguese = pickLabel(labels, ['pt-br', 'pt']);
  const originalTitle = details.originalTitle?.[0]?.label || english || portuguese;
  // Letterboxd names films in English: so does the catalog, which is how a
  // user's history matches it. The Portuguese title stays searchable.
  const title = english || portuguese || originalTitle;
  if (!title) return null;
  const director = [...(details.directors ?? [])].sort((a, b) => b.links - a.links || a.label.localeCompare(b.label))[0]?.label || 'Diretor Desconhecido';
  const runtime = runtimeMinutes((details.durations ?? []).map((row) => row.seconds));
  if (runtime > 0 && runtime < 40) return null;
  const genres = canonicalGenres([...candidate.genreIds, ...candidate.classIds].map((id) => genreLabels.get(id)).filter(Boolean));
  const countries = [...new Set((details.countryLabels ?? details.countries ?? []).map((row) => countryName(row.label)).filter(Boolean))];
  const letterboxd = details.letterboxd?.[0]?.label;
  const slug = letterboxd && /^[a-z0-9-]+$/.test(letterboxd) ? letterboxd : slugify(english || originalTitle);
  if (!slug) return null;
  const keywords = [...new Set([title, originalTitle, portuguese, director, ...genres, String(candidate.year), `${Math.floor(candidate.year / 10) * 10}s`].filter(Boolean).map((term) => term.toLowerCase()))].slice(0, 15);
  // Wikidata's own genre and subject labels ("psychological horror", "coming of
  // age") are facts about this film: theme matching reads them like keywords.
  // The Portuguese term is the one shown ("Relacionado a … por terror
  // psicológico"); its English form ('film-en') only feeds theme matching.
  const terms = [
    ...candidate.genreIds.map((id) => ({ en: genreLabels.get(id), pt: localizedLabels.get(id) })),
    ...(details.subjectTerms ?? details.subjects ?? []).map((row) => ({ en: row.en ?? row.label, pt: row.en ? row.label : undefined })),
  ];
  /** @type {import('../../src/domain/film.ts').KeywordEvidence[]} */
  const filmEvidence = [];
  const seen = new Set(keywords);
  for (const { en, pt } of terms) {
    const english = filmKeyword(en);
    if (!english || seen.has(english) || filmEvidence.length >= 14) continue;
    // Localized genre labels fall back to English: that is no translation.
    const localized = filmKeyword(pt);
    const portugueseTerm = (localized !== english && localized) || PORTUGUESE_KEYWORDS[english] || '';
    seen.add(english);
    if (portugueseTerm && portugueseTerm !== english && !seen.has(portugueseTerm)) {
      seen.add(portugueseTerm);
      filmEvidence.push({ term: portugueseTerm, source: 'film' }, { term: english, source: 'film-en' });
    } else {
      filmEvidence.push({ term: english, source: 'film' });
    }
  }
  const filmKeywords = filmEvidence.map((entry) => entry.term);
  return {
    title,
    originalTitle,
    year: candidate.year,
    director,
    slug,
    runtime,
    runtimeKnown: runtime > 0,
    metadataSources: {},
    country: countries.join(', ') || 'Internacional',
    originalLanguage: details.languages?.[0]?.label ?? '',
    imdbRating: 0,
    imdbVotes: 0,
    imdbId: candidate.imdbId,
    genres,
    keywords: [...keywords, ...filmKeywords],
    keywordEvidence: [
      ...keywords.map((term) => ({
        term,
        source: /** @type {'genre' | 'director' | 'derived'} */ (genres.some((genre) => genre.toLowerCase() === term) ? 'genre' : term === director.toLowerCase() ? 'director' : 'derived'),
      })),
      ...filmEvidence,
    ],
    pitch: pitch || genericPitch(genres, candidate.year, director),
  };
}

/** pt-BR for frequent keywords Wikidata has no Portuguese label for. */
const PORTUGUESE_KEYWORDS = {
  teen: 'adolescentes', 'romantic comedy': 'comédia romântica', 'coming-of-age': 'amadurecimento', 'coming of age': 'amadurecimento',
  'crime thriller': 'suspense policial', 'association football': 'futebol', parody: 'paródia', 'psychological thriller': 'suspense psicológico',
  'crime drama': 'drama policial', 'political thriller': 'suspense político', trial: 'julgamento', 'science fiction comedy': 'comédia de ficção científica',
  'buddy cop': 'dupla policial', 'psychological drama': 'drama psicológico', 'action thriller': 'suspense de ação', 'psychological horror': 'terror psicológico',
  flashback: 'flashback', vigilante: 'justiceiro', medieval: 'medieval', 'comedy thriller': 'comédia de suspense', detective: 'detetive',
  'time-travel': 'viagem no tempo', 'comedy horror': 'terror cômico', 'female buddy': 'amizade feminina', survival: 'sobrevivência',
  hood: 'periferia', supernatural: 'sobrenatural', 'crime comedy': 'comédia policial', 'science fiction action': 'ação e ficção científica',
  'american football': 'futebol americano', rockumentary: 'documentário de rock', satanic: 'satanismo', 'arthouse science fiction': 'ficção científica de arte',
  'romantic drama': 'drama romântico', sexploitation: 'sexploitation', 'sword and sorcery': 'espada e feitiçaria', 'music documentary': 'documentário musical',
  'self-discovery': 'autodescoberta', 'human bonding': 'laços humanos', 'historical drama': 'drama histórico', 'natural horror': 'terror da natureza',
  'sibling relationship': 'relação entre irmãos', 'coming to terms with the past': 'acerto com o passado', 'submarine warfare': 'guerra submarina',
  'magic realist': 'realismo mágico', 'body swap': 'troca de corpos', 'lesbian-related': 'temática lésbica', 'parental death': 'morte dos pais',
  rurality: 'vida rural', 'sex comedy': 'comédia sexual', 'techno-thriller': 'suspense tecnológico', 'police procedural': 'procedimento policial',
  'comedy of remarriage': 'comédia de recasamento', 'political drama': 'drama político', 'music-themed': 'música', 'summer camp program': 'acampamento de verão',
  'criminal investigation': 'investigação criminal', "death of one's child": 'morte de um filho', espionage: 'espionagem', 'fleeting relationship': 'relação passageira',
  partisan: 'guerrilheiros', secrecy: 'segredos', 'war drama': 'drama de guerra', cannibal: 'canibalismo', transgender: 'transgênero',
  'sexual morality': 'moral sexual', 'romantic horror': 'terror romântico', dying: 'morte', flight: 'fuga', 'falling in love': 'paixão',
  'gender relations': 'relações de gênero', mortality: 'mortalidade', 'class relations': 'relações de classe', 'marital breakdown': 'fim do casamento',
  chase: 'perseguição', 'artistic creation': 'criação artística', 'religious horror': 'terror religioso', 'family relation': 'relações familiares',
  'upward social mobility': 'ascensão social', 'high society': 'alta sociedade', 'forbidden love': 'amor proibido', 'teen horror': 'terror adolescente',
  filmmaking: 'cinema', 'social comedy': 'comédia social', 'star-crossed lovers': 'amantes desafortunados', 'male bonding': 'amizade masculina',
  'fantasy comedy': 'comédia fantástica', breakup: 'término', 'child abduction': 'sequestro de criança', 'drug-related crime': 'crime e drogas',
  'intercultural relationship': 'relação intercultural', 'black comedy': 'humor negro', 'dark comedy': 'humor negro', 'action-adventure': 'ação e aventura',
};

/** A genre or subject label as a keyword: "psychological horror film" → "psychological horror". */
export function filmKeyword(label) {
  const term = String(label ?? '').toLowerCase().replace(/\s+film$/, '').replace(/^filme\s+(?:de\s+|do\s+|da\s+)?/, '').trim();
  // Generic classes and Wikidata's internal labels say nothing about the film.
  return term && term !== 'film' && term !== 'filme' && !/^q\d+$/.test(term) && term.length <= 40 ? term : '';
}

/** Groups detail rows by film id. */
export function groupByFilm(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.film);
    if (list) list.push(row);
    else grouped.set(row.film, [row]);
  }
  return grouped;
}
