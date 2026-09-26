# Instruções para agentes

## Arquitetura

Leia `docs/architecture.md` antes de mudar código. A regra de dependência entre
camadas (`domain` → `application` → `infrastructure`/`messaging` → `background`/`ui`)
é verificada por `tests/architecture.test.ts`; não a contorne.

- Regras de negócio vão em `src/domain`, puras: sem `chrome.*`, rede, DOM ou
  `new Date()` implícito (o tempo entra como parâmetro).
- A UI só fala com o service worker por `src/messaging/client.ts`. Uma operação
  nova é uma ação em `src/messaging/contract.ts`, um caso de uso em
  `src/application` e uma linha em `src/background/router.ts`.
- Estilos: Tailwind CSS v4, com o tema em `src/ui/styles/app.css` (`@theme`).
  Use utilitários no HTML e no markup em TS; `@layer components` fica só para
  padrões repetidos em toda parte (botões, chips, campos, skeleton). Não crie
  CSS por página. O content script (`src/ui/content/content.css`) não usa
  Tailwind: o reset dele quebraria as páginas do Letterboxd.
- As chaves de `chrome.storage` em `src/infrastructure/storage/stores.ts` estão
  gravadas nos navegadores dos usuários. Não as renomeie.

## Uso de contexto

- Não leia `src/data/films-dataset.js` (9 MB), `src/data/poster-catalog.js` nem
  `tools/catalog/pitch-checkpoint.json` inteiros. Para entender a estrutura, use
  os `.d.ts` ao lado ou uma amostra pequena.
- Não altere os dados gerados em `src/data`, salvo quando pedido; use `tools/catalog`.
- O catálogo (`src/data/films-dataset.js`) não é versionado: vem dos datasets
  não comerciais do IMDb. Sem ele, use `npm run catalog:stub`; testes que
  precisam de filmes reais usam `testWithCatalog` (`tests/helpers.ts`).

## Verificação

- `npm run check` roda typecheck, testes e build.
- Mudanças no motor de recomendação devem manter os testes de `tests/domain`.
