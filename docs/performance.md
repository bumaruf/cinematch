# Desempenho

> Registro histórico: as rodadas de 12 a 15 de outubro usaram o catálogo anterior,
> do IMDb. A rodada de 18 de outubro, no fim, mede o catálogo do Wikidata.

Rodada de 12–13 de outubro de 2026, comparada ao código de `7964f25`.
O objetivo foi reduzir a demora ao reativar a extensão e o trabalho repetido do
motor, preservando os filmes indicados e as regras de exclusão.

## Mudanças

O catálogo deixou de ser um objeto JavaScript de aproximadamente 27 MB dentro
do serviço de fundo. O build agora gera um JSON gzip local com nome versionado
por hash. O serviço lê, descomprime e indexa esse arquivo somente quando uma
operação precisa dos filmes. Configurações, histórico e listas vazias respondem
sem carregar o catálogo. Os listeners continuam registrados sincronicamente.

O carregamento é compartilhado entre pedidos simultâneos. Depois de uma falha,
o próximo pedido pode tentar novamente; depois que o Chrome encerra o worker,
o próximo carregamento reconstrói os índices. Não existe cópia permanente desses
índices no storage, nem transferência do catálogo para um servidor.

O domínio também reutiliza títulos normalizados do catálogo e os gêneros e
diretores normalizados dos sinais de gosto. O índice de assistidos evita comparar
por título registros com IMDb IDs diferentes, mas mantém o tratamento de nomes
regionais, títulos sem ID, erros de grafia e anos desconhecidos.

O recurso é lido por `fetch` dentro da instalação. Isso funciona sem novas
permissões e respeita a restrição do Manifest V3 a imports dinâmicos no serviço:
[recursos locais](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests#extension-origin)
e [imports no service worker](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics#import-scripts).

## Medições locais

Windows, Chrome 154, Node 24.19, catálogo de 25 mil filmes e um histórico real
de 936 filmes. O perfil e os relatórios completos ficaram fora do Git.

| Operação no Chrome | Antes | Depois |
|---|---:|---:|
| Reativar o serviço e ler configurações, mediana de 7 reinicializações | 973 ms | 14 ms |
| Ler o perfil após reiniciar o serviço, uma amostra | 1.625 ms | 902 ms |
| Ler o perfil com o catálogo carregado, mediana de 5 pedidos | 376 ms | 210 ms |

Esses tempos incluem a troca de mensagens, serialização e instrumentação
Playwright/CDP; não medem o primeiro desenho da interface. Os perfis de Chrome
eram isolados. A versão final também carregou o catálogo e gerou indicações com
a conexão externa desativada, inclusive após reiniciar o serviço.

O diagnóstico do domínio rodou as versões anterior e final em processos Node
separados, sem profiler, com o mesmo catálogo, perfil, relógio e ordem de pedidos.
Cada cenário teve três execuções; os caches permanecem ativos entre pedidos.

| Cenário do motor, mediana de 3 execuções | Antes | Depois |
|---|---:|---:|
| Recomendações gerais | 801 ms | 627 ms |
| Cyberpunk | 317 ms | 162 ms |
| Cinema lento | 477 ms | 347 ms |
| Sci-fi filosófica | 328 ms | 130 ms |
| Busca por comédia | 493 ms | 278 ms |
| Suspense ou ficção científica, sem terror, até 100 minutos | 721 ms | 432 ms |
| Busca lexical por memória | 1.229 ms | 1.103 ms |
| Busca por título: Harry Potter | 1.789 ms | 1.490 ms |

Os resultados completos dos 21 cenários ficaram idênticos: seleção, ordem,
justificativas, interpretação, avisos e comportamento de fallback. Isso cobre
os 15 climas, o pedido geral e cinco buscas, incluindo um conflito temporal.

O maior script do pacote passou de 27,11 MB para 60,4 KB. O serviço também
importa módulos pequenos compartilhados. Todos os dados continuam no arquivo
local comprimido de 7,47 MB; a comparação entre esses tamanhos não representa
o download da loja, que já utiliza compressão.

## Limites

O primeiro pedido que usa filmes ainda paga pela leitura, descompressão e
indexação. No Chrome, depois de reativar apenas as configurações, esse primeiro
pedido de perfil levou 897 ms na versão final e 704 ms na anterior, cujo worker
já havia carregado o grande módulo ao iniciar. Por isso, a medida relevante do
percurso completo é também a leitura do perfil após reiniciar o serviço.

A primeira recomendação geral ainda é mais cara que pedidos seguintes, pois
prepara frequências e evidências. Buscas lexicais amplas continuam sendo um
gargalo. As amostras são pequenas, na mesma máquina, e não estabelecem uma
garantia de latência para outros computadores.

Os índices de títulos adicionaram cerca de 3 MB ao heap do diagnóstico Node
(145 para 148 MB após coleta). Esse adaptador retém os módulos de dados e não
representa o carregamento sob demanda do Chrome. Não foi medida uma redução
de memória total do navegador.

## Verificação e reprodução

`npm run check` passou com 356 testes em 30 arquivos, typecheck e build. O teste
de ponta a ponta passou no Chrome com importação CSV, feedback, filme do dia,
salvos, histórico, busca composta, recuperação de listas vazias e todos os climas
com histórico grande. Também passou a leitura gzip pelo servidor de desenvolvimento
do Vite.

Os novos testes verificam que operações leves dispensam o catálogo, que pedidos
concorrentes compartilham o carregamento, que falhas permitem nova tentativa e
que os assistidos continuam bloqueados quando os dados chegam de forma assíncrona.

Com o catálogo real gerado:

```sh
npm run build
npm run diagnostics:package
npm run diagnostics:performance -- e2e-screenshots/performance-before.json
# Na versão seguinte, com o mesmo catálogo e perfil sintético:
npm run diagnostics:performance -- e2e-screenshots/performance-after.json - e2e-screenshots/performance-before.json
```

Para usar um perfil real, passe o caminho do JSON depois do caminho do relatório
nas duas medições, em lugar de `-` quando presente. Os relatórios contêm filmes e justificativas ligados
ao histórico; mantenha-os em `e2e-screenshots/`, que é ignorado pelo Git.

`diagnostics:package` compara cada filme, campo de metadados e pôster do asset
com as fontes geradas. Também verifica que nenhum script chega a 500 KB. O
diagnóstico de desempenho aceita o relatório anterior como último argumento
opcional e falha se algum resultado completo mudar.

## Rodada de 14 de outubro de 2026

Mesma máquina, catálogo de 25 mil filmes e perfil sintético de 936 filmes.
Medida em duas etapas, para separar a mudança de resultado da mudança de custo:

1. As mudanças de curadoria (sinais de gosto agregados, desgosto na escala
   pessoal, "Não combina comigo" como sinal negativo e variedade por década)
   alteram resultados de propósito. A partir delas, gerou-se um relatório
   intermediário.
2. O índice de palavras da busca e a memoização das funções de texto foram
   comparados com esse relatório: **os 21 cenários ficaram idênticos**.

| Cenário, mediana de 3 execuções | Antes | Depois |
|---|---:|---:|
| Recomendações gerais | 420 ms | 158 ms |
| Cyberpunk | 81 ms | 29 ms |
| Cinema lento | 300 ms | 119 ms |
| Busca por comédia | 214 ms | 128 ms |
| Suspense ou ficção científica, sem terror, até 100 minutos | 291 ms | 98 ms |
| Busca lexical por memória | 847 ms | 44 ms |
| Busca por título: Harry Potter | 1.240 ms | 39 ms |

**Busca lexical.** O catálogo monta, na primeira busca, um índice palavra →
filmes dos campos pesquisáveis. Cada token é comparado com o vocabulário único,
e só os filmes candidatos recebem a pontuação completa. Para tokens sem
separadores, isso equivale à comparação anterior. Buscas por franquia e buscas
sem tokens lexicais continuam percorrendo o catálogo.

**Funções de texto.** `fold`, `normalizeTitle` e `normalizeSlug` usam um cache
limitado, e `containsPhrase` reaproveita a expressão regular de cada frase. O
perfil de CPU mostrava essas funções recalculadas para cada filme a cada pedido.

O heap do diagnóstico passou de 147 MB para 185 MB, por causa do índice e dos
caches. A primeira busca lexical depois de reativar o worker paga a montagem
do índice.

## Rodada de 15 de outubro de 2026: o que o usuário sente

Medida no navegador com `npm run diagnostics:ui` (Microsoft Edge, perfil
sintético de 940 filmes). "Frio" é o service worker recém-acordado: o Chrome o
encerra depois de uns 30 segundos sem uso. As páginas não tinham tarefas longas;
o tempo estava todo no worker.

| Ação | Antes | Depois |
|---|---:|---:|
| Abrir o popup até o conteúdo, worker frio | 505–889 ms | 79–90 ms |
| Abrir o painel até o filme do dia, worker frio | 1.908 ms | 899 ms |
| Clima no popup, worker quente | 211 ms | 46 ms |
| Clima no painel, worker quente | 119 ms | 63–73 ms |
| Busca composta no popup, worker quente | 195 ms | 98–105 ms |
| Resposta de `getActiveProfile` | 622 KB, 197 ms | 10 KB, 18 ms |

Clicar num clima 1,5 s depois de abrir o popup frio leva 330 ms: o catálogo já
carregou durante esse tempo.

**Abertura sem catálogo.** O cabeçalho usa `getProfileSummary`, que não carrega o
catálogo. As páginas pedem `warmUp` ao abrir, e o catálogo carrega enquanto a
pessoa olha a tela. O painel pede o filme do dia assim que sabe quem é o perfil,
sem esperar as estatísticas. As respostas não levam mais o histórico inteiro.

**Perfil preparado entre pedidos.** Análise, índice de assistidos e modelo de
gosto ficam guardados enquanto o perfil e o "Não combina comigo" não mudam.
O modelo memoriza a nota de cada filme, então o segundo pedido reaproveita o
trabalho do primeiro. Os candidatos de cada clima dependem só do catálogo e
também são calculados uma vez.

**Catálogo pré-processado.** O build normaliza os filmes, retira `themes`,
`metadataSources` e `originalLanguage` (nenhum código os lê em tempo de execução)
e grava as etiquetas de gosto de cada filme. O teste
`tests/domain/packaged-catalog.test.ts` confirma, com o catálogo real, que as
indicações e o filme do dia são idênticos aos do catálogo bruto.

| Worker frio, Node | Antes | Depois |
|---|---:|---:|
| `JSON.parse` do catálogo | 141 ms | 100 ms |
| Índices do catálogo | 304–416 ms | 224 ms |
| Preparar o perfil | 197 ms | 14 ms |
| Primeiro filme do dia | 965 ms | 105 ms |

**Trabalho ocioso.** Depois de 3 s sem pedidos, o worker prepara o filme do dia
e monta o índice de busca em etapas de 1.500 filmes, cedendo a vez entre elas.
Um clique durante esse trabalho é atendido entre uma etapa e outra.

Os resultados dos 21 cenários de `diagnostics:performance` continuam idênticos.

### Busca “amor com assassinato”

Com a busca por IA ligada, a busca esperava até 10 segundos pelo Gemini Nano e
criava a sessão do modelo na hora. Agora espera no máximo 2,5 s: depois disso
responde pelas regras, e a resposta tardia do modelo fica guardada para a mesma
busca. A sessão é criada quando a página abre.

Nas regras, cada filme candidato tinha a sinopse dividida e comparada palavra a
palavra, por aproximação, para cada termo. Agora o campo é dividido uma vez e
cada palavra é procurada no conjunto de palavras do vocabulário que o termo já
casa. O resultado é o mesmo; o motor passou de cerca de 345 ms para 100 ms nessa
busca, e o painel com o worker quente responde em cerca de 190 ms.

## Rodada de 18 de outubro de 2026: catálogo do Wikidata

Com o catálogo do Wikidata, o worker frio levava cerca de 1,9 s para responder
à primeira mensagem, porque relia e descomprimia o catálogo inteiro (45,8 MB
descompactado). Quase metade disso era `keywordEvidence`, que repetia o texto
de cada palavra-chave só para guardar a origem dela.

- No pacote, a origem virou uma string de códigos paralela a `keywords`
  (`keywordSources`). O JSON caiu de 45,8 para 24,1 MB, o gzip de 8,2 para
  6,6 MB e o `JSON.parse` de cerca de 1.340 ms para 300 ms.
- As estatísticas do perfil passaram a ficar em `chrome.storage.session`, e a
  interface não espera mais o catálogo só para mostrá-las.

Continuam em aberto: o primeiro clima com o worker frio (cerca de 1,35 s), a
primeira busca por texto, que monta o índice de palavras, e manter o worker
vivo enquanto uma página da extensão está aberta.
