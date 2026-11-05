# Parâmetros de IA vigentes

O que está configurado hoje nos componentes de IA do P&D Connect, com a fonte e a
data de cada valor. Mudar qualquer linha daqui é portão de decisão do PO
(`AGENTS.md` §3.2) e vale também para o `backend/.env` de cada ambiente.

## Custo e limites de gasto

| Parâmetro | Valor | Variável | Fonte e data |
|---|---|---|---|
| Modelo gerador | `gemini-2.5-flash` | `AI_MATCH_GEMINI_MODEL` | Comparativo de modelos (Engenharia_IA) |
| Preço de entrada | R$ 1,5113 por milhão de tokens | `AI_CUSTO_ENTRADA_BRL_POR_MILHAO` | US$ 0,30 ([preços do Gemini](https://ai.google.dev/gemini-api/docs/pricing)) × PTAX de venda de 23/10/2026, R$ 5,0377 |
| Preço de saída | R$ 12,5943 por milhão de tokens | `AI_CUSTO_SAIDA_BRL_POR_MILHAO` | US$ 2,50, inclui os tokens de raciocínio, × a mesma PTAX |
| Limite mensal | R$ 50 | `AI_CUSTO_TETO_MENSAL_BRL` | Teto acadêmico do TAP |
| Limite por oportunidade | R$ 5 | `AI_CUSTO_TETO_POR_OPORTUNIDADE_BRL` | Aprovado pelo PO em 24/10/2026 (um décimo do teto mensal) |
| Aviso de consumo | 80% do limite mensal | `AI_CUSTO_ALERTA_PERCENTUAL` | Plano de Integração de IA |

Sem a tabela de preço, o custo de cada chamada fica sem valor e nenhum dos dois
limites bloqueia nada. A tela Saúde da IA avisa quando a tabela está vazia.

Quando um limite barra a chamada, a IA não é chamada, a trilha registra o
estouro e a tela diz o motivo: limite da oportunidade ou limite do mês.

## Chamada ao Gemini

| Parâmetro | Valor | Variável | Fonte e data |
|---|---|---|---|
| Biblioteca | `google-genai` 2.33.0 | `requirements.txt` | Substituiu a `google-generativeai` em 24/10/2026: só a nova limita o raciocínio |
| Limite de raciocínio | 1024 tokens | `AI_GEMINI_ORCAMENTO_RACIOCINIO` | SPEC-08 do plano de integração, 24/10/2026 |
| Temperatura | 0,3 | `AI_GEMINI_TEMPERATURA` | Plano de Integração de IA |
| Teto de saída | 8192 tokens | `AI_GEMINI_MAX_TOKENS_SAIDA` | Plano de Integração de IA |
| Tempo máximo por chamada | 45 s | `AI_GEMINI_TIMEOUT_S` | `Metodos_Integracao_IA.md` ("timeout e retry limitado") |
| Tentativas em falha passageira | 2, com espera de 2 s que dobra | `AI_GEMINI_TENTATIVAS`, `AI_GEMINI_ESPERA_INICIAL_S` | Mesmo documento |

Os tokens de raciocínio são cobrados como saída e entram no custo de cada
execução.

### Tempo da estruturação

Medição manual, fora da suíte de testes, com a chave do `.env`. O texto enviado
é uma entrada fictícia, com os oito elementos vazios — o caso mais lento — e
cada rodada entra na conta de gasto com IA.

```bash
python manage.py medir_estruturacao --rodadas 10 --raciocinio -1   # antes: o modelo decide
python manage.py medir_estruturacao --rodadas 10                   # depois: limite de 1024
```

A última linha de cada comando sai pronta para esta tabela.

| Data | Modelo | Limite de raciocínio | Rodadas | Média | Mediana | Sem IA |
|---|---|---|---|---|---|---|
| a medir | `gemini-2.5-flash` | -1 (antes) | 10 | — | — | — |
| a medir | `gemini-2.5-flash` | 1024 (depois) | 10 | — | — | — |

## Ratificação (P24)

Versão 1 dos parâmetros de IA. O PO ratificou os valores e os prompts abaixo
na tabela de valores do plano de integração; o registro aqui é de 30/10/2026.

### Pesos do matching

| Parcela | Peso | Variável | Situação |
|---|---|---|---|
| Afinidade com o tema | 0,45 | `AI_MATCH_WEIGHT_SEMANTIC` | Ratificado pelo PO |
| Palavras em comum | 0,20 | `AI_MATCH_WEIGHT_LEXICAL` | Ratificado pelo PO |
| Área de atuação | 0,25 | `AI_MATCH_WEIGHT_AREA` | Ratificado pelo PO |
| Disponibilidade | 0,10 | `AI_MATCH_WEIGHT_AVAILABILITY` | Ratificado pelo PO |
| Nota mínima para sugerir | 0,26 | `AI_MATCH_MIN_SCORE` | Ratificado pelo PO |
| Peso da competência desejável | 0,5 | `AI_MATCH_PESO_DESEJAVEL` | Ratificado pelo PO |

### Supervisão na equipe (PB44)

Cada rodada reserva vagas da equipe sugerida para Supervisores da rede
compatíveis, acima da nota mínima. Entre eles, mestres e doutores vêm primeiro,
e a nota desempata. As outras vagas seguem pela nota. As vagas de supervisão
ficam dentro do limite de sugestões da rodada.

| Parâmetro | Valor | Variável | Situação |
|---|---|---|---|
| Vagas para a supervisão | 2 | `AI_MATCH_LIMITE_SUPERVISAO` | Implementado em 30/10/2026; falta o aceite do PO |
| Titulação priorizada | 3, o nível do mestrado | `AI_MATCH_NIVEL_TITULACAO_SUPERVISAO` | Implementado em 30/10/2026; falta o aceite do PO |
| Limite de sugestões da rodada | 10 | `AI_MATCH_LIMITE_SUGESTOES` | Já existia |

### Versões de prompt

Cada execução de IA grava a versão do prompt da tarefa junto com a do prompt de
sistema, por exemplo `copiloto_v3+PIPE_JT_F1_2026_R1_V2`. O texto de cada uma
está na aba "Prompts de IA — antes e depois" do plano de integração e em
`backend/apps/ai/services/prompts.py`.

| Prompt | Versão | O que faz | Situação |
|---|---|---|---|
| Sistema | `PIPE_JT_F1_2026_R1_V2` | `IA/Prompt_Gemini_PIPE_Jornada_Fase1_v2.txt`, inteiro, em toda chamada | Ratificado pelo PO |
| Resumo da entrada | `sintese_v1` | Problema, contexto e o que falta, para o Supervisor corrigir | Ratificado pelo PO |
| Estruturação | `copiloto_v3` | Escreve só os elementos vazios, liga cada resultado esperado a um objetivo, fecha a inovação com os pontos para validação humana, sugere mudança no que já está escrito e avalia os oito | Implementado em 30/10/2026; falta o aceite do PO (a `copiloto_v2` foi ratificada) |
| Competências | `competencias_v2` | Competências necessárias da proposta | Ratificado pelo PO |
| Reordenação do matching | `matching_v2` | Candidatos só por apelido | Ratificado pelo PO |
| Pré-análise | `preanalise_v2` | Critérios PIPE da versão vigente; cada recomendação ligada a uma lacuna | Ratificado pelo PO |

## Pertinência do matching (SPEC-16)

A pertinência é a parte das sugestões da equipe potencial que a AC2 marca como
pertinente. A meta do TAP é 80% (`AI_MATCH_META_PERTINENCIA`). O total soma as
sugestões de todos os casos.

A amostra é um JSON com um caso por oportunidade e o número (`id_membro`) de
cada pessoa da rede que a AC2 considera pertinente. Usa o número, e não o nome
ou o e-mail, para o arquivo não levar dado pessoal:

```json
{"descricao": "Amostra da AC2, outubro de 2026", "casos": [{"oportunidade": "OP-2026-001", "pertinentes": [3, 7]}]}
```

O comando roda só em banco local, com dados fictícios ou anonimizados, e não
grava nada. Cada oportunidade da amostra precisa ter as competências
necessárias derivadas.

```bash
python manage.py medir_pertinencia amostra.json                  # com a afinidade com o tema
python manage.py medir_pertinencia amostra.json --sem-afinidade  # como antes da SPEC-13
```

O comparativo de modelos (IA 15) usa a mesma amostra: troque
`SEARCH_EMBEDDING_MODEL` ou `AI_MATCH_GEMINI_MODEL` no `.env` local e rode de
novo.

| Data | Cálculo | Casos | Sugestões | Pertinentes | Pertinência |
|---|---|---|---|---|---|
| a medir | Sem a afinidade (antes da SPEC-13) | — | — | — | — |
| a medir | Com a afinidade (depois da SPEC-13) | — | — | — | — |

A amostra rotulada ainda não existe: ela precisa ser montada com a AC2.

## Privacidade

| Ponto | Situação | Fonte |
|---|---|---|
| Camada da conta do Gemini | **A confirmar pelo PO.** Na camada gratuita o Google usa o conteúdo para melhorar produtos; na paga, não. Nenhum dado real entra antes da camada paga. | [Preços do Gemini, linha "Used to improve our products"](https://ai.google.dev/gemini-api/docs/pricing), consultado em 24/10/2026 |
| Nomes de pessoas nos prompts | Trocados por apelidos ("Pesquisador A") antes de sair para a IA | SPEC-05 do plano de integração |

## Afinidade com o tema (matching)

| Parâmetro | Valor | Variável | Fonte e data |
|---|---|---|---|
| Modelo de embedding | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, no próprio servidor | `SEARCH_EMBEDDING_MODEL` | Comparativo de modelos (Engenharia_IA); aceito pelo PO em 24/10/2026 |
| Dimensão do vetor | 384 | `SEARCH_EMBEDDING_DIMENSION` | Ficha do modelo |
| Liga ou desliga | Ligado | `SEARCH_EMBEDDING_ENABLED` | A suíte de testes sempre desliga |
| Peso na nota | 45% | `AI_MATCH_WEIGHT_SEMANTIC` | Pesos de referência da baseline |

O vetor de cada perfil e de cada competência necessária fica gravado em
`Vetor_Membro` e `Vetor_Competencia_Necessaria`, com o modelo e a data. O texto
do perfil inclui competências, técnicas, linhas de pesquisa, formação (curso e
nível) e experiência. Quando o texto muda, o vetor é refeito na rodada seguinte.

Vocabulário: cada competência com "sinônimo de" preenchido vira o termo
canônico antes do vetor ("qPCR" → "PCR quantitativo"). A primeira lista sai da
rede atual com `python manage.py vocabulario_inicial`; o resto é curadoria pelo
`/admin/`, em Competência.

O modelo ocupa algumas centenas de MB de memória e leva cerca de 9 s para
carregar na primeira rodada de cada processo da API (medido em 24/10/2026, nesta
máquina, com o modelo em cache). Se o modelo cair, a rodada sai pelas outras
três parcelas e a aba Equipe explica.

### Roteiro para mostrar à AC2

1. Banco local com a rede cadastrada e as migrations aplicadas (`manage.py migrate`).
2. `python manage.py vocabulario_inicial --simular`, para conferir os sinônimos, e depois sem `--simular`.
3. `python manage.py gerar_vetores`, que calcula os vetores da rede de uma vez.
4. Numa oportunidade com competências derivadas, rodar o matching na aba Equipe.
5. Abrir "Ver detalhes" de uma pessoa sugerida: a parcela "Afinidade com o tema" aparece com valor, ao lado de palavras em comum, área de atuação e disponibilidade.
6. No relatório da equipe, a seção "Como foi calculado" mostra os pesos da rodada.

No Neon, os mesmos passos valem depois do backup cifrado e do ensaio num restore
local, a pedido do PO (`gerar_vetores --banco-remoto`).
