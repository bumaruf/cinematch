# Arquitetura

O CineMatch é uma extensão Manifest V3 com quatro contextos de execução: o
service worker, o content script nas páginas do Letterboxd e três páginas da
extensão (popup, dashboard, opções). O código se organiza em camadas com uma
regra de dependência única: **cada camada só importa das camadas abaixo dela**.

```
ui  ──────────────►  messaging (contrato + cliente)
                          │
background (composição) ──┼──► application ──► domain
                          │         │
                          └──► infrastructure ─┘
```

| Camada | Pasta | Pode importar | Não pode |
|---|---|---|---|
| Domínio | `src/domain` | só `src/domain` | `chrome.*`, `fetch`, DOM, `Date.now()` implícito |
| Aplicação | `src/application` | `domain` | `chrome.*`, `fetch`, DOM |
| Infraestrutura | `src/infrastructure` | `domain`, `application/ports` | UI |
| Mensagens | `src/messaging` | tipos do `domain` e da `application` | lógica de negócio |
| Background | `src/background` | tudo acima (é a raiz de composição) | DOM |
| UI | `src/ui` | `messaging`, `ui`, módulos puros do `domain`, tipos da `application` | `infrastructure`, `application` em runtime, `data` |

O teste `tests/architecture.test.ts` verifica essas regras pelos imports.

## Domínio (`src/domain`)

Regras puras, sem efeitos colaterais, testáveis sem mocks.

- `film.ts`: tipos centrais (`CatalogFilm`, `ProfileFilm`, `Recommendation`,
  `RecommendationResult`, `DailyPick`, `Filters`, `Settings`).
- `text.ts`: a única implementação de normalização de texto, título e slug.
- `catalog/`: índice do catálogo (`resolve`, `enrich`, pôsteres) montado a
  partir dos dados, recebido por injeção, sem import global do dataset. A
  resolução prioriza IMDb ID e indexa nomes regionais revisados em
  `identity-aliases.ts`, vinculados a um filme e ano, sem inferir equivalências
  pelo nome de uma franquia. Dados antigos sem IMDb ID continuam aceitos.
- `profile/`: análise de perfil, índice de filmes assistidos, fase do ano,
  importação de CSV (parse e merge).
- `taste/`: afinidade de gosto.
- `recommend/`: filtros, motor local (dividido em busca, tema e geral),
  recomendação do dia, montagem do DTO `Recommendation`, validação e resumo
  das avaliações opcionais da curadoria.
  A interpretação de texto separa limites de ano/duração (`query-constraints.ts`)
  das cláusulas de gênero/país (`query-requirements.ts`). `query.ts` coordena a
  extração e a busca lexical. Contradições retornam avisos pelo DTO existente.
  `query-model.ts` valida a resposta opcional do modelo do Chrome e a converte
  no mesmo `SearchQuery` ([on-device-model.md](on-device-model.md)).
- `themes/`: catálogo de atmosferas, contratos de evidência e anotações
  editoriais com fontes, ligadas ao identificador de um único filme.

O tempo entra como parâmetro (`now: Date`). Textos exibidos ao usuário que
nascem de regras (justificativas, comentários do curador, erros de validação)
ficam no domínio, em pt-BR.

## Aplicação (`src/application`)

Casos de uso que orquestram domínio e portas. Cada um é uma função que recebe
suas dependências:

- `profile.ts`: `getActiveProfile`, `syncProfile`, `importCsvProfile`,
  `clearProfile`, `repairLegacyCsvProfile` (migração, roda no `onInstalled`).
- `recommendations.ts`: `generateRecommendations`, `getDailyPick`.
- `evaluation.ts`: registrar uma resposta para um filme efetivamente indicado,
  exportar o relatório do perfil ativo e apagar suas avaliações.
- `library.ts`: filmes salvos, histórico, configurações e pôsteres.
- `ports.ts`: interfaces que a infraestrutura implementa (`ProfileStore`,
  `SettingsStore`, `HistoryStore`, `SavedFilmsStore`, `DailyPickStore`,
  `SyncCheckpointStore`, `EvaluationStore`, `LetterboxdSync`, `ArtworkSource`,
  `Clock`, `IdentifierSource`, `OnDeviceModel`). O identificador de uma lista não depende apenas
  do relógio: duas buscas no mesmo milissegundo continuam distintas.
- `query-model.ts`: `interpretSearch`, que consulta o modelo no dispositivo
  quando o ajuste está ligado e volta ao parser por regras em qualquer falha.
- `context.ts`: `AppContext`, o conjunto de portas que cada caso de uso recebe.
  `catalog()` retorna uma Promise; os casos de uso aguardam os dados apenas
  quando precisam resolver identidades ou gerar indicações.

Efeitos colaterais recorrentes, como "perfil trocado → limpar checkpoint e
últimas recomendações", vivem num só caso de uso.

## Infraestrutura (`src/infrastructure`)

Adaptadores das portas:

- `storage/`: `chrome.storage.local` (com implementação em memória para testes)
  e um repositório por chave. As migrações de dados antigos rodam no
  `onInstalled`, não em getters.
- `letterboxd/`: cliente HTTP (erros tipados, sem `SKIP_404:` em string),
  parser de HTML/RSS e busca paginada com checkpoint.
- `artwork.ts`: pôster via `og:image`, com cache limitado.
- `catalog-resource.ts`: lê o catálogo comprimido dentro do pacote, descomprime
  e cria os índices na primeira demanda. Pedidos simultâneos compartilham uma
  Promise; falhas permitem uma nova tentativa. O cache dura até o worker parar.
- `catalog.ts`: adaptador síncrono reservado a testes e diagnósticos Node.
- `on-device-model.ts`: adaptador da Prompt API (`LanguageModel`). Só cria
  uma sessão quando o modelo já está disponível; nunca inicia o download.

## Mensagens (`src/messaging`)

- `contract.ts`: mapa tipado `ação → { request, response }`. É a única API
  entre UI e background.
- `contract.ts` também define `CONTENT_SCRIPT_ACTIONS`: o content script, que roda
  dentro do Letterboxd, só pode pedir o fluxo do filme do dia. O worker recusa
  mensagens de outras extensões e valida o formato do payload.
- `client.ts`: `send(action, payload)` baseado em Promise, com tratamento de
  `runtime.lastError` e de contexto invalidado.
- `router.ts`: despacha as mensagens para os casos de uso no service worker.

## UI (`src/ui`)

- `shared/`: o que as telas reutilizam: escape de HTML, pôster (TMDB com
  fallback para o Letterboxd), meta e link do filme, leitura dos filtros,
  exportação em texto e usuário a partir da URL do Letterboxd.
- `pages/popup`, `pages/options`, `pages/dashboard` (um módulo por aba) e
  `content/`: controladores que renderizam e chamam `messaging/client`.
- `styles/app.css`: Tailwind CSS v4 com o tema do CineMatch (cores, fontes
  locais, animações) e os poucos componentes repetidos. As páginas usam
  utilitários; o content script tem CSS próprio, sem o reset do Tailwind.
- `shared/film-card.ts`: o card de filme (variantes lista e pôster) e os
  skeletons usados por popup, painel e salvos.

A UI nunca acessa o storage nem o catálogo diretamente. O catálogo fica em um
arquivo local comprimido, separado do JavaScript. Nem as páginas nem a
inicialização do worker carregam os dados. Os listeners de mensagens continuam
registrados de forma síncrona, antes de qualquer leitura do catálogo.

## Dados e ferramentas

- `src/data`: dados gerados (`films-dataset.js`, `poster-catalog.js`) e seus
  `.d.ts`. No código de runtime, só `infrastructure/catalog.ts` os importa,
  para o adaptador Node. Não edite à mão; use `tools/catalog`.
- `tools/build/catalog-asset.ts`: plugin do Vite que empacota os mesmos filmes e
  pôsteres em JSON gzip, com hash no nome. A composição recebe a URL do asset;
  não usa `import()` dinâmico no service worker Manifest V3. No desenvolvimento,
  o Vite serve o recurso local e atualiza os dados quando suas fontes mudam.
- `tools/catalog`: pipeline que gera os dados. O catálogo de filmes vem dos
  datasets não comerciais do IMDb e não é versionado; `npm run catalog:stub`
  cria um vazio para compilar e testar. `catalog:verify` compara durações por
  IMDb ID sem substituir a seleção do catálogo; o enriquecimento TMDB pode
  acrescentar palavras-chave específicas com a origem preservada.
- `tools/diagnostics/theme-quality.ts`: verifica os contratos dos resultados
  dos 15 climas. Essa auditoria não substitui julgamentos reais de espectadores.
- `tools/diagnostics/performance.ts`: mede o motor com relógio fixo e permite
  comparar os resultados completos entre versões. `catalog-package.ts` verifica
  que o pacote preserva todos os dados e mantém o catálogo fora dos scripts.
  Método e resultados em [performance.md](performance.md).
