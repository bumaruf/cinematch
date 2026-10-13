# Desempenho

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
