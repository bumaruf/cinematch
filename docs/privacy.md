# Privacidade do CineMatch

Atualizado em 10 de outubro de 2026.

O CineMatch guarda o perfil sincronizado do Letterboxd, preferências, filmes salvos, histórico de recomendações e feedback no armazenamento local da extensão, dentro do navegador do usuário. O feedback inclui o filme, o perfil ativo, a ação (Hoje não, Não combina comigo ou Já assisti) e o momento do registro.

Esses dados não são enviados para um servidor do CineMatch. Durante a sincronização, a extensão consulta páginas públicas do Letterboxd; quando há uma aba do Letterboxd aberta, ela pode usar a sessão já autenticada nessa aba para completar a consulta. Pôsteres podem ser baixados do domínio de imagens do TMDB. Na instalação e depois uma vez por mês, a extensão baixa o arquivo público de notas do IMDb; o pedido não leva dados do usuário, e as notas ficam guardadas no navegador.

A avaliação opcional da curadoria guarda localmente o perfil ativo, a lista apresentada, o pedido, filtros, versão da curadoria e contagens do perfil e do catálogo, além das respostas e comentários de até 500 caracteres. Registros anteriores podem manter o modo de descoberta usado na época. Não há envio automático nem treinamento com essas respostas. **Seu perfil → Avaliações da curadoria** permite exportar um arquivo JSON ou apagar as avaliações do perfil ativo. O arquivo exclui o nome do perfil e o histórico de filmes e notas importados; inclui o pedido e os comentários escritos pelo usuário, que podem conter informações pessoais se ele as inserir.

O usuário pode apagar o perfil sincronizado a qualquer momento em **Configurações → Apagar perfil salvo**. Pode remover filmes da coleção pelos botões Salvo e desfazer um feedback na indicação em que o registrou ou no painel **Seu perfil → Revisar feedback de sugestões**. Hoje não deixa de excluir o filme no dia seguinte, pela data de São Paulo; os outros feedbacks continuam valendo até serem desfeitos. O feedback não publica atividades no Letterboxd nem altera as avaliações importadas ou sincronizadas.

O recurso de consulta à watchlist foi removido. Cópias de consulta deixadas pela integração anterior são descartadas na limpeza de dados obsoletos e pelo botão de apagar perfil.

Filmes salvos, preferências, histórico, feedback e avaliações da curadoria não são apagados pelo botão de apagar perfil. Para remover todos os dados, limpe os dados da extensão ou desinstale-a pelo navegador. O histórico retém até 30 buscas, as indicações diárias até 180 registros, o feedback até 5 mil registros e as avaliações até 200 listas no total. O rascunho do popup é mantido só durante a sessão do navegador.

A busca com IA no navegador, experimental e desligada por padrão, usa o modelo Gemini Nano do próprio Chrome. O texto da busca é processado no dispositivo e não é enviado pela rede; o perfil não é enviado ao modelo. O download do modelo é feito pelo Chrome.

O CineMatch não coleta credenciais, tokens, informações de pagamento ou dados de navegação fora do Letterboxd.
