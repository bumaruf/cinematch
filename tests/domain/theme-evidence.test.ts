import { expect, test } from 'vitest';
import { themeEligibility } from '../../src/domain/recommend/theme-eligibility.ts';
import { getThemeCriteria } from '../../src/domain/themes/themes.ts';
import { recommend } from '../../src/domain/recommend/engine.ts';
import { createCatalog } from '../../src/domain/catalog/catalog.ts';
import { film } from '../fixtures/catalog.ts';

test.each([
  ['slow-cinema-contemplative', ['Drama'], 'Um homem solitário visita uma cidade rural.'],
  ['mindfuck-broken-reality', ['Sci-Fi'], 'O sonho de criar um parque de dinossauros se torna um pesadelo.'],
  ['existential-urban-melancholy', ['Drama'], 'Uma família vive isolada numa montanha.'],
  ['whimsical-cozy-comfort', ['Drama'], 'Uma amizade na família desaba em luto e tragédia.'],
  ['claustrophobic-single-location', ['Drama'], 'Um homem passa décadas numa prisão e depois foge.'],
  ['claustrophobic-single-location', ['Drama'], 'This chamber drama follows a family on roads and markets.'],
  ['existential-urban-melancholy', ['Drama'], 'A rural village loses its inhabitants to the city while a couple faces loneliness.'],
  ['dreamlike-magical-realism', ['Drama'], 'Uma surreal história de fama nos bastidores da televisão.'],
  ['acid-satire-dark-comedy', ['Comedy'], 'Uma sociedade recebe amigos numa festa.'],
  ['philosophical-hard-scifi', ['Sci-Fi'], 'Cientistas encontram um alien num laboratório.'],
])('incidental plot words do not prove %s', (themeId, genres, pitch) => {
  const candidate = film('candidate', { genres: genres as string[], pitch: pitch as string });
  expect(themeEligibility(candidate, getThemeCriteria(themeId as string)).eligible).toBe(false);
  expect(recommend({ themeId: themeId as string, profile: null }, createCatalog([candidate]), new Date('2026-10-07T15:00:00Z')).recommendations).toEqual([]);
});

test('positive style evidence and sourced single-film annotations retain contemplative candidates', () => {
  const criteria = getThemeCriteria('slow-cinema-contemplative');
  expect(themeEligibility(film('explicit', { pitch: 'Drama contemplativo com planos longos.' }), criteria).eligible).toBe(true);
  expect(themeEligibility(film('denied', { pitch: 'Um drama sem ritmo lento e sem planos longos.' }), criteria).eligible).toBe(false);
  expect(themeEligibility(film('reviewed', { imdbId: 'tt0073198' }), criteria).eligible).toBe(true);
  expect(themeEligibility(film('same-director', { director: 'Chantal Akerman' }), criteria).eligible).toBe(false);
});

test('film-specific plot and mood tags still need the promised cinematic trait', () => {
  const spaceship = film('spaceship', { genres: ['Horror', 'Sci-Fi'], keywordEvidence: [{ term: 'dystopia', source: 'film' }, { term: 'android', source: 'film' }] });
  expect(themeEligibility(spaceship, getThemeCriteria('cyberpunk-neon-noir')).eligible).toBe(false);
  const characterStudy = film('character-study', { genres: ['Crime', 'Drama'], keywordEvidence: [{ term: 'meditative', source: 'film' }] });
  expect(themeEligibility(characterStudy, getThemeCriteria('slow-cinema-contemplative')).eligible).toBe(false);
  const aspiration = film('aspiration', { keywordEvidence: [{ term: 'dreams', source: 'film' }, { term: 'fantasy', source: 'film' }] });
  expect(themeEligibility(aspiration, getThemeCriteria('dreamlike-magical-realism')).eligible).toBe(false);
  const magical = film('magical', { genres: ['Adventure', 'Drama', 'Fantasy'], keywordEvidence: [{ term: 'magic realism', source: 'film' }] });
  expect(themeEligibility(magical, getThemeCriteria('dreamlike-magical-realism')).eligible).toBe(true);
});
