# Chrome Web Store — CineMatch for Letterboxd (unofficial)

Atualizado: 2026-10-06. Rascunho local; esta rodada não foi publicada.

## Listagem

Nome: CineMatch for Letterboxd (unofficial)

Descrição curta: Encontre filmes pelo seu gosto no Letterboxd, por clima ou por pedido, com sugestões diárias e uma lista de salvos.

Descrição detalhada:

O CineMatch ajuda a escolher o próximo filme com base no seu perfil do Letterboxd.

Explore 15 climas, peça gêneros, exclusões, país de produção, período e duração, e confira como seu pedido foi entendido. Escolha Familiar para priorizar afinidade, Explorar para abrir espaço a outros diretores ou Surpreender para reduzir o peso dos diretores conhecidos.

Sincronize seu usuário ou importe os arquivos de histórico e avaliações do Letterboxd. Consulte seu perfil, as indicações do dia, as buscas anteriores e a coleção de salvos. Ajuste sugestões com Hoje não, Não combina comigo ou Já assisti; cada registro pode ser desfeito na indicação.

Seus dados ficam no navegador. O feedback não publica atividades no Letterboxd. A extensão não é afiliada ao Letterboxd, ao IMDb nem ao TMDB.

Categoria proposta: Fun. Idioma: português do Brasil.

Propósito único: ajudar usuários do Letterboxd a escolher filmes com base em suas preferências.

## Imagens

| Arte | Arquivo | Estado |
|---|---|---|
| Ícone 128 × 128 | public/icons/icon128.png | Existente |
| Painel e resultados | docs/screenshots/dashboard.png, docs/screenshots/resultados.png | Atualizar para os modos, critérios e feedback |
| Popup | docs/screenshots/popup.png | Atualizar antes de enviar |

## Justificativas de permissões

| Permissão | Uso concreto |
|---|---|
| storage | Guardar perfil, configurações, salvos, histórico, feedback e progresso de sincronização no navegador. |
| activeTab | Identificar o perfil do Letterboxd na aba ativa quando o usuário abre o popup. |
| tabs | Encontrar uma aba aberta do Letterboxd e abrir o painel do CineMatch. |
| scripting | Consultar o Letterboxd na aba aberta para completar a sincronização quando o site pede verificação. |
| https://letterboxd.com/* e https://*.letterboxd.com/* | Consultar perfil, histórico e pôsteres e mostrar o atalho de indicação nas páginas do Letterboxd. |
| https://image.tmdb.org/* | Exibir pôsteres dos filmes. |

Nenhuma permissão foi acrescentada nesta rodada.

## Privacidade

O produto processa informações do perfil, conteúdo do Letterboxd, filmes vistos, avaliações, salvos e feedback para gerar recomendações. O armazenamento é local; não há servidor do CineMatch ou serviço externo de recomendação. Consultas ao Letterboxd e carregamento de pôsteres usam esses serviços; buscas de filme ou trailer abrem links externos somente quando o usuário os aciona.

Não há coleta de credenciais, pagamentos, saúde, localização, comunicações pessoais ou navegação fora do Letterboxd, nem telemetria. Os dados não são vendidos, usados para finalidades alheias à curadoria ou usados para crédito. Texto completo em docs/privacy.md.

## Pendências antes de uma publicação

URL pública da política de privacidade, nome do publicador, e-mail de contato, endereço de suporte, visibilidade e regiões: a definir pelo mantenedor. Validar as dimensões das novas screenshots e preencher as declarações da loja a partir do comportamento descrito acima. Estes campos não foram inventados e nenhum envio foi realizado.

O catálogo IMDb tem licença de uso pessoal e não comercial; o código GPL não muda a licença dos dados. O funcionamento dos climas depende da qualidade dos metadados disponíveis.

## Histórico

| Versão | Data | Mudanças | Estado |
|---|---|---|---|
| 1.0.0, alterações locais | 2026-10-06 | Interpretação de pedidos, personalização, modos de descoberta, feedback e correções de persistência; opção de watchlist removida | Rascunho local |
