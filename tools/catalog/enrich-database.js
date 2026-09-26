/**
 * Enriches the IMDb-imported films_dataset.js with smart thematic keywords.
 * Fixes: anime ≠ animation, "guerra" title ≠ war film, etc.
 */

import { EXPANDED_FILM_DATABASE } from '../../src/data/films-dataset.js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Genre-to-keywords mapping ────────────────────────────────────────────────
const GENRE_KEYWORDS = {
  'action':      ['ação', 'action', 'adrenalina', 'luta', 'combate', 'explosão', 'perseguição'],
  'adventure':   ['aventura', 'adventure', 'exploração', 'jornada', 'expedição', 'missão'],
  'animation':   ['animação', 'animation', 'desenho animado', 'cartoon', 'animated'],
  // NOTE: 'anime' is NOT here — only added for explicitly Japanese animated films
  'biography':   ['biografia', 'biography', 'biopic', 'baseado em fatos reais', 'história real', 'vida real'],
  'comedy':      ['comédia', 'comedy', 'humor', 'engraçado', 'risada', 'comédia'],
  'crime':       ['crime', 'criminal', 'policial', 'detetive', 'assassinato', 'gangster', 'gângster', 'mafia', 'máfia', 'tráfico', 'assalto', 'sequestro', 'ladrão'],
  'documentary': ['documentário', 'documentary', 'entrevista', 'reportagem', 'real'],
  'drama':       ['drama', 'dramático', 'emocional', 'poderoso', 'relações humanas'],
  'family':      ['família', 'family', 'criança', 'infantil', 'kids'],
  'fantasy':     ['fantasia', 'fantasy', 'magia', 'mágico', 'feiticeiro', 'dragão', 'elfos', 'realismo mágico', 'magical realism'],
  'film-noir':   ['film noir', 'noir', 'neo-noir', 'crime noir', 'anos 40', 'anos 50', 'detetive', 'femme fatale', 'sombrio'],
  'history':     ['história', 'history', 'histórico', 'época', 'antiguidade', 'medieval', 'império', 'baseado em fatos'],
  'horror':      ['terror', 'horror', 'medo', 'assustador', 'sobrenatural', 'demônio', 'fantasma', 'monstro', 'slasher', 'psicológico'],
  'music':       ['música', 'music', 'musical', 'canção', 'banda', 'concerto', 'rock', 'jazz'],
  'musical':     ['musical', 'canto', 'dança', 'coreografia', 'broadway'],
  'mystery':     ['mistério', 'mystery', 'suspense', 'enigma', 'investigação', 'quem fez', 'whodunit'],
  'romance':     ['romance', 'amor', 'love', 'paixão', 'relacionamento', 'casal', 'encontro', 'reencontro', 'desencontro'],
  'sci-fi':      ['ficção científica', 'sci-fi', 'science fiction', 'futurismo', 'tecnologia', 'inteligência artificial', 'espaço', 'alienígena', 'robô', 'distopia', 'utopia', 'viagem no tempo'],
  'sport':       ['esporte', 'sport', 'futebol', 'basquete', 'boxe', 'competição', 'campeonato', 'atleta'],
  'thriller':    ['thriller', 'suspense', 'tensão', 'perseguição', 'paranoia', 'conspiração', 'serial killer', 'psicológico'],
  'war':         ['guerra bélica', 'war film', 'combate', 'batalha', 'soldado', 'exército', 'bélico', 'conflito armado', 'segunda guerra', 'vietnam', 'trincheira'],
  'western':     ['faroeste', 'western', 'cowboy', 'pistoleiro', 'velho oeste', 'sheriff', 'bandido', 'duelo', 'saloon', 'spaghetti western'],
};

// ─── Explicit Japanese anime slugs ────────────────────────────────────────────
const ANIME_SLUGS = new Set([
  'spirited-away', 'princess-mononoke', 'my-neighbor-totoro', 'castle-in-the-sky',
  'kiki-s-delivery-service', 'porco-rosso', 'the-tale-of-the-princess-kaguya',
  'the-wind-rises', 'when-marnie-was-there', 'the-boy-and-the-heron',
  'grave-of-the-fireflies', 'nausicaa-of-the-valley-of-the-wind',
  'howls-moving-castle', 'howl-s-moving-castle', 'the-cat-returns', 'only-yesterday', 'pom-poko',
  'my-neighbors-the-yamadas', 'ocean-waves', 'the-red-turtle',
  'akira', 'ghost-in-the-shell', 'perfect-blue', 'paprika', 'millennium-actress',
  'tokyo-godfathers', 'wolf-children', 'the-girl-who-leapt-through-time',
  'summer-wars', 'belle', 'mirai', 'a-silent-voice', 'your-name',
  'the-garden-of-words', 'weathering-with-you',
  'neon-genesis-evangelion-the-end-of-evangelion', 'the-end-of-evangelion',
  'one-piece-film-red', 'demon-slayer-kimetsu-no-yaiba-the-movie-mugen-train',
  'jujutsu-kaisen-0', 'my-hero-academia-two-heroes',
  'lupin-iii-the-castle-of-cagliostro', 'mobile-suit-gundam-chars-counterattack',
  'ninja-scroll', 'vampire-hunter-d-bloodlust',
  'barefoot-gen', 'in-this-corner-of-the-world',
  'planetes', 'steins-gate-the-movie-load-region-of-deja-vu',
  'maquia-when-the-promised-flower-blooms', 'wolf-children-2012',
  'the-first-slam-dunk',
]);

// ─── Explicit real war film slugs ─────────────────────────────────────────────
const REAL_WAR_FILM_SLUGS = new Set([
  'apocalypse-now', 'apocalypse-now-redux', 'full-metal-jacket', 'platoon',
  'saving-private-ryan', 'the-thin-red-line', 'dunkirk', '1917',
  'das-boot', 'come-and-see', 'paths-of-glory', 'all-quiet-on-the-western-front',
  'im-westen-nichts-neues', 'the-bridge-on-the-river-kwai', 'bridge-on-the-river-kwai',
  'hacksaw-ridge', 'fury', 'midway', 'greyhound', 'the-deer-hunter',
  'born-on-the-fourth-of-july', 'hamburger-hill', 'we-were-soldiers',
  'black-hawk-down', 'a-bridge-too-far', 'the-longest-day', 'patton',
  'the-great-escape', 'where-eagles-dare', 'inglourious-basterds',
  'the-pianist', 'schindlers-list', 'life-is-beautiful',
  'empire-of-the-sun', 'merry-christmas-mr-lawrence',
  'twelve-oclock-high', 'stalag-17', 'the-guns-of-navarone',
  'kelly-s-heroes', 'mash', 'm-a-s-h', 'catch-22',
  'the-battle-of-algiers', 'pans-labyrinth', 'pan-s-labyrinth',
  'the-hurt-locker', 'zero-dark-thirty', 'american-sniper', 'lone-survivor',
  'the-messenger', 'brothers',
  'ran', 'kagemusha',
  'ivan-s-childhood', 'enemy-at-the-gates',
  'lawrence-of-arabia', 'gallipoli', 'breaker-morant',
  'grave-of-the-fireflies', 'in-this-corner-of-the-world',
  'waltz-with-bashir', 'persepolis',
  'the-big-red-one', 'attack', 'the-big-red-one-1980',
]);

// ─── Director-to-keywords mapping ─────────────────────────────────────────────
const DIRECTOR_KEYWORDS = {
  'stanley kubrick':           ['kubrick', 'mindfuck', 'perturbador', 'filosófico', 'visceral', 'meticuloso'],
  'christopher nolan':         ['nolan', 'não linear', 'tempo', 'paradoxo', 'inteligente', 'complexo'],
  'quentin tarantino':         ['tarantino', 'diálogos afiados', 'violência estilizada', 'cult', 'referências cinematográficas'],
  'martin scorsese':           ['scorsese', 'máfia', 'mafia', 'crime organizado', 'gangster', 'nova york', 'crime', 'italiano-americano'],
  'david fincher':             ['fincher', 'thriller psicológico', 'sombrio', 'serial killer', 'suspense'],
  'steven spielberg':          ['spielberg', 'aventura', 'familiar', 'épico', 'blockbuster'],
  'james cameron':             ['cameron', 'épico', 'blockbuster', 'ficção científica', 'ação'],
  'ridley scott':              ['ridley scott', 'épico', 'ficção científica', 'ação', 'visual impressionante'],
  'alfred hitchcock':          ['hitchcock', 'suspense clássico', 'mistério', 'thriller', 'mestre do suspense', 'anos 50', 'anos 60'],
  'francis ford coppola':      ['coppola', 'máfia', 'mafia', 'família', 'épico', 'crime organizado', 'gangster', 'italiano', 'corleone'],
  'sergio leone':              ['leone', 'faroeste', 'western', 'spaghetti western', 'cowboy', 'épico', 'pistoleiro', 'itália', 'italiano'],
  'andrei tarkovsky':          ['tarkovsky', 'slow cinema', 'contemplativo', 'filosófico', 'espiritual', 'arte', 'russo', 'soviético'],
  'ingmar bergman':            ['bergman', 'existencial', 'morte', 'filosófico', 'sueco', 'drama psicológico', 'escandinavian'],
  'akira kurosawa':            ['kurosawa', 'samurai', 'japão', 'honra', 'épico', 'cinema japonês', 'jidaigeki'],
  'yasujiro ozu':              ['ozu', 'família japonesa', 'slow cinema', 'contemplativo', 'japão', 'cotidiano', 'tatami'],
  'federico fellini':          ['fellini', 'cinema italiano', 'surreal', 'autobiográfico', 'sonho', 'arte', 'itália', 'neorrealismo'],
  'jean-luc godard':           ['godard', 'nouvelle vague', 'cinema francês', 'experimental', 'intelectual', 'anos 60', 'france'],
  'pedro almodóvar':           ['almodovar', 'drama espanhol', 'passional', 'mulheres', 'espanha', 'spain'],
  'park chan-wook':            ['park chan-wook', 'vingança', 'gore', 'coreano', 'violência estilizada', 'thriller coreano', 'coreia do sul'],
  'bong joon-ho':              ['bong joon-ho', 'suspense coreano', 'crítica social', 'coreano', 'thriller', 'parasita', 'coreia do sul'],
  'hayao miyazaki':            ['miyazaki', 'studio ghibli', 'ghibli', 'anime', 'animação japonesa', 'fantasia', 'magia', 'japão'],
  'isao takahata':             ['ghibli', 'studio ghibli', 'anime', 'animação japonesa', 'japão'],
  'satoshi kon':               ['satoshi kon', 'anime', 'animação japonesa', 'realidade vs sonho', 'psicológico', 'japão'],
  'mamoru hosoda':             ['hosoda', 'anime', 'animação japonesa', 'japão', 'família'],
  'makoto shinkai':            ['shinkai', 'anime', 'animação japonesa', 'romance japonês', 'japão'],
  'wes anderson':              ['wes anderson', 'estético', 'simétrico', 'humor seco', 'quirky', 'excêntrico'],
  'wong kar-wai':              ['wong kar-wai', 'romance asiático', 'contemplativo', 'melancolia', 'hong kong', 'anos 60'],
  'david lynch':               ['lynch', 'surrealismo', 'sonho', 'perturbador', 'weird', 'bizarro', 'psicológico'],
  'roman polanski':            ['polanski', 'suspense psicológico', 'noir', 'claustrofóbico', 'paranoia'],
  'joel coen':                 ['coen', 'dark comedy', 'crime', 'noir', 'humor negro', 'neo-noir'],
  'ethan coen':                ['coen', 'dark comedy', 'crime', 'noir', 'humor negro', 'neo-noir'],
  'denis villeneuve':          ['villeneuve', 'ficção científica', 'sci-fi', 'slow burn', 'filosófico', 'épico'],
  'ari aster':                 ['ari aster', 'terror psicológico', 'horror elevado', 'luto', 'folk horror'],
  'robert eggers':             ['eggers', 'terror atmosférico', 'horror histórico', 'folk horror', 'período'],
  'darren aronofsky':          ['aronofsky', 'psicológico', 'perturbador', 'obsessão', 'autodestruição', 'drama intenso'],
  'paul thomas anderson':      ['paul thomas anderson', 'drama americano', 'personagens complexos', 'épico'],
  'terrence malick':           ['malick', 'slow cinema', 'contemplativo', 'natureza', 'poético', 'filosófico'],
  'yorgos lanthimos':          ['lanthimos', 'absurdo', 'satírico', 'grego', 'disturbing', 'dark comedy'],
  'michael haneke':            ['haneke', 'perturbador', 'violência', 'crítica social', 'austríaco', 'provocador'],
  'jean-pierre melville':      ['melville', 'noir francês', 'gangster francês', 'estilo', 'polar', 'france'],
  'francois truffaut':         ['truffaut', 'nouvelle vague', 'cinema francês', 'infância', 'coming of age', 'france'],
  'satyajit ray':              ['ray', 'cinema indiano', 'bengala', 'drama familiar', 'indie indiano', 'india'],
  'abbas kiarostami':          ['kiarostami', 'cinema iraniano', 'slow cinema', 'contemplativo', 'iran', 'persa'],
  'asghar farhadi':            ['farhadi', 'drama iraniano', 'conflito familiar', 'iran', 'moral', 'persa'],
  'zhang yimou':               ['zhang yimou', 'cinema chinês', 'visualmente belo', 'épico chinês', 'china'],
  'gaspar noé':                ['gaspar noe', 'provocador', 'intenso', 'psicodélico', 'visceral', 'perturbador'],
  'vittorio de sica':          ['neorrealismo italiano', 'cinema italiano', 'drama social', 'itália'],
  'roberto rossellini':        ['neorrealismo italiano', 'cinema italiano', 'segunda guerra', 'itália'],
  'luchino visconti':          ['visconti', 'cinema italiano', 'drama épico', 'itália', 'aristocracia'],
  'michelangelo antonioni':    ['antonioni', 'cinema italiano', 'existencial', 'alienação', 'itália', 'slow cinema'],
  'dario argento':             ['argento', 'giallo', 'terror italiano', 'slasher', 'horror', 'itália'],
  'mario bava':                ['bava', 'giallo', 'terror italiano', 'horror', 'itália'],
  'bernardo bertolucci':       ['bertolucci', 'cinema italiano', 'político', 'sensual', 'itália'],
  'matteo garrone':            ['garrone', 'cinema italiano', 'máfia', 'camorra', 'itália', 'napoles'],
  'paolo sorrentino':          ['sorrentino', 'cinema italiano', 'estético', 'itália', 'roma'],
  'marco bellocchio':          ['bellocchio', 'cinema italiano', 'máfia', 'itália', 'político'],
};

// ─── Country-to-keywords mapping ──────────────────────────────────────────────
const COUNTRY_EXTRA_KEYWORDS = {
  'united states': ['eua', 'estados unidos', 'americano', 'american', 'hollywood'],
  'uk':            ['reino unido', 'britânico', 'british', 'england', 'inglaterra'],
  'france':        ['france', 'francês', 'cinema francês', 'paris', 'nouvelle vague'],
  'italy':         ['itália', 'italy', 'italiano', 'cinema italiano', 'roma', 'neorrealismo', 'máfia italiana'],
  'japan':         ['japão', 'japan', 'japonês', 'cinema japonês', 'tóquio', 'tokyo', 'samurai'],
  'south korea':   ['coreia do sul', 'coreano', 'korean', 'cinema coreano', 'seoul'],
  'germany':       ['alemanha', 'germany', 'alemão', 'cinema alemão', 'expressionismo'],
  'spain':         ['espanha', 'spain', 'espanhol', 'cinema espanhol'],
  'brazil':        ['brasil', 'brazil', 'brasileiro', 'cinema brasileiro', 'cinema nacional'],
  'argentina':     ['argentina', 'argentino', 'cinema argentino', 'buenos aires'],
  'mexico':        ['méxico', 'mexico', 'mexicano', 'cinema mexicano'],
  'india':         ['índia', 'india', 'bollywood', 'cinema indiano', 'hindi'],
  'iran':          ['irã', 'iran', 'iraniano', 'cinema iraniano', 'persa'],
  'sweden':        ['suécia', 'sweden', 'sueco', 'scandinavian', 'escandinavo'],
  'denmark':       ['dinamarca', 'denmark', 'dinamarquês', 'scandinavian', 'escandinavo'],
  'china':         ['china', 'chinês', 'cinema chinês', 'mandarin'],
  'taiwan':        ['taiwan', 'taiwanês', 'cinema taiwanês'],
  'hong kong':     ['hong kong', 'triade', 'triads', 'cinema hong kong'],
  'russia':        ['rússia', 'russia', 'russo', 'soviet', 'soviético', 'urss'],
};

function runtimeKeywords(runtime) {
  if (!runtime || runtime < 10) return [];
  if (runtime <= 90) return ['filme curto', 'compacto'];
  if (runtime <= 120) return ['duração média'];
  if (runtime <= 180) return ['filme longo'];
  return ['épico', 'extremamente longo'];
}

function decadeKeywords(year) {
  if (!year) return [];
  const decade = Math.floor(year / 10) * 10;
  const keywords = [`${decade}s`, `anos ${decade}`];
  if (year < 1960) keywords.push('clássico', 'vintage', 'golden age', 'era de ouro');
  if (year >= 1960 && year < 1980) keywords.push('clássico moderno');
  if (year >= 2000) keywords.push('contemporâneo');
  return keywords;
}

// ─── Main enrichment function ─────────────────────────────────────────────────
function enrichFilm(film) {
  const keywordsSet = new Set();

  // Keep existing keywords (from curated db or previous enrichment)
  for (const k of (film.keywords || [])) {
    // Skip overly generic auto-gen keywords that cause noise
    if (['anime', 'desenho animado', 'cartoon', 'animation', 'animação'].includes(k) && !ANIME_SLUGS.has(film.slug)) {
      continue; // don't propagate generic animation terms to non-anime
    }
    if (['guerra bélica', 'war film', 'combate', 'batalha', 'soldado', 'exército', 'bélico', 'conflito armado', 'segunda guerra', 'vietnam', 'trincheira'].includes(k)
        && film.genres?.includes('War') && !REAL_WAR_FILM_SLUGS.has(film.slug)) {
      continue; // don't add war keywords to films that just have "guerra" in title
    }
    keywordsSet.add(k.toLowerCase());
  }

  // Title
  if (film.title) keywordsSet.add(film.title.toLowerCase());
  if (film.originalTitle && film.originalTitle !== film.title) {
    keywordsSet.add(film.originalTitle.toLowerCase());
  }

  // Director
  if (film.director) {
    const dirLower = film.director.toLowerCase();
    keywordsSet.add(dirLower);
    for (const [key, extras] of Object.entries(DIRECTOR_KEYWORDS)) {
      if (dirLower.includes(key) || key.includes(dirLower.split(' ').slice(-1)[0])) {
        extras.forEach(k => keywordsSet.add(k));
        break;
      }
    }
  }

  // Genre-based keywords — but apply war keywords only to real war films
  for (const genre of (film.genres || [])) {
    const genreLower = genre.toLowerCase();
    if (genreLower === 'war' && !REAL_WAR_FILM_SLUGS.has(film.slug)) continue;
    if (genreLower === 'animation' && ANIME_SLUGS.has(film.slug)) {
      // Add anime-specific keywords instead of generic animation ones
      ['anime', 'animação japonesa', 'japão', 'japan', 'japonês', 'anime film'].forEach(k => keywordsSet.add(k));
      continue;
    }
    const extras = GENRE_KEYWORDS[genreLower];
    if (extras) extras.forEach(k => keywordsSet.add(k));
  }

  // Anime slug: force anime keywords
  if (ANIME_SLUGS.has(film.slug)) {
    ['anime', 'animação japonesa', 'japão', 'japan', 'japonês', 'anime film', 'studio ghibli'].forEach(k => {
      // Only add studio ghibli for actual ghibli films
      if (k === 'studio ghibli' && !['miyazaki', 'isao takahata'].some(d => (film.director || '').toLowerCase().includes(d))) return;
      keywordsSet.add(k);
    });
  }

  // Real war film: force war keywords
  if (REAL_WAR_FILM_SLUGS.has(film.slug)) {
    ['guerra', 'guerra bélica', 'war film', 'war movie', 'bélico', 'combate', 'soldado', 'batalha'].forEach(k => keywordsSet.add(k));
  }

  // Country keywords
  if (film.country) {
    const countryLower = film.country.toLowerCase();
    for (const [key, extras] of Object.entries(COUNTRY_EXTRA_KEYWORDS)) {
      if (countryLower.includes(key) || key.includes(countryLower)) {
        extras.forEach(k => keywordsSet.add(k));
        break;
      }
    }
  }

  // Runtime and decade
  for (const k of runtimeKeywords(film.runtime)) keywordsSet.add(k);
  for (const k of decadeKeywords(film.year)) keywordsSet.add(k);

  // IMDb quality tier
  if (film.imdbRating) {
    if (film.imdbRating >= 8.0) keywordsSet.add('aclamado');
    if (film.imdbRating >= 8.5) { keywordsSet.add('obra-prima'); keywordsSet.add('masterpiece'); }
    if (film.imdbRating >= 9.0) keywordsSet.add('cult');
    if (film.imdbVotes >= 500000) keywordsSet.add('popular');
  }

  return {
    ...film,
    keywords: Array.from(keywordsSet).filter(k => k && k.length >= 2).slice(0, 30),
  };
}

// ─── Run ──────────────────────────────────────────────────────────────────────
console.log(`📂 Carregando ${EXPANDED_FILM_DATABASE.length} filmes do IMDb...`);

const enriched = EXPANDED_FILM_DATABASE.map(enrichFilm);

// Spot-checks
const checks = ['the-godfather', 'spirited-away', 'saving-private-ryan', 'interstellar', 'akira'];
const nameChecks = ['space jam', 'meu malvado favorito', 'vingadores'];

console.log('\n🔍 Spot-checks:');
for (const slug of checks) {
  const f = enriched.find(x => x.slug === slug);
  if (f) console.log(`\n✅ ${f.title} (${f.year})\n   kw: ${f.keywords.slice(0,12).join(', ')}`);
}
for (const name of nameChecks) {
  const f = enriched.find(x => x.title && x.title.toLowerCase().includes(name));
  if (f) console.log(`\n⚠️  ${f.title} (${f.year})\n   kw: ${f.keywords.slice(0,10).join(', ')}`);
}

// Verify anime count
const animeCount = enriched.filter(f => (f.keywords || []).includes('anime')).length;
console.log(`\n🎌 Filmes com keyword 'anime': ${animeCount} (esperado: ~${ANIME_SLUGS.size})`);

// Verify war count
const warCount = enriched.filter(f => (f.keywords || []).includes('guerra bélica')).length;
console.log(`⚔️  Filmes com keyword 'guerra bélica': ${warCount} (esperado: ~${REAL_WAR_FILM_SLUGS.size})`);

// Write
const outputPath = resolve(__dirname, '..', '..', 'src', 'data', 'films-dataset.js');
const header = `/**
 * Letterboxd AI Curator - Massive Official IMDb Curated Film Database
 * ${enriched.length} 100% REAL feature films officially imported from IMDb Datasets.
 * Enriched with precise thematic keywords, director styles, country tags, and decade context.
 */

export const EXPANDED_FILM_DATABASE = `;

writeFileSync(outputPath, header + JSON.stringify(enriched, null, 2) + ';\n', 'utf-8');
console.log(`\n✅ Banco de dados enriquecido gravado: ${enriched.length} filmes → ${outputPath}`);
