# Interpretação das buscas

Rodada local de 12 de outubro de 2026. A interpretação continua local e baseada
em regras. Não usa serviço de IA, credenciais ou uma nova permissão da extensão.

Antes, “suspense ou ficção científica” exigia ambos os gêneros, e uma negação
podia atingir termos depois de uma vírgula. Limites repetidos também podiam
sobrescrever um recorte mais restritivo. A busca agora distingue alternativas,
delimita negações e intersecta os limites informados.

## Pedidos reconhecidos

| Pedido | Critérios aplicados |
| --- | --- |
| `suspense ou ficção científica, sem terror, até 1h40` | Um dos dois gêneros, nenhum Horror, duração conhecida de até 100 minutos. |
| `comédia e romance` | O filme precisa dos dois gêneros. |
| `romcom ou drama` | Comedy + Romance, ou Drama; o alias composto conserva os dois requisitos. |
| `suspense italiano ou drama francês` | Thriller produzido na Itália, ou Drama produzido na França; os pares não se misturam. |
| `drama italiano ou francês` | Drama produzido em um dos dois países, inclusive coproduções. |
| `suspense ou ficção científica, japonês` | A origem japonesa vale para as duas alternativas. |
| `sem terror, comédia francesa` | Horror fica excluído; Comedy e produção francesa são obrigatórios. |
| `sem terror nem romance` | Exclui ambos os gêneros. |
| `não só suspense, mas também ficção científica` | Exige ambos; “não só” não é uma exclusão. |
| `suspense, não precisa ser americano` | Thriller sem exigência ou exclusão da origem americana. |
| `drama entre 90 e 120 minutos` | Duração conhecida, incluindo os limites de 90 e 120 minutos. |
| `drama entre 1h30 e 2 horas` | O mesmo intervalo, expresso em horas. |
| `drama até 120 min até 100 min` | Aplica o menor teto, independentemente da ordem. |
| `drama depois de 1980 a partir de 1990 até 1995` | Anos de 1990 a 1995, incluindo os limites. |
| `não mais de 120 min, suspense` | Até 120 minutos e Thriller. A negação consumida pela duração não se espalha ao gênero. |
| `“Brazil”` ou `“1984”` | Busca de título literal, sem interpretar país ou ano. |

Dentro de cada alternativa, `e` e termos adjacentes acumulam requisitos.
`ou` separa alternativas de gêneros e países. Vírgulas, ponto e vírgula e
transições como `mas` encerram a cláusula anterior; uma nova cláusula positiva
vale junto com as anteriores. Use uma vírgula para deixar explícito um critério
compartilhado: `suspense ou ficção científica, japonês`.

As exclusões reconhecidas valem para todos os resultados. Assim,
`comédia ou drama, sem comédia` ainda pode retornar Drama, desde que não tenha
Comedy. O motor não invalida um pedido quando resta uma alternativa possível.

## Contradições e limites

`terror sem terror`, `depois de 2020 antes de 2000` e
`mais de 120 min até 90 min` mostram um aviso específico. A verificação também
inclui os campos de refinamento: `até 90 min` junto de `2h+` não tem interseção.
Nenhuma configuração é modificada por essa verificação, e a busca não relaxa
os critérios para preencher a lista.

As exclusões por texto aceitam gêneros e países reconhecidos. Uma expressão
como `sem violência` exige informações de conteúdo que o catálogo não garante;
a busca explica essa limitação em vez de usar “violência” como sinal positivo.
Não significa que os resultados de `sem terror` sejam livres de violência.

Os limites de período e duração são cumulativos. Alternativas temporais
explícitas, como `anos 90 ou anos 2000`, e a exclusão de um intervalo inteiro,
como `sem filmes dos anos 90`, ainda pedem reformulação. Essa rodada não
implementa uma gramática geral com parênteses, comparação com outros filmes ou
interpretação de qualquer frase livre. Palavras restantes continuam na busca
lexical; alternativas de assuntos livres não ganham a lógica dos gêneros.
País representa produção, sem garantir idioma ou local onde a história se passa.

`1h40`, `1 hora e 40 minutos` e `100 minutos` são equivalentes. Uma duração
inválida como `1h90` pede correção. “Menos de” e “mais de” excluem o limite;
“até” e “pelo menos” o incluem. Filmes sem duração comprovada continuam fora
de qualquer pedido com limite de tempo.

## Verificação

As regressões sintéticas em `tests/domain/search-query.test.ts` cobrem os
resultados efetivos, alternativas com gêneros compostos, pares de produção,
negações, limites e avisos. Incluem assistidos, feedback, popularidade,
metadados de duração ausentes e persistência da interpretação no histórico.
Esses testes também funcionam no CI com catálogo vazio.

O smoke test em `tools/diagnostics/e2e-smoke.mjs` exercita o pedido composto
pelo popup real, confere os filmes gravados no histórico e verifica os avisos
de conflito no popup e no painel. Usa um perfil de teste isolado.

Resultados desta rodada:

- `npm run check`: typecheck, 347 testes em 28 arquivos e build aprovados.
- Smoke test completo do build no Chrome 154, em perfil temporário: aprovado,
  sem erros de página, console ou service worker.
- O pedido composto respeitou gêneros, teto de 100 minutos e assistidos com o
  bloqueio explicitamente ativado. A configuração usada para testar reassistir
  foi restaurada depois; avisos de conflito não modificaram configurações.
- Os demais fluxos, inclusive feedback, persistência, bloqueio do título
  regional de Harry Potter, recuperação de buscas vazias e disponibilidade dos
  15 climas com histórico grande, permaneceram funcionais.

O Chromium do Playwright não iniciou neste Windows por uma configuração
lado a lado inválida. A verificação usou o Chrome instalado, com perfil
temporário e conexão CDP; o adaptador local selecionou explicitamente o
service worker do CineMatch e fechou o navegador ao terminar. O perfil
pessoal não foi utilizado. Adaptador e capturas ficaram em
`e2e-screenshots/search-understanding-2026-10-12/`, fora do Git.

A versão da curadoria passou a `2026-10-12.2`, distinguindo as novas buscas
das avaliações anteriores. Essa validação mede aplicação das regras e
funcionamento; não é uma nova avaliação humana de relevância.
