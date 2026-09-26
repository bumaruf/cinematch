import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';

function normalizeStr(str) {
  if (!str) return '';
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function stemPt(word) {
  if (word.length < 4) return word;
  const suffixes = [
    'mente', 'acao', 'ções', 'ismo', 'ista',
    'eira', 'eiro', 'iana', 'iano', 'avel', 'ivel',
    'icas', 'icos', 'osas', 'osos', 'adas', 'ados',
    'ica', 'ico', 'osa', 'oso', 'ada', 'ado',
    'ais', 'eis', 'ois',
    'ias', 'ios', 'oes',
    'ia', 'io', 'al', 'ar', 'er', 'ir',
    'as', 'os', 'es',
    'a', 'o', 'e', 's'
  ];
  for (const suf of suffixes) {
    if (word.length > suf.length + 3 && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

function fuzzyMatch(token, corpusWord) {
  if (corpusWord.includes(token) || token.includes(corpusWord)) return true;
  const stemA = stemPt(token);
  const stemB = stemPt(corpusWord);
  if (stemA.length >= 3 && stemB.length >= 3) {
    if (stemA === stemB) return true;
    if (stemA.includes(stemB) || stemB.includes(stemA)) return true;
  }
  if (token.length >= 4 && corpusWord.length >= 4) {
    const minLen = Math.min(token.length, corpusWord.length, 5);
    if (token.substring(0, minLen) === corpusWord.substring(0, minLen)) return true;
  }
  return false;
}

function fuzzyMatchInText(token, text) {
  if (!text || !token) return false;
  if (text.includes(token)) return true;
  const words = text.split(/[\s,.:;!?\/\-_()]+/).filter(w => w.length >= 2);
  return words.some(w => fuzzyMatch(token, w));
}

function search(query) {
  const cleanPrompt = normalizeStr(query);
  const tokens = cleanPrompt.split(/[\s,.;:!?+\-_\/]+/).filter(w => w.length >= 2);
  const results = [];

  for (const film of EXPANDED_FILM_DATABASE) {
    let relevance = 0;
    let tokensMatched = 0;

    const titleNorm = normalizeStr(film.title);
    const origNorm = normalizeStr(film.originalTitle || '');
    const dirNorm = normalizeStr(film.director || '');
    const countryNorm = normalizeStr(film.country || '');
    const pitchNorm = normalizeStr(film.pitch || '');
    const keywordsJoined = (film.keywords || []).map(k => normalizeStr(k)).join(' ');
    const genresJoined = (film.genres || []).map(g => normalizeStr(g)).join(' ');
    const themesJoined = (film.themes || []).map(t => normalizeStr(t)).join(' ');
    const filmCorpus = [titleNorm, origNorm, dirNorm, countryNorm, pitchNorm, keywordsJoined, genresJoined, themesJoined].join(' ');

    if (filmCorpus.includes(cleanPrompt)) relevance += 40;

    for (const token of tokens) {
      let tokenMatched = false;
      if (fuzzyMatchInText(token, titleNorm) || fuzzyMatchInText(token, origNorm)) { relevance += 30; tokenMatched = true; }
      if (fuzzyMatchInText(token, dirNorm)) { relevance += 20; tokenMatched = true; }
      if (fuzzyMatchInText(token, countryNorm)) { relevance += 18; tokenMatched = true; }
      if (fuzzyMatchInText(token, keywordsJoined)) { relevance += 16; tokenMatched = true; }
      if (fuzzyMatchInText(token, genresJoined)) { relevance += 14; tokenMatched = true; }
      if (fuzzyMatchInText(token, themesJoined)) { relevance += 12; tokenMatched = true; }
      if (fuzzyMatchInText(token, pitchNorm)) { relevance += 8; tokenMatched = true; }
      if (tokenMatched) tokensMatched++;
    }

    if (tokens.length > 1 && tokensMatched === tokens.length) relevance += 25;

    const minTokensRequired = tokens.length > 2 ? Math.ceil(tokens.length * 0.5) : 1;
    if (tokensMatched >= minTokensRequired && relevance > 0) {
      results.push({ title: film.title, year: film.year, relevance, tokensMatched });
    }
  }
  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, 8);
}

console.log('Total: ' + EXPANDED_FILM_DATABASE.length + ' filmes reais\n');

const queries = [
  'mafia italiana', 'romance', 'viagem espacial', 'cyberpunk',
  'terror psicologico', 'faroeste', 'coming of age', 'anime',
  'comedia brasileira', 'serial killer', 'guerra', 'film noir',
  'ficção científica', 'suspense', 'drama familiar', 'studio ghibli'
];

for (const q of queries) {
  const r = search(q);
  console.log('>> "' + q + '" => ' + r.length + ' resultados:');
  r.forEach(f => console.log('   - ' + f.title + ' (' + f.year + ') [rel=' + f.relevance + ']'));
  console.log();
}
