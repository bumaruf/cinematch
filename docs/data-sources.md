# Fontes dos dados

O pacote da Chrome Web Store só leva dados que podem ser redistribuídos. O que
tem licença de uso pessoal é baixado pelo navegador de cada usuário.

| Dado | Fonte | Licença | Como chega ao usuário |
|---|---|---|---|
| Títulos, ano, diretor, gêneros, duração, país, idioma, IMDb ID, slug do Letterboxd | Wikidata | CC0 | No pacote (`npm run catalog:wikidata`) |
| Palavras-chave de gênero e assunto | Wikidata | CC0 | No pacote |
| Sinopses | Wikipédia (pt, ou en quando falta) | CC BY-SA 4.0, com crédito em Configurações → Fontes dos dados | No pacote |
| Notas e votos | IMDb (`title.ratings.tsv.gz`) | Uso pessoal e não comercial | Baixadas pelo navegador na instalação e uma vez por mês |
| Pôsteres | TMDB | API gratuita para uso não comercial, com crédito | Caminhos no pacote; imagens carregadas do CDN do TMDB |

## Idiomas

- Títulos em inglês, como o Letterboxd mostra: é assim que o histórico do
  usuário casa com o catálogo. O título em português entra nas palavras-chave,
  para a busca.
- Países e palavras-chave de gênero e assunto em português quando o Wikidata tem
  o rótulo, senão em inglês. Sinopses em português, ou em inglês quando falta.
- Pôsteres em inglês (`npm run catalog:posters`, com `TMDB_READ_ACCESS_TOKEN`).
  Um mapa gravado em outro idioma é baixado de novo; o filme sem pôster em inglês
  mantém o que tinha.

## Como funciona

- `src/domain/catalog/packaged.ts` zera notas e votos e remove as palavras-chave
  derivadas deles (`aclamado`, `popular`…) antes de empacotar, mesmo que o arquivo
  local as tenha.
- `src/application/ratings.ts` baixa as notas quando faltam ou têm mais de
  30 dias. O service worker filtra o arquivo do IMDb para os filmes do catálogo e
  guarda o resultado no Cache Storage (`src/infrastructure/imdb-ratings.ts`).
  O catálogo aplica essas notas ao ser montado.
- Sem notas (antes do primeiro download, ou se o IMDb estiver fora do ar), as
  sugestões continuam: a nota de cada filme cai no valor neutro do motor,
  filtros de nota mínima não excluem filmes sem nota, o filtro de popularidade
  (mínimo de avaliações) é ignorado e o resultado avisa que as notas faltam.
- `tools/package.js` só empacota um catálogo marcado com
  `CATALOG_SOURCE = "wikidata"`. `catalog:wikidata` grava a marca, e
  `catalog:enrich` e `catalog:dedup` a preservam. Os comandos que usam o IMDb
  ou o TMDB (`catalog:import`, `catalog:pitches`, `catalog:tmdb`,
  `catalog:verify -- --apply`) reescrevem o catálogo sem ela: servem para uso
  local e bloqueiam o empacotamento.

## Arquivo local para testes

Por padrão, `catalog:wikidata` também grava as notas do IMDb no arquivo local
(`IMDB_LOCAL_RATINGS=0` desliga), para os testes e diagnósticos verem o mesmo
que um navegador com as notas baixadas. Esse arquivo não é versionado e as notas
não entram no pacote.

Esta organização é a leitura dos termos de cada fonte, não um parecer jurídico.
