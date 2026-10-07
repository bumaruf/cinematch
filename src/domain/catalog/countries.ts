import { foldWords } from '../text.ts';

/** Aliases describe production origin, never a word in a title or synopsis. */
export const COUNTRIES: readonly { code: string; label: string; aliases: readonly string[] }[] = [
  { code: 'BR', label: 'Brasil', aliases: ['brasil', 'brazil', 'brasileiro', 'brasileira', 'brasileiros', 'brasileiras', 'nacional'] },
  { code: 'IT', label: 'Itália', aliases: ['italia', 'italy', 'italiano', 'italiana', 'italianos', 'italianas'] },
  { code: 'US', label: 'Estados Unidos', aliases: ['estados unidos', 'united states of america', 'united states', 'americano', 'americana', 'eua', 'hollywood'] },
  { code: 'GB', label: 'Reino Unido', aliases: ['reino unido', 'united kingdom', 'great britain', 'britanico', 'britanica', 'ingles', 'inglesa', 'uk'] },
  { code: 'JP', label: 'Japão', aliases: ['japao', 'japan', 'japones', 'japonesa'] },
  { code: 'KR', label: 'Coreia do Sul', aliases: ['coreia do sul', 'south korea', 'coreano', 'coreana', 'sul coreano', 'sul coreana'] },
  { code: 'FR', label: 'França', aliases: ['franca', 'france', 'frances', 'francesa'] },
  { code: 'DE', label: 'Alemanha', aliases: ['alemanha', 'germany', 'alemao', 'alema'] },
  { code: 'ES', label: 'Espanha', aliases: ['espanha', 'spain', 'espanhol', 'espanhola'] },
  { code: 'IN', label: 'Índia', aliases: ['india', 'indiano', 'indiana'] },
  { code: 'IR', label: 'Irã', aliases: ['ira', 'iran', 'iraniano', 'iraniana', 'persa'] },
  { code: 'CN', label: 'China', aliases: ['china', 'chines', 'chinesa'] },
  { code: 'HK', label: 'Hong Kong', aliases: ['hong kong'] },
  { code: 'TW', label: 'Taiwan', aliases: ['taiwan', 'taiwanes', 'taiwanesa'] },
  { code: 'AR', label: 'Argentina', aliases: ['argentina', 'argentino'] },
  { code: 'MX', label: 'México', aliases: ['mexico', 'mexicano', 'mexicana'] },
  { code: 'PT', label: 'Portugal', aliases: ['portugal', 'portugues', 'portuguesa'] },
  { code: 'RU', label: 'Rússia', aliases: ['russia', 'russo', 'russa', 'soviet union', 'ussr', 'urss', 'sovietico', 'sovietica'] },
  { code: 'SE', label: 'Suécia', aliases: ['suecia', 'sweden', 'sueco', 'sueca'] },
  { code: 'DK', label: 'Dinamarca', aliases: ['dinamarca', 'denmark', 'dinamarques', 'dinamarquesa'] },
  { code: 'CA', label: 'Canadá', aliases: ['canada', 'canadense'] },
  { code: 'AU', label: 'Austrália', aliases: ['australia', 'australiano', 'australiana'] },
  { code: 'IE', label: 'Irlanda', aliases: ['irlanda', 'ireland', 'irlandes', 'irlandesa'] },
  { code: 'PL', label: 'Polônia', aliases: ['polonia', 'poland', 'polones', 'polonesa'] },
  { code: 'TR', label: 'Turquia', aliases: ['turquia', 'turkey', 'turkiye', 'turco', 'turca'] },
];

export function productionCountries(country: string | undefined): Set<string> {
  const names = (country ?? '').split(/[,;/]/).map(foldWords);
  return new Set(names.filter(Boolean).map((name) => COUNTRIES.find((item) => item.aliases.includes(name))?.code ?? name));
}
