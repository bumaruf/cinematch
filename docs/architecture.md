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
  partir dos dados, recebido por injeção, sem import global do dataset.
- `profile/`: análise de perfil, índice de filmes assistidos, fase do ano,
  importação de CSV (parse e merge).
- `taste/`: afinidade de gosto.
- `recommend/`: filtros, motor local (dividido em busca, tema e geral),
  recomendação do dia e montagem do DTO `Recommendation`.
- `themes/`: catálogo de atmosferas e busca.

O tempo entra como parâmetro (`now: Date`). Textos exibidos ao usuário que
nascem de regras (justificativas, comentários do curador, erros de validação)
ficam no domínio, em pt-BR.

## Aplicação (`src/application`)

Casos de uso que orquestram domínio e portas. Cada um é uma função que recebe
suas dependências:

- `profile.ts`: `getActiveProfile`, `syncProfile`, `importCsvProfile`,
  `clearProfile`, `repairLegacyCsvProfile` (migração, roda no `onInstalled`).
- `recommendations.ts`: `generateRecommendations`, `getDailyPick`.
- `library.ts`: filmes salvos, histórico, configurações e pôsteres.
- `ports.ts`: interfaces que a infraestrutura implementa (`ProfileStore`,
  `SettingsStore`, `HistoryStore`, `SavedFilmsStore`, `DailyPickStore`,
  `SyncCheckpointStore`, `LetterboxdSync`, `ArtworkSource`, `Clock`).
- `context.ts`: `AppContext`, o conjunto de portas que cada caso de uso recebe.

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

## Mensagens (`src/messaging`)

- `contract.ts`: mapa tipado `ação → { request, response }`. É a única API
  entre UI e background.
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

A UI nunca acessa o storage nem o catálogo diretamente. Como consequência, o
catálogo de filmes (~9 MB) fica só no bundle do service worker, e as páginas
abrem sem carregá-lo.

## Dados e ferramentas

- `src/data`: dados gerados (`films-dataset.js`, `poster-catalog.js`) e seus
  `.d.ts`. Só `infrastructure/catalog.ts` os importa. Não edite à mão; use
  `tools/catalog`.
- `tools/catalog`: pipeline que gera os dados. O catálogo de filmes vem dos
  datasets não comerciais do IMDb e não é versionado; `npm run catalog:stub`
  cria um vazio para compilar e testar.
