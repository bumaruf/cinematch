# Chrome Web Store — CineMatch for Letterboxd (unofficial)

Atualizado: 2026-10-12. Rascunho local; esta rodada não foi publicada na loja.

## Listagem

Nome: CineMatch for Letterboxd (unofficial)

Descrição curta: Encontre filmes pelo seu gosto no Letterboxd, por clima ou por pedido, com sugestões diárias e uma lista de salvos.

Descrição detalhada:

O CineMatch ajuda a escolher o próximo filme com base no seu perfil do Letterboxd.

Explore 15 climas, peça gêneros, exclusões, país de produção, período e duração, e confira como seu pedido foi entendido. Combine alternativas como “suspense ou ficção científica, sem terror, até 1h40”. Pedidos contraditórios mostram o que precisa ser ajustado. Seu gosto orienta as sugestões automaticamente.

Quando faltam opções com evidência específica do clima, a lista pode incluir sugestões identificadas como Próximo ao clima. Se a busca fica vazia, Ver sugestões gerais permite começar outra busca sem o pedido e os filtros, respeitando seus assistidos e feedback.

Sincronize seu usuário ou importe os arquivos de histórico e avaliações do Letterboxd. Consulte seu perfil, as indicações do dia, as buscas anteriores e a coleção de salvos. Ajuste sugestões com Hoje não, Não combina comigo ou Já assisti; cada registro pode ser desfeito na indicação.

No painel, avalie opcionalmente se uma indicação combina com o pedido e se desperta vontade de assistir. As respostas distinguem filmes vistos de expectativas pela sinopse. Você pode exportar ou apagar suas avaliações em Seu perfil.

Seus dados ficam no navegador. O feedback não publica atividades no Letterboxd. A extensão não é afiliada ao Letterboxd, ao IMDb nem ao TMDB.

Categoria proposta: Fun. Idioma: português do Brasil.

Propósito único: ajudar usuários do Letterboxd a escolher filmes com base em suas preferências.

## Imagens

| Arte | Arquivo | Estado |
|---|---|---|
| Ícone 128 × 128 | public/icons/icon128.png | Existente |
| Painel e resultados | docs/screenshots/dashboard.png, docs/screenshots/resultados.png | Atualizar com a descoberta automática, critérios e feedback |
| Popup | docs/screenshots/popup.png | Atualizar sem o seletor de modos antes de enviar |

## Justificativas de permissões

| Permissão | Uso concreto |
|---|---|
| storage | Guardar perfil, configurações, salvos, histórico, feedback, avaliações opcionais da curadoria e progresso de sincronização no navegador. |
| activeTab | Identificar o perfil do Letterboxd na aba ativa quando o usuário abre o popup. |
| tabs | Encontrar uma aba aberta do Letterboxd e abrir o painel do CineMatch. |
| scripting | Consultar o Letterboxd na aba aberta para completar a sincronização quando o site pede verificação. |
| https://letterboxd.com/* e https://*.letterboxd.com/* | Consultar perfil, histórico e pôsteres e mostrar o atalho de indicação nas páginas do Letterboxd. |
| https://image.tmdb.org/* | Exibir pôsteres dos filmes. |

Nenhuma permissão foi acrescentada nesta rodada.

## Privacidade

O produto processa informações do perfil, conteúdo do Letterboxd, filmes vistos, avaliações, salvos e feedback para gerar recomendações. O armazenamento é local; não há servidor do CineMatch ou serviço externo de recomendação. Consultas ao Letterboxd e carregamento de pôsteres usam esses serviços; buscas de filme ou trailer abrem links externos somente quando o usuário os aciona.

O piloto opcional armazena pedidos, contexto das indicações e respostas no navegador. A exportação ocorre por ação do usuário, sem envio automático; exclui o identificador do perfil e seu histórico importado, mas inclui o pedido e os comentários fornecidos. Há um botão para apagar as avaliações do perfil ativo.

Não há coleta de credenciais, pagamentos, saúde, localização, comunicações pessoais ou navegação fora do Letterboxd, nem telemetria. Os dados não são vendidos, usados para finalidades alheias à curadoria ou usados para crédito. Texto completo em docs/privacy.md.

## Pendências antes de uma publicação

URL pública da política de privacidade, nome do publicador, e-mail de contato, endereço de suporte, visibilidade e regiões: a definir pelo mantenedor. Validar as dimensões das novas screenshots e preencher as declarações da loja a partir do comportamento descrito acima. Estes campos não foram inventados e nenhum envio foi realizado.

O catálogo IMDb tem licença de uso pessoal e não comercial; o código GPL não muda a licença dos dados. O funcionamento dos climas depende da qualidade dos metadados disponíveis.

## Histórico

| Versão | Data | Mudanças | Estado |
|---|---|---|---|
| 1.0.0, alterações locais | 2026-10-14 | O botão do Letterboxd não troca mais o perfil ativo sem confirmação (com backup do anterior); fontes dos dados nas opções e no painel; "Não combina comigo" ensina o gosto; variedade por década; buscas mais rápidas; sincronização tolerante e dia no fuso do usuário | Rascunho local |
| 1.0.0, alterações locais | 2026-10-12 | Alternativas de gêneros e países, negações locais, intervalos de duração e explicação de conflitos entre texto e filtros | Rascunho local |
| 1.0.0, alterações locais | 2026-10-12 | Ampliação das evidências de Um único cenário e Cinema lento; revisão das lacunas de metadados e auditoria de cobertura por popularidade | Rascunho local |
| 1.0.0, alterações locais | 2026-10-10 | Remoção dos modos Familiar, Explorar e Surpreender; recomendação automática; correção do bloqueio de assistidos para títulos regionais e listas reabertas no popup | Rascunho local |
| 1.0.0, alterações locais | 2026-10-07 | Avaliação opcional, revisão de metadados e climas; correção de listas vazias com proximidades identificadas e recuperação de busca | Rascunho local |
| 1.0.0, alterações locais | 2026-10-06 | Interpretação de pedidos, personalização, modos de descoberta, feedback e correções de persistência; opção de watchlist removida | Rascunho local |
