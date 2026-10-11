/** Editorial annotations keyed to a single film, never inherited from a director.
 * These support testable traits; audience fit still requires the evaluation pilot.
 */
export const REVIEWED_THEME_EVIDENCE: Readonly<Record<string, { text: string; source: string; additionalGenres?: readonly string[]; themes?: readonly string[] }>> = {
  tt0083658: { text: 'Cyberpunk e neo-noir numa distopia de replicantes.', source: 'https://www.bfi.org.uk/features/blade-runner' },
  tt0113568: { text: 'Cyberpunk sobre identidade, consciência e inteligência artificial.', source: 'https://www.bfi.org.uk/features/where-begin-japanese-cyberpunk', additionalGenres: ['Sci-Fi', 'Animation'] },
  tt0093870: { text: 'Cyberpunk numa distopia corporativa com um policial ciborgue.', source: 'https://www.bfi.org.uk/lists/10-great-films-about-artificial-intelligence' },
  tt0133093: { text: 'Cyberpunk de hackers e realidade virtual.', source: 'https://www.bfi.org.uk/lists/six-films-ghost-shell-scarlett-johansson' },
  tt0050083: { text: 'Drama de tensão concentrado num único cenário: a sala dos jurados.', source: 'https://www.criterion.com/films/27871-12-angry-men' },
  tt2692904: { text: 'Tensão num único cenário: o interior de um carro.', source: 'https://player.bfi.org.uk/rentals/film/watch-locke-2014-online' },
  tt0079944: { text: 'Cinema contemplativo de planos longos; ficção científica filosófica.', source: 'https://www.criterion.com/films/28150-stalker' },
  tt0073198: { text: 'Cinema contemplativo com planos longos e duração da rotina doméstica.', source: 'https://www.criterion.com/current/posts/1215' },
  tt0046438: { text: 'Drama contemplativo de enquadramentos estáticos e observação familiar.', source: 'https://www.criterion.com/current/posts/301-tokyo-story' },
  tt0109424: { text: 'Desencontros e solidão na cidade de Hong Kong.', source: 'https://www.criterion.com/current/posts/766-chungking-express-electric-youth' },
  tt0166924: { text: 'Sonho e realidade fragmentados; narrativa não linear.', source: 'https://www.criterion.com/current/posts/3776-lim-on-lynch-mulholland-dr', themes: ['mindfuck-broken-reality'] },
  tt7784604: { text: 'Terror de construção slow burn antes de um desfecho intenso.', source: 'https://www.bfi.org.uk/lists/great-horror-film-from-every-year-from-1922-now' },
};
