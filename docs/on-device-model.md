# Busca com o modelo do Chrome (protótipo)

Rodada local de 14 de outubro de 2026. Recurso experimental, desligado por
padrão em **Configurações → Busca com IA no navegador**.

## O que muda

O parser por regras (`query.ts`, `query-constraints.ts`,
`query-requirements.ts`) só entende o que está no dicionário. Com o ajuste
ligado, o service worker pede ao Gemini Nano, pela Prompt API do Chrome, um
JSON com gêneros exigidos, alternativos, excluídos e preferidos, países,
período, duração e termos livres. O domínio valida a resposta
(`src/domain/recommend/query-model.ts`) e a converte no mesmo `SearchQuery`
que o motor já consome. Nada mais no motor muda.

O parser por regras continua como reserva. Ele responde sempre que:

- o ajuste está desligado, o pedido é um título entre aspas ou passa de 300
  caracteres;
- o contexto não expõe `LanguageModel`, ou `availability()` não retorna
  `available` (modelo não baixado, em download ou dispositivo sem suporte);
- o modelo demora mais de 10 segundos, responde algo que não é JSON ou a
  validação recusa a resposta.

A linha "Entendi" do popup e do painel mostra quem interpretou: "Entendi com o
Gemini Nano, no seu dispositivo" ou "Entendi pelas regras (o modelo não pôde
ser usado)".

## Prompt API: o que foi verificado

Fontes: [The Prompt API](https://developer.chrome.com/docs/ai/prompt-api),
[Prompt API em extensões](https://developer.chrome.com/docs/extensions/ai/prompt-api)
e [Get started](https://developer.chrome.com/docs/ai/get-started), consultadas
nesta data.

- O objeto global é `LanguageModel`, com `availability(options)` e
  `create(options)`. Os estados são `unavailable`, `downloadable`,
  `downloading` e `available`. A sessão oferece `prompt(input, { responseConstraint, signal })`,
  `clone()` e `destroy()`. `responseConstraint` aceita um JSON Schema.
- Em extensões, a API está estável e o trial expirou. A documentação pede que
  extensões **removam** a permissão `aiLanguageModelOriginTrial`. Não há
  permissão nem entrada nova no manifest, e o manifest não mudou.
- A documentação não informa se o service worker de uma extensão expõe a API
  ("não disponível em Web Workers por enquanto"). Relatos de desenvolvedores
  divergem. Por isso, o adaptador verifica `globalThis.LanguageModel` e, se ele
  faltar, o status é `unsupported` e a busca usa as regras. A página de
  opções mostra esse estado.
- O download do modelo exige ativação do usuário, que o service worker não
  tem. O botão **Baixar o modelo** da página de opções chama `create()` dentro
  do clique e mostra o progresso (`downloadprogress`). O service worker só
  chama `create()` quando o modelo já está `available`.
- Requisitos: Windows 10/11, macOS 13+, Linux ou Chromebook Plus; 22 GB livres;
  GPU com mais de 4 GB de VRAM, ou CPU com 16 GB de RAM e 4 núcleos. Sem
  Android ou iOS.
- Idiomas aceitos: inglês, espanhol, japonês, alemão e francês. **Português não
  está na lista.** A sessão declara entrada `en`/`es` e saída `en`. O esquema
  restringe a saída a identificadores em inglês (gêneros do catálogo e códigos
  de país), mas a compreensão do pedido em português não é garantida.

## Privacidade

O modelo roda no dispositivo. O pedido e a resposta não saem do navegador e
nenhum host novo foi adicionado. O download do modelo é feito pelo próprio
Chrome, não pelo CineMatch. O perfil do Letterboxd não é enviado ao modelo,
apenas o texto da busca.

## Validação da resposta

`validateModelQuery` recusa a resposta inteira, sem aproveitar partes, quando:

- não é um objeto, uma lista não contém só textos ou tem mais de 6 itens;
- um gênero ou país está fora do vocabulário do catálogo (os mesmos valores do
  `enum` do esquema; maiúsculas não importam);
- ano fora de 1880–2100, duração fora de 1–600 min ou números não inteiros;
- um gênero aparece como exigido e excluído, todas as alternativas ou todos os
  países pedidos estão excluídos, ou o período ou a duração não têm interseção;
- não sobra nenhum critério.

Também usa o parser por regras como conferência:

- Exclusões e limites que as regras reconhecem são mantidos mesmo se o modelo
  os omitir. Os limites ficam com o mais restrito dos dois.
- Se as regras encontram uma contradição ("terror sem terror"), a resposta do
  modelo é descartada para que o aviso específico apareça.
- Se as regras veem uma exclusão que não sabem mapear ("sem sustos"), o modelo
  só é aceito quando acrescenta uma exclusão de gênero ou país.
- Termos livres só valem se aparecem no próprio pedido e não estão sob uma
  negação. Gêneros e países repetidos como termos são descartados. Um termo
  inventado pelo modelo viraria uma exigência oculta.

## Comparação em exemplos

A coluna "Regras" é a saída real do parser atual. A coluna "Modelo + validação"
mostra o que a validação produz com uma resposta **plausível** do modelo.
Essas respostas foram escritas à mão para os testes: não houve Chrome com
Gemini Nano nesta rodada. A qualidade real do modelo em português não foi
medida.

| Pedido | Regras | Resposta suposta do modelo | Modelo + validação |
| --- | --- | --- | --- |
| `filme para ver com a família` | Nada ("família" é stopword); ordena só por gosto e qualidade | preferidos Family, Animation; exclui Horror | Priorizar família e animação · Sem terror |
| `comédia sem sustos` | comédia; **aviso** “não consigo verificar a exclusão” e nenhum resultado | Comedy; exclui Horror | comédia · Sem terror |
| `um suspense curtinho dos anos noventa` | suspense; "curtinho" e "noventa" viram termos literais | Thriller; 1990–1999; até 100 min | suspense · 1990–1999 · Até 100 min |
| `drama brasileiro sobre a ditadura` | drama e Brasil; termos "sobre" e "ditadura" | Drama; BR; termo "ditadura" | drama · Produção: Brasil · Termos: ditadura |
| `algo tipo Bollywood` | termo literal "bollywood" | IN; preferido Musical | Priorizar musical · Produção: Índia |
| `filme de tribunal` | termo "tribunal" | Drama; termos "tribunal", "julgamento" | drama · Termos: tribunal ("julgamento" descartado: não está no pedido) |
| `terror sem terror` | aviso de contradição | exige Horror | Recusada; vale o aviso das regras |
| `comédia sem sustos` | aviso | Comedy; termo "sustos" | Recusada: a exclusão não foi traduzida |
| `drama antes de 2000` | drama; até 1999 | Drama; a partir de 2005 | Recusada: período sem interseção |
| `faroeste italiano dos anos 60` | faroeste e Itália; 1960–1969 | — | As regras já resolvem; o modelo não acrescenta nada |

## Limites

- **Não medido em um Chrome real.** Falta rodar os exemplos acima com o Gemini
  Nano e registrar acertos, recusas e latência. É o próximo passo antes de
  pensar em ligar o recurso por padrão.
- O modelo pode errar de forma plausível e passar na validação. Um "Drama"
  exigido sem motivo, por exemplo, estreita a busca. A validação garante a
  forma e a coerência, não a intenção.
- Sem suporte oficial a português. A compreensão de gírias e diminutivos
  ("curtinho") depende do modelo.
- Exposição em service worker não documentada. Se o Chrome não expuser a API
  ali, o protótipo nunca usa o modelo. A alternativa seria um documento
  offscreen, que exige a permissão `offscreen`.
- Latência: a primeira sessão do dia pode levar segundos. A busca espera no
  máximo 10 segundos e corre em paralelo com a carga do catálogo.
- O vocabulário é fechado: só os 22 gêneros do catálogo e os países de
  `countries.ts`. Assuntos ("tribunal") continuam na busca lexical, como antes.
- Alternativas compostas ("suspense italiano ou drama francês") não cabem no
  esquema. Ele só tem uma lista de alternativas de gênero e uma de países. As
  regras tratam esse caso melhor.
