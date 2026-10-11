# Avaliação e revisão da curadoria

Rodada local de 7 de outubro de 2026, começando pelo perfil do mantenedor.
Abrange três frentes: preparar a avaliação real, refinar os climas subjetivos e
conferir os metadados usados pelos filtros. A implementação está pronta para o
piloto; nenhuma resposta humana foi inventada ou coletada automaticamente.

## Correção de disponibilidade após uso real

O mantenedor relatou listas vazias na extensão. A regra inicial desta rodada
deixou o conjunto de alguns climas pequeno demais: com um histórico de 1.500
filmes populares, Cyberpunk e Um só cenário ficaram sem opções. O teste inicial
no navegador usava apenas 60 assistidos e não cobria esse esgotamento.

A curadoria agora mantém os candidatos com evidência específica primeiro. Quando
há menos de seis, pode completar com filmes de contexto próximo, avaliados por
grupos próprios de sinais no filme e identificados como **Próximo ao clima** no
card. Há um aviso na lista; a proximidade não é apresentada como confirmação de
ritmo, estética ou concentração em um cenário. Tags herdadas ou sem procedência
continuam sem comprovar essas características. Gêneros, duração, período,
assistidos e feedback continuam valendo.

As regras de proximidade acrescentam 15 candidatos para Cyberpunk, 50 para Cinema
lento, 113 para Realismo mágico, 32 para Um só cenário e 20 para Comfort cinema,
antes dos filtros e do histórico. A recomendação automática prioriza afinidades fortes e completa
a lista quando elas se esgotam, sem inventar uma justificativa de afinidade.
Sugestões anteriores ainda não assistidas podem ser reutilizadas se a busca geral
esgotar as opções recentes.

Quando um pedido não tem resultados, **Ver sugestões gerais** inicia uma busca
sem texto, clima, período, duração, filtro de obscuros ou mínimo de votos. A
exclusão de assistidos e o feedback permanecem como o usuário os configurou.
O relatório de avaliação registra quais filmes eram sugestões próximas e a versão
`2026-10-07.2`, distinguindo essa correção da seleção anterior.

## Correção de identidade dos assistidos

Em 10 de outubro, um relato mostrou Harry Potter e a Pedra Filosofal apesar do
bloqueio de assistidos estar ativo. O caso foi reproduzido: o catálogo usa o
título americano **Sorcerer's Stone**, enquanto o histórico do Letterboxd usa
**Philosopher's Stone**. Os nomes e slugs diferentes impediam a identificação
do mesmo filme, inclusive nas sugestões próximas ao clima.

A resolução agora indexa esses nomes revisados, vinculados ao IMDb ID
`tt0241527` e ao ano 2001. A equivalência consta na
[página do filme no Letterboxd](https://letterboxd.com/film/harry-potter-and-the-philosophers-stone/).
O identificador IMDb acompanha o enriquecimento e as novas indicações; quando
disponível, identifica o filme mesmo após uma mudança de título ou slug.
Registros antigos continuam aceitos. Apostrofes tipográficos e simples passam
a ter a mesma normalização; títulos curtos não resolvem outro filme apenas por
aparecerem dentro do nome dele. Continuações e remakes permanecem distintos.

Listas antigas reabertas no popup aplicam a configuração atual e o histórico
sincronizado antes de exibir os filmes. O cache diário da regra anterior é
invalidado. Nada disso substitui a sincronização de novas marcações feitas no
Letterboxd depois do último histórico salvo.

## Avaliação com seu perfil

Depois de recarregar a extensão em `chrome://extensions`, abra o painel,
confira seu perfil sincronizado e gere uma lista. A seção opcional
**Avaliar estas indicações**, abaixo dos filmes, permite responder um filme por
vez: em que você se baseia, se combina com o pedido, se teria vontade de assistir
e qual foi o principal problema. Salvar novamente atualiza a resposta daquele
filme naquela lista. Não cria uma segunda avaliação do mesmo resultado.

Em **Seu perfil → Avaliações da curadoria**, acompanhe as contagens, exporte o
JSON ou apague as respostas. Tudo fica neste navegador. O arquivo inclui pedidos
e comentários, mas exclui o nome do perfil e seu histórico importado de filmes e
notas. A avaliação não modifica o Letterboxd nem treina o motor automaticamente.

Um roteiro inicial útil:

1. Escolha cinco climas que você conhece bem e avalie até três filmes por clima.
   Para julgar filmes vistos, desative temporariamente **Evitar assistidos** nas
   configurações. A avaliação pode registrar que um filme combina, mesmo quando
   você não quer reassisti-lo.
2. Reative **Evitar assistidos** e teste indicações inéditas. Marque se conhece
   o filme ou está julgando apenas a sinopse; registre a vontade de assistir
   separadamente da adequação ao clima.
3. Teste também pedidos em texto e altere um filtro por vez. Registre o motivo
   de um desacordo: clima, gosto, interpretação, metadados ou filme já visto.
   Evite mudar tudo entre duas listas comparadas.
4. Após cerca de 30 respostas distribuídas por climas e pedidos, exporte o arquivo
   para revisar os erros recorrentes. Essa quantidade é uma meta prática para
   encontrar problemas, sem significar confiança estatística sobre outros usuários.

Filmes vistos e expectativas têm denominadores separados. “Não sei avaliar”
fica fora das taxas de adequação. “Em parte” participa do denominador, mas não
conta como acerto completo. Vontade de assistir conta apenas “Sim”; “Talvez”
continua registrado na resposta. O mesmo filme em listas diferentes corresponde
a julgamentos diferentes, não a pessoas independentes ou filmes únicos.

Cada lista conserva versão da curadoria, pedido, interpretação, filtros,
tamanho do perfil e do catálogo, ordem e quantidade de filmes apresentados.
Isso permite entender um erro no contexto em que ocorreu. Listas geradas antes
desta rodada não possuem esse contexto e precisam ser geradas novamente para
avaliação. O histórico guarda 30 buscas; o registro deve ocorrer enquanto a
lista ainda está nele. Avaliações já salvas permanecem separadas, até o limite
de 200 listas no total.

Os modos de descoberta foram retirados em 10 de outubro; as sugestões agora
seguem um único comportamento automático. Avaliações antigas conservam o modo
registrado no contexto original, sem alterar as respostas salvas.

## Climas: o que foi corrigido

O problema principal era confundir assunto do enredo com forma e atmosfera.
Uma prisão não comprova que o filme inteiro se passa em um cenário; isolamento
não comprova cinema lento; amizade ou família não tornam uma tragédia
reconfortante; sonhar em construir algo não comprova realidade fragmentada.

Agora os climas exigem grupos de evidência específicos. Cyberpunk precisa de
estética ou classificação própria além da tecnologia; distopia e androide
sozinhos não bastam. Cinema lento exige descrição de ritmo ou forma, sem aceitar
apenas a tag “meditativo”. Melancolia urbana precisa de cidade e alienação.
Um só cenário exige evidência dessa concentração espacial. Realismo mágico
reconhece a expressão `magic realism`, mas fantasia e sonhos genéricos não bastam.

Sinopses reais, termos com origem no próprio filme e anotações editoriais com
fontes participam da elegibilidade. Tags herdadas do diretor, expandidas pelo
gênero ou sem procedência não comprovam o clima. As frases não são formadas
juntando campos independentes e negações simples próximas ao termo são
descartadas. A análise continua baseada em regras, com limites em frases complexas.

Foram consultadas palavras-chave específicas de **270 filmes**, selecionados
entre candidatos de maior quantidade de votos dos climas. Os rótulos antigos
serviram apenas para escolher o que consultar. A API oferece
[palavras-chave por filme](https://developer.themoviedb.org/reference/movie-keywords),
acrescentadas à consulta de
[detalhes do filme](https://developer.themoviedb.org/reference/movie-details).
Essa amostra favorece títulos conhecidos e não representa a cobertura integral
dos 25 mil filmes. A procedência de uma tag não garante, sozinha, seu acerto
editorial: Alien tinha “distopia” e “androide”, enquanto Taxi Driver tinha
“meditativo”; esses casos levaram à correção dos critérios e a regressões próprias.

Também existem 12 anotações editoriais ligadas ao IMDb ID, sem herança entre
filmes do mesmo diretor. Por exemplo, a
[Criterion descreve a concentração espacial de 12 Angry Men](https://www.criterion.com/films/27871-12-angry-men)
e o [BFI descreve Locke no interior do carro](https://player.bfi.org.uk/rentals/film/watch-locke-2014-online).
As fontes de cada anotação ficam em `src/domain/themes/reviewed-evidence.ts`.
São interpretações editoriais apoiadas em fontes, ainda sujeitas à avaliação do piloto.

O motor deixou de preencher a lista relaxando a exigência de evidência para
zero. A correção de disponibilidade permite alternativas explicitamente próximas
com requisitos próprios; ainda pode apresentar menos de seis filmes quando os
filtros ou o histórico esgotam também essas opções. A auditoria dos 15 climas
confere resultados exatos e próximos contra seus respectivos contratos;
cumprir essas regras não mede precisão humana ou satisfação.

## Metadados: revisão por identificador

Os **25.000 IMDb IDs** do catálogo foram encontrados no dataset oficial, sem
substituir a seleção por um novo catálogo. A fonte define duração em
`runtimeMinutes` e campo ausente como `\N`:
[documentação dos datasets do IMDb](https://data.imdb.com/non-commercial-datasets/).
A revisão corrigiu 70 valores: 67 eram durações desconhecidas que estavam
registradas como 100 minutos e três tinham outra duração na fonte. Durações
legítimas de 100 minutos foram preservadas.

A primeira consulta TMDB revisitou 909 registros incompletos: 504 tiveram
resultado e 405 não tiveram um filme correspondente. Ela preencheu nove países,
22 durações e oito sinopses genéricas. O checkpoint foi corrigido para permitir
revisão de lacunas antigas; consultas recentes sem informação não são repetidas
em toda execução, salvo solicitação explícita do operador. Países existentes
foram conferidos contra os dados já presentes no checkpoint quando coincidiam.

| Medida | Antes | Após IMDb e TMDB |
|---|---:|---:|
| Filmes no catálogo | 25.000 | 25.000 |
| País desconhecido | 869 | 860 |
| Duração sem procedência registrada | 25.000 | 0 |
| Duração desconhecida reconhecida como tal | 0 | 45 |
| País com procedência TMDB registrada | 0 | 24.140 |
| Sinopse genérica ou ausente | 455 | 447 |

“Zero sem procedência” significa que as durações foram conferidas, inclusive
os casos em que a fonte não tem um valor. Não significa duração conhecida em
todos os filmes. As 45 desconhecidas continuam fora de filtros que exigem
duração; país desconhecido continua sem satisfazer um pedido por país.
Restam 863 filmes com pelo menos uma dessas duas lacunas. Nenhum valor foi
inventado para completar a contagem.

`npm run catalog:verify -- --apply` repete a revisão com backup e gravação por
arquivo temporário. `npm run catalog:tmdb` retoma o enriquecimento. Dados,
checkpoints, backups e os relatórios completos permanecem locais; credenciais
são lidas do ambiente e não entram nos arquivos gerados. O mapa de pôsteres
continua versionado, como nas rodadas anteriores.

## Verificação e limites

Após a remoção dos modos em 10 de outubro, `npm run check` passou com typecheck,
**291 testes em 27 arquivos** e build, incluindo a correção de identidade dos
assistidos.
O teste da extensão no Chrome for Testing passou pelas telas, geração de
indicações, salvos, feedback e pelo fluxo de avaliação: salvar, reabrir,
exportar e apagar. Não houve erros de página, console ou service worker.
Também confirmou a ausência do seletor e os estilos do popup e do painel,
resultados nos 15 climas com mais de 1.500 assistidos e recuperação de buscas
vazias nas duas telas.
O cenário de Harry Potter importou o título e o slug britânicos do Letterboxd,
permitiu o filme com o bloqueio desligado e o excluiu ao ativá-lo, com mínimo de
250 mil votos. A mesma regra foi confirmada na restauração de uma lista antiga
do popup.

Os testes protegem falsos positivos, procedência das palavras-chave, duração
desconhecida, identidade e atualização concorrente das avaliações, separação das
respostas e exportação sem o nome do perfil. O teste no navegador usa um perfil
temporário: suas respostas de teste não são avaliações humanas e não entram no
perfil do mantenedor.

`npm run diagnostics:themes` gera `e2e-screenshots/theme-quality.json` com os
candidatos, proximidades e as violações dos contratos. A cobertura continua desigual: há
poucos filmes com evidência específica de cinema lento e de um único cenário.
Ampliar essas listas exige revisar mais filmes ou fontes, mantendo os critérios.

Alguns tamanhos do conjunto elegível na auditoria, antes de aplicar o histórico
e os filtros de um usuário:

| Clima | Filmes com evidência suficiente |
|---|---:|
| Cyberpunk | 7 |
| Cinema lento | 5 |
| Realidades fragmentadas | 37 |
| Realismo mágico | 12 |
| Um único cenário | 2 |
| Comfort cinema | 37 |

Os resultados dos 15 climas tiveram zero violações dos contratos definidos.
Essa métrica mede a aplicação das regras; as regras e a relevância dos filmes
ainda precisam ser julgadas no piloto.

O piloto com um perfil serve para identificar e corrigir casos concretos.
A qualidade para outros gostos continua sem medição. As 447 sinopses genéricas
e demais lacunas também limitam descoberta e precisão. O bundle do service
worker permanece perto de 27 MB e recebe aviso de tamanho no build. Melhorar
linguagem composta, aprender padrões de feedback e reduzir esse peso são as
frentes seguintes; esta rodada se concentra nas três primeiras.
