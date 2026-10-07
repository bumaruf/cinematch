# Primeira rodada de melhorias de curadoria

Implementação iniciada em 6 de outubro de 2026 e preparada para revisão em pull request. As alterações que já estavam no projeto foram preservadas, inclusive a expansão do catálogo e seu enriquecimento. O dataset de filmes gerado localmente continua fora do versionamento.

## O que mudou e por quê

**Pedidos viraram critérios verificáveis.** Gêneros, exclusões, país de produção, intervalo de anos e duração são separados dos termos que precisam aparecer nos títulos ou metadados. “Comédia dos anos 90 sem terror até 90 minutos” exige comédia, exclui terror, limita o período a 1990–1999 e a duração a 90 minutos. A interface mostra os critérios aplicados. Uma busca só com exclusões também funciona. “Policial” usa o gênero Crime. Coproduções são reconhecidas mesmo com nomes em idiomas diferentes. Aspas permitem buscar títulos ambíguos, como “Brazil” ou “1984”. O título original exato ganha prioridade no ranking.

**O gosto passou a influenciar a ordem dentro de cada clima.** A elegibilidade continua exigindo os gêneros e sinais do clima; depois dela, afinidade, evidência temática e qualidade participam do ranking. O motor considera a escala de avaliações do perfil quando há pelo menos oito notas, mantendo um piso positivo. Diretores e conceitos descritos nos filmes bem avaliados podem estabelecer afinidade forte, inclusive entre países diferentes. A origem deixou de ser uma barreira obrigatória. Preferência ampla de gênero orienta a descoberta, mas não vira uma justificativa de afinidade forte. Penalidades por avaliações ruins são limitadas.

**Os três modos têm regras distintas.** Familiar prioriza afinidade forte na curadoria geral. Explorar reduz seu peso e favorece outros diretores. Surpreender reduz ainda mais a preferência por diretores conhecidos. Os filtros continuam valendo em todos eles. A seleção evita mais de dois filmes do mesmo diretor quando há alternativas e completa a lista com os candidatos restantes se necessário. A qualidade usa uma nota ajustada pela quantidade de votos para diminuir a influência de avaliações pouco confiáveis.

**Tags automáticas perderam autoridade temática.** Termos derivados de gênero, país ou estilo do diretor não comprovam características de um filme. O pipeline registra a origem das palavras-chave futuras. O catálogo antigo recebe tratamento conservador; evidência em sinopses e termos explicitamente ligados ao filme continua útil. O título, sozinho, também deixou de comprovar a atmosfera. A importação futura preserva duração desconhecida como desconhecida, em vez de inventar 100 minutos; o enriquecimento pode completá-la com uma duração real. Os dados gerados existentes não foram reescritos nesta rodada.

**O feedback ganhou revisão e desfazer.** Hoje não exclui o filme até a próxima data de São Paulo. Não combina comigo e Já assisti o excluem das próximas recomendações daquele perfil. Já assisti é uma marcação local: não edita o histórico sincronizado nem publica no Letterboxd. É possível desfazer na indicação ou em Seu perfil → Revisar feedback de sugestões, mesmo depois de fechar o popup. Dispensar o filme do dia invalida sua indicação em cache.

**A seleção por coleção foi retirada.** Após relatos de erro no uso real, o mantenedor pediu a remoção. A interface não oferece escolha entre salvos nem consulta à watchlist do Letterboxd. O código de consulta, mensagens e armazenamento da integração foi removido; a chave antiga fica identificada para limpeza de cache. A coleção de salvos existente continua acessível.

**Persistência e configurações foram corrigidas.** Os botões carregam o estado real dos salvos. Gravações concorrentes de salvos, histórico, indicações diárias, configurações e feedback preservam as alterações independentes. As chaves antigas de armazenamento continuam iguais. Desativar Evitar assistidos agora permite uma busca para reassistir, sem a camada de aplicação descartar o resultado silenciosamente. A identificação para ações explícitas não usa a comparação aproximada do histórico: títulos parecidos e continuações não são o mesmo filme.

## Evidência obtida

- `npm run check`: typecheck, **234 testes em 22 arquivos** e build aprovados para a versão sem a integração da watchlist.
- O teste da extensão no navegador passou com importação CSV, temas, busca normal, indicação diária e cache, salvos simultâneos, feedback, desfazer, popup, painel e opções. A ausência da opção foi conferida no popup e no painel; os cenários antigos da integração foram retirados. Não houve erros de página, console ou service worker.
- Foi preservada a correção de um falso bloqueio: o script normal de telemetria do Cloudflare não indica, sozinho, uma tela de verificação. Essa regra também protege a sincronização normal de histórico.
- O navegador usado foi Chrome for Testing 155, com `CHROMIUM_PATH`. O Chromium 153 baixado pelo Playwright falhou na inicialização por um problema de configuração de assembly no Windows; o teste foi concluído com o outro executável. O script também foi corrigido para importar arquivos por URL no Windows e fechar o navegador em caso de falha.
- A auditoria de personalização usa dois perfis com **os mesmos 36 assistidos**. Um avalia bem 18 filmes de Nolan, Fincher e Villeneuve; o outro, 18 de Miyazaki, Takahata e Shinkai. Só as avaliações diferem. As listas ordenadas foram diferentes em **15 de 15 climas**. Alguns climas ainda compartilham vários candidatos: a métrica demonstra influência do gosto, não comprova que todos os filmes escolhidos são bons acertos.
- A medição de latência usa três execuções por tamanho de histórico. As medianas foram **245 ms com 1 filme, 320 ms com 50 e 282 ms com 200**. O arquivo completo está em `e2e-screenshots/recommendation-quality.json`; pode ser regenerado com `npm run diagnostics:recommendations`. É uma medição local do motor com o catálogo carregado, não do tempo completo entre abrir a extensão e ver pôsteres.

As regressões essenciais também usam catálogos sintéticos próprios: não dependem dos filmes reais para proteger essas regras no CI.

## O que ainda impede chamar de 100%

**Precisão de curadoria precisa de avaliação humana.** Diferenciar perfis não basta. Uma amostra de indicações deveria ser julgada pela aderência ao pedido, adequação ao clima e disposição de assistir. Isso permitiria ajustar a força dos sinais e dos modos com evidência de uso. Sinopses descrevem enredos; nem sempre comprovam ritmo, tom emocional ou estrutura narrativa.

**O catálogo continua tendo lacunas.** A seleção atual tem 25 mil filmes e 869 registros sem país conhecido. Durações antigas sem indicação de procedência podem conservar valores fictícios de importações anteriores. Os critérios ficam mais confiáveis à medida que esses registros são enriquecidos ou revisados. O bundle do service worker permanece com cerca de 25 MB, com aviso de tamanho no build; a UI continua sem carregar esse catálogo.

**A linguagem aceita tem limites claros.** O parser é local e baseado em regras. País significa produção, não idioma falado, ambiente da história ou disponibilidade em streaming. Frases compostas e negações ambíguas ainda pedem cuidado; a interpretação na tela permite conferir o entendimento.

**O feedback desta rodada atua sobre o filme.** Não combina comigo ainda não transforma um registro isolado numa rejeição de gênero, país ou diretor. Um aprendizado mais amplo exigiria repetição, confiança e uma explicação que o usuário possa revisar.

Os próximos avanços com maior valor seriam validar acertos com perfis reais, revisar evidências dos climas mais subjetivos e completar os metadados que participam de filtros. Recursos como sessões em grupo e trilhas de descoberta podem vir depois dessa base medida.
