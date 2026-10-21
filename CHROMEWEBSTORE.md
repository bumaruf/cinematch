# Chrome Web Store — CineMatch

Atualizado: 2026-10-20. Rascunho local; ainda não publicado na loja.

## Listagem

Nome: CineMatch: recomendações de filmes

O nome não leva a marca Letterboxd: a loja trata isso como uso de marca de terceiros. O Letterboxd aparece só na descrição, para dizer com o que a extensão funciona, sempre como "não oficial".

Descrição curta: Encontre filmes pelo seu histórico do Letterboxd, por clima ou por pedido, com sugestões diárias e uma lista de salvos.

Descrição detalhada:

O CineMatch ajuda a escolher o próximo filme com base no histórico que você exporta do Letterboxd. Extensão não oficial.

Explore 15 climas, peça gêneros, exclusões, país de produção, período e duração, e confira como seu pedido foi entendido. Combine alternativas como “suspense ou ficção científica, sem terror, até 1h40”. Pedidos contraditórios mostram o que precisa ser ajustado. Seu gosto orienta as sugestões automaticamente.

Quando faltam opções com evidência específica do clima, a lista pode incluir sugestões identificadas como Próximo ao clima. Se a busca fica vazia, Ver sugestões gerais permite começar outra busca sem o pedido e os filtros, respeitando seus assistidos e feedback.

Importe os arquivos de histórico e avaliações que você exporta do Letterboxd, ou, se preferir, sincronize pelo nome de usuário. Consulte seu perfil, as indicações do dia, as buscas anteriores e a coleção de salvos. Ajuste sugestões com Hoje não, Não combina comigo ou Já assisti; cada registro pode ser desfeito na indicação.

No painel, avalie opcionalmente se uma indicação combina com o pedido e se desperta vontade de assistir. As respostas distinguem filmes vistos de expectativas pela sinopse. Você pode exportar ou apagar suas avaliações em Seu perfil.

Seus dados ficam no navegador. O feedback não publica atividades no Letterboxd. A extensão não é afiliada ao Letterboxd, ao IMDb nem ao TMDB.

Categoria proposta: Fun. Idioma: português do Brasil.

Propósito único: ajudar usuários do Letterboxd a escolher filmes com base em suas preferências.

## Imagens

A loja aceita capturas de 1280 × 800 ou 640 × 400 (de 1 a 5) e exige o bloco
promocional pequeno de 440 × 280. `npm run screenshots` gera tudo em
`docs/screenshots` nesses tamanhos; rode num computador com internet, para os
pôsteres e as notas do IMDb aparecerem.

| Arte | Arquivo | Estado |
|---|---|---|
| Ícone 128 × 128 | public/icons/icon128.png | Pronto |
| Bloco promocional 440 × 280 | docs/screenshots/loja-promo-440x280.png | Pronto |
| Painel, resultados, perfil e opções | docs/screenshots/dashboard.png, resultados.png, perfil.png, options.png | Pronto (1280 × 800, 2026-10-20) |
| Popup | docs/screenshots/loja-popup.png | Pronto (popup enquadrado em 1280 × 800); popup.png, de 400 × 600, fica só no README |

## Justificativas de permissões

| Permissão | Uso concreto |
|---|---|
| storage | Guardar perfil, configurações, salvos, histórico, feedback, avaliações opcionais da curadoria e progresso de sincronização no navegador. |
| unlimitedStorage | Remover o limite de 10 MB do armazenamento local: um histórico grande do Letterboxd e o backup do perfil anterior podem passar desse limite. Não mostra aviso na instalação. |
| activeTab | Identificar o perfil do Letterboxd na aba ativa quando o usuário abre o popup. |
| scripting | Consultar o Letterboxd na aba aberta para completar a sincronização quando o site pede verificação. |
| https://letterboxd.com/* e https://*.letterboxd.com/* | Na sincronização opcional, consultar o perfil e o histórico públicos; mostrar o atalho de indicação nas páginas do Letterboxd. |
| https://image.tmdb.org/* | Exibir pôsteres dos filmes. |
| https://datasets.imdbws.com/* | Baixar o arquivo público de notas do IMDb na instalação e uma vez por mês; as notas não vêm no pacote. |

A permissão `tabs` saiu em 2026-10-19: as permissões de host do Letterboxd já dão acesso às abas do site, e `tabs` mostraria o aviso de leitura do histórico de navegação.

## Privacidade

O produto processa informações do perfil, conteúdo do Letterboxd, filmes vistos, avaliações, salvos e feedback para gerar recomendações. O armazenamento é local; não há servidor do CineMatch ou serviço externo de recomendação. Consultas ao Letterboxd, o download das notas do IMDb (um arquivo público, sem dados do usuário) e o carregamento de pôsteres usam esses serviços; buscas de filme ou trailer abrem links externos somente quando o usuário os aciona.

O piloto opcional armazena pedidos, contexto das indicações e respostas no navegador. A exportação ocorre por ação do usuário, sem envio automático; exclui o identificador do perfil e seu histórico importado, mas inclui o pedido e os comentários fornecidos. Há um botão para apagar as avaliações do perfil ativo.

Não há coleta de credenciais, pagamentos, saúde, localização, comunicações pessoais ou navegação fora do Letterboxd, nem telemetria. Os dados não são vendidos, usados para finalidades alheias à curadoria ou usados para crédito. Texto completo em docs/privacy.md.

## Pendências antes de uma publicação

URL pública da política de privacidade, nome do publicador, e-mail de contato, endereço de suporte, visibilidade e regiões: a definir pelo mantenedor. Preencher as declarações da loja a partir do comportamento descrito acima. Estes campos não foram inventados e nenhum envio foi realizado.

O pacote leva só dados que podem ser redistribuídos: catálogo do Wikidata (CC0), sinopses da Wikipédia (CC BY-SA 4.0, com crédito em Configurações → Fontes dos dados) e caminhos dos pôsteres do TMDB, com o aviso exigido pelo TMDB. As notas do IMDb (uso pessoal e não comercial) são baixadas pelo navegador de cada usuário. Detalhes em docs/data-sources.md. O código GPL não muda a licença dos dados.

## Histórico

| Versão | Data | Mudanças | Estado |
|---|---|---|---|
| 1.0.0, alterações locais | 2026-10-20 | Nome sem a marca Letterboxd; importar o CSV virou o caminho principal e a sincronização ficou opcional; pôsteres só do TMDB | Rascunho local |
| 1.0.0, alterações locais | 2026-10-19 | Preparação para a loja: descrição do manifesto com até 132 caracteres, permissão `tabs` removida, botão do Letterboxd só com clique real, bloco promocional e capturas em 1280 × 800 | Rascunho local |
| 1.0.0, alterações locais | 2026-10-18 | Catálogo trocado do IMDb para o Wikidata (notas do IMDb baixadas pelo navegador) e catálogo empacotado menor, para o worker acordar mais rápido | Rascunho local |
| 1.0.0, alterações locais | 2026-10-14 | O botão do Letterboxd não troca mais o perfil ativo sem confirmação (com backup do anterior); fontes dos dados nas opções e no painel; "Não combina comigo" ensina o gosto; variedade por década; buscas mais rápidas; sincronização tolerante e dia no fuso do usuário | Rascunho local |
| 1.0.0, alterações locais | 2026-10-12 | Alternativas de gêneros e países, negações locais, intervalos de duração e explicação de conflitos entre texto e filtros | Rascunho local |
| 1.0.0, alterações locais | 2026-10-12 | Ampliação das evidências de Um único cenário e Cinema lento; revisão das lacunas de metadados e auditoria de cobertura por popularidade | Rascunho local |
| 1.0.0, alterações locais | 2026-10-10 | Remoção dos modos Familiar, Explorar e Surpreender; recomendação automática; correção do bloqueio de assistidos para títulos regionais e listas reabertas no popup | Rascunho local |
| 1.0.0, alterações locais | 2026-10-07 | Avaliação opcional, revisão de metadados e climas; correção de listas vazias com proximidades identificadas e recuperação de busca | Rascunho local |
| 1.0.0, alterações locais | 2026-10-06 | Interpretação de pedidos, personalização, modos de descoberta, feedback e correções de persistência; opção de watchlist removida | Rascunho local |
