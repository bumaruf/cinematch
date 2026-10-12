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

  // Reviewed 2026-10-12. Scope each observation to its intended climate:
  // a long take in a tense chamber film does not make it contemplative.
  tt0040746: { text: 'Tensão em planos longos, concentrada num único cenário: o apartamento dos assassinos.', source: 'https://www.bfi.org.uk/lists/10-great-films-set-one-location', themes: ['claustrophobic-single-location'] },
  tt0037017: { text: 'Sobreviventes confinados num único cenário: um bote salva-vidas em alto-mar.', source: 'https://www.bfi.org.uk/lists/10-great-films-set-one-location', themes: ['claustrophobic-single-location'] },
  tt0275719: { text: 'Confronto em tempo real num único cenário: um quarto de motel.', source: 'https://www.bfi.org.uk/lists/10-great-films-set-one-location', themes: ['claustrophobic-single-location'] },
  tt1462758: { text: 'Suspense inteiramente num único cenário: um caixão com um homem enterrado vivo.', source: 'https://www.bfi.org.uk/lists/10-great-films-set-one-location', themes: ['claustrophobic-single-location'] },
  tt0046912: { text: 'Suspense concentrado principalmente num único cenário: um apartamento londrino.', source: 'https://www.bfi.org.uk/film/c27871c6-eb5d-538b-bcd1-7e22de9d752c/dial-m-for-murder', themes: ['claustrophobic-single-location'] },
  tt6742252: { text: 'Suspense num único cenário, acompanhando um policial na central de chamadas de emergência.', source: 'https://www.bfi.org.uk/news/62nd-bfi-london-film-festival-programme-announced', themes: ['claustrophobic-single-location'] },
  tt1258197: { text: 'Tensão entre candidatos num único cenário: a sala sem janelas de um exame corporativo.', source: 'https://stage.nonstopentertainment.com/en/katalog/exam/', themes: ['claustrophobic-single-location'] },
  tt1692486: { text: 'Confronto entre dois casais concentrado num único cenário: um apartamento.', source: 'https://www.sonyclassics.com/carnage/_pdf/carnage_presskit.pdf', themes: ['claustrophobic-single-location'] },
  tt1226681: { text: 'Terror com ação concentrada num único cenário principal: o estúdio de uma rádio no subsolo.', source: 'https://bfidatadigipres.github.io/in%20dreams%20are%20monsters/2022/10/31/pontypool/', themes: ['claustrophobic-single-location'] },

  tt0111341: { text: 'Slow cinema de planos longos e observação minuciosa de uma comunidade rural.', source: 'https://www.bfi.org.uk/features/where-begin-bela-tarr', themes: ['slow-cinema-contemplative'] },
  tt0249241: { text: 'Drama contemplativo construído em trinta e nove planos longos.', source: 'https://www.criterion.com/films/33388-werckmeister-harmonies', themes: ['slow-cinema-contemplative'] },
  tt1316540: { text: 'Cinema de planos longos que observa a repetição da rotina de um pai e sua filha.', source: 'https://www.cinemaguild.com/theatrical/downloads/turin/press.pdf', themes: ['slow-cinema-contemplative'] },
  tt0086022: { text: 'Cinema contemplativo com movimentos lentos de câmera e planos longos.', source: 'https://www.bfi.org.uk/lists/5-things-watch-weekend-22-24-november', themes: ['slow-cinema-contemplative'] },
  tt0091670: { text: 'Drama espiritual de planos longos e composição visual rigorosa.', source: 'https://www.bfi.org.uk/lists/10-great-last-films', themes: ['slow-cinema-contemplative'] },
  tt0468526: { text: 'Drama contemplativo de observação discreta de uma amizade durante uma viagem.', source: 'https://www.criterion.com/films/29062-old-joy', themes: ['slow-cinema-contemplative'] },
  tt1152850: { text: 'Drama contemplativo atento aos ritmos da vida cotidiana.', source: 'https://www.criterion.com/current/posts/4945-maile-meloy-s-journey-from-page-to-screen', themes: ['slow-cinema-contemplative'] },
  tt5247022: { text: 'Ritmo lento e observação do cotidiano ao longo de sete dias na vida de um poeta e motorista.', source: 'https://www.bfi.org.uk/sight-and-sound/reviews/film-week-paterson-jim-jarmuschs-retro-idyll', themes: ['slow-cinema-contemplative'] },
  tt27503384: { text: 'Drama contemplativo que demora o olhar nos gestos e na rotina diária de um trabalhador.', source: 'https://www.criterion.com/current/posts/8536-perfect-days-where-the-light-comes-through', themes: ['slow-cinema-contemplative'] },
  tt0346094: { text: 'Drama contemplativo de ritmo lento e observação distanciada da solidão de dois homens.', source: 'https://www.nuribilgeceylan.com/movies/uzak/press_bbc.php', themes: ['slow-cinema-contemplative'] },
};
