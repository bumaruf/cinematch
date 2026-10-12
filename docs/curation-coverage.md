# Ampliação de cobertura e revisão de metadados

Rodada de 12 de outubro de 2026, após a primeira amostra qualitativa com o
perfil do mantenedor. A recepção positiva daquela amostra não foi convertida
em uma taxa de precisão. Esta etapa amplia a evidência disponível para os dois
climas com menor cobertura e revisita os registros incompletos do catálogo.

## Cobertura dos climas

Foram acrescentadas 19 observações editoriais, cada uma vinculada ao IMDb ID
de um filme e ao clima que ela sustenta. Não houve herança por diretor nem
relaxamento dos contratos de gênero ou dos filtros do usuário. Por exemplo,
os planos longos de *Rope* sustentam a observação sobre sua tensão espacial;
essa anotação não torna o filme elegível para cinema contemplativo.

| Conjunto antes do histórico e dos filtros | Antes | Depois |
| --- | ---: | ---: |
| Um único cenário, evidência específica | 2 | 11 |
| Cinema lento, evidência específica | 5 | 15 |

São títulos que já existiam no catálogo de 25.000 filmes. A mudança permite
reconhecer características que suas sinopses e palavras-chave não descreviam
adequadamente; não representa a importação de novos filmes.

As novas observações de um único cenário são:

- *Rope*, *Lifeboat*, *Tape* e *Buried*: concentração espacial descrita pelo
  [BFI](https://www.bfi.org.uk/lists/10-great-films-set-one-location).
- *Dial M for Murder*: o [BFI descreve a concentração predominante no apartamento](https://www.bfi.org.uk/film/c27871c6-eb5d-538b-bcd1-7e22de9d752c/dial-m-for-murder).
- *The Guilty* (2018): classificação como suspense de uma locação na
  [programação oficial do festival do BFI](https://www.bfi.org.uk/news/62nd-bfi-london-film-festival-programme-announced).
- *Exam*: exame e conflito concentrados na sala descrita pela
  [distribuidora NonStop](https://stage.nonstopentertainment.com/en/katalog/exam/).
- *Carnage*: concentração no apartamento detalhada no
  [material de produção da Sony Pictures Classics](https://www.sonyclassics.com/carnage/_pdf/carnage_presskit.pdf).
- *Pontypool*: a ação principal no estúdio de rádio, conforme as
  [notas de programação do BFI](https://bfidatadigipres.github.io/in%20dreams%20are%20monsters/2022/10/31/pontypool/).

As novas observações de cinema lento são:

- *Sátántangó*: duração e observação minuciosa descritas pelo
  [BFI](https://www.bfi.org.uk/features/where-begin-bela-tarr).
- *Werckmeister Harmonies*: construção em planos longos descrita pela
  [Criterion](https://www.criterion.com/films/33388-werckmeister-harmonies).
- *The Turin Horse*: planos longos e repetição do cotidiano no
  [material da distribuidora Cinema Guild](https://www.cinemaguild.com/theatrical/downloads/turin/press.pdf).
- *Nostalghia*: sequências de cinema lento descritas pelo
  [BFI](https://www.bfi.org.uk/lists/5-things-watch-weekend-22-24-november).
- *The Sacrifice*: composição e duração dos planos descritas pelo
  [BFI](https://www.bfi.org.uk/lists/10-great-last-films).
- *Old Joy*: caráter contemplativo descrito pela
  [Criterion](https://www.criterion.com/films/29062-old-joy).
- *Wendy and Lucy*: observação do cotidiano discutida pela
  [Criterion](https://www.criterion.com/current/posts/4945-maile-meloy-s-journey-from-page-to-screen).
- *Paterson*: ritmo deliberado e repetição dos dias discutidos pelo
  [BFI](https://www.bfi.org.uk/sight-and-sound/reviews/film-week-paterson-jim-jarmuschs-retro-idyll).
- *Perfect Days*: observação paciente dos gestos e da rotina discutida pela
  [Criterion](https://www.criterion.com/current/posts/8536-perfect-days-where-the-light-comes-through).
- *Uzak*: ritmo e observação contemplativa descritos em crítica da BBC
  [preservada no site do realizador](https://www.nuribilgeceylan.com/movies/uzak/press_bbc.php).

Essas classificações são interpretações editoriais apoiadas em fontes; não
substituem o julgamento de quem assiste. “Um único cenário” abrange a
concentração da ação principal, como já ocorria com *12 Angry Men*, e não
afirma que todo fotograma se passa no mesmo cômodo. As anotações de *Dial M
for Murder* e *Pontypool* conservam essa ressalva.

## Efeito dos filtros

A auditoria passou a registrar a cobertura específica por mínimo de votos,
antes do histórico pessoal:

| Clima | Sem mínimo | 10 mil votos | 50 mil votos | 250 mil votos |
| --- | ---: | ---: | ---: | ---: |
| Cinema lento | 15 | 13 | 4 | 0 |
| Um único cenário | 11 | 11 | 8 | 1 |

No perfil público de 936 filmes usado no piloto, com bloqueio de assistidos e
sem mínimo de votos, os dois climas retornaram seis indicações com evidência
específica. Com o mínimo de 250.000 votos mostrado anteriormente pelo
mantenedor, cinema lento retornou uma alternativa próxima; um único cenário,
duas alternativas próximas. Nenhuma indicação específica sobreviveu à
combinação desse mínimo com o histórico do perfil.

Isso explica por que ampliar a revisão editorial não garante seis resultados
com qualquer configuração. Os filtros não foram alterados automaticamente.
O cenário controlado não lê as configurações atuais, o feedback privado nem
o histórico de recomendações salvo no Chrome.

## Metadados

`npm run catalog:tmdb` revisitou os 888 filmes com lacunas de país, duração ou
sinopse, usando `TMDB_RETRY_INCOMPLETE=1`. Foram encontrados 485 registros no
TMDB; 403 continuaram sem correspondência. A revisão preencheu três países,
três sinopses e uma duração, em seis filmes distintos. A identidade IMDb foi
preservada, com backups locais antes das gravações. Não foi usada uma
estimativa para completar campos desconhecidos.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Filmes | 25.000 | 25.000 |
| País desconhecido | 860 | 857 |
| Duração desconhecida | 45 | 44 |
| Duração sem procedência | 0 | 0 |
| Sinopse genérica ou ausente | 447 | 444 |

Encontrar um registro no TMDB não significa que ele tenha todos esses campos.
As lacunas restantes continuam reconhecidas como desconhecidas e limitam os
filtros correspondentes. O pipeline também atualizou quatro entradas de
pôsteres, duas delas antes ausentes. Os dados gerados e checkpoints completos
continuam locais, conforme a política do repositório.

## Verificação

- `npm run check`: typecheck, 293 testes e build aprovados.
- Auditoria dos 15 climas: nenhuma violação dos contratos dos resultados.
- Verificação com catálogo real, perfil do piloto e mínimos de zero e 250 mil
  votos: respeitou a popularidade mínima e não reapresentou filmes
  reconhecidos pelo índice de assistidos.
- Regressões sintéticas, disponíveis também sem o catálogo real, protegem a
  separação entre evidência espacial e ritmo contemplativo, o bloqueio de
  assistidos e os filtros de gênero e duração desconhecida.

A versão da curadoria passou a `2026-10-12.1`, permitindo distinguir futuras
avaliações desta seleção das anteriores. `npm run diagnostics:themes` repete
a auditoria de cobertura. Os relatórios locais com os valores anteriores,
alterações de metadados e cenários do perfil estão em
`e2e-screenshots/coverage-2026-10-12/`. Não são avaliações humanas novas nem
foram publicados no GitHub.
