# Plano de integração — pendências e pedidos do PO

Oct 23, 2026 · @Diego

Dá para aplicar tudo sem reescrever o sistema. As 26 pendências e os pedidos do PO viram **23 specs em 5 ondas**, e 20 delas não mexem no banco. O risco alto está em duas specs de infraestrutura, o embedding e a fila, e as duas têm caminho de reserva. Depois da última onda, uma etapa final confere o sistema contra os documentos e publica um artifact com o que foi implementado e o que falta no backlog.

Segurança, LGPD e DBA revisam todo PR. A revisão de hoje achou dois problemas altos de segurança: anexos sem controle de acesso e desenvolvimento apontado para o banco real. Achou também três problemas altos de LGPD: falta aviso de privacidade, dados vão para a IA do Google sem a camada da conta confirmada, e o titular não tem como pedir os próprios dados. Os mais graves entram na onda 1, antes de a AC2 usar dados reais.

A recomendação é entregar as ondas 1 e 2 antes dos testes de aceitação com a AC2. Antes de cada spec, o PO marca a linha dela na tabela "Valores que o PO confirma".

Dados seguem os aceites do PO dê: <https://claude.ai/artifact/T2SLWhGRRwqfDCzsSonFmd>e os documentos que temos na pasta docs.

A cada spec valide se o sistema esta´seguindo o caminho correto e está de acordo com o exigido nos documentos, não invente mais nada além do que o sistema já possui.

## Regras do plano

Valem para todas as specs. Uma spec que quebra uma delas não entra.

1. **Nenhum código antes do aceite.** Este documento é só o plano. Uma spec começa quando a linha dela está "Aceita" na tabela "Valores que o PO confirma".
2. **A baseline manda.** Cada spec cita o documento da pasta `docs` que a sustenta: TAP, Declaração de Escopo, Especificação de Requisitos, Product Backlog, Diagrama de Classes ou Engenharia\_IA. Quando o sistema e o documento divergem, o sistema anda na direção do documento.
3. **O que o sistema tem a mais vai para o Product Backlog.** Entra como item novo (PB79 em diante), com épico, prioridade e marcação de MVP. A lista está em "Itens a mais que entram no Product Backlog", e o trabalho, na SPEC-18.
4. **Seguir o que o PO aceitou nas pendências.** Cada uma das 26 pendências tem a sua spec na seção "Rastreabilidade". Onde o artifact de pendências deixou duas opções, vale a linha aceita na tabela de valores.
5. **Toda migration passa pelo DBA antes do merge** (SPEC-22).
6. **Todo PR passa pela revisão de Segurança e de LGPD antes do merge** (SPEC-20 e SPEC-21). Falha alta ou crítica aberta impede o merge.
7. **Neon só com backup e ensaio.** Antes de qualquer escrita no Neon: backup, e a migration ensaiada num restore local desse backup.
8. Prompt com texto escrito. Todo prompt novo ou alterado fica na aba Prompts de IA, ao lado do texto de hoje, e é esse texto que o PO aceita.
9. O plano só fecha com a etapa final: a verificação de conformidade e o artifact com o que foi implementado e o que falta no backlog.

## Respostas ao PO

### CNPJ no cadastro do Demandante Externo

Dá para fazer sem mudar o banco. A tabela `Organizacao` já guarda o CNPJ (único e obrigatório para empresa demandante) e a conta já tem o vínculo com a organização.

O pedido também fecha um furo que existe hoje. O formulário "Novo usuário" pede só nome, e-mail e perfil, então o Demandante criado ali nasce sem empresa. Ele entra, mas não consegue cadastrar problema: a API recusa com "Sua conta não está vinculada a uma organização demandante", e a lista dele fica vazia.

- Com o perfil Demandante Externo, o formulário passa a pedir **CNPJ, Nome da empresa e E-mail de acesso**.
- O CNPJ tem máscara e conferência dos dígitos verificadores. Nenhuma consulta a serviço externo.
- CNPJ já cadastrado: a empresa é reaproveitada e o nome dela aparece preenchido. É o caso do segundo contato da mesma empresa.
- Pergunta para o PO: "nome" é o da empresa ou o da pessoa de contato? A proposta é o da empresa, porque na baseline o Demandante é a empresa. Detalhe na SPEC-01. Será o da empresa
- Na tabela do demandante tem um campo de telefone, coloque um campo de telefone na tela de "Meu Perfil". Incluído na SPEC-01.

### O que é "Semelhança de conteúdo"

É uma das quatro parcelas da nota de compatibilidade de cada pesquisador na Equipe Potencial, e a de maior peso: **45%**. Ela compara o sentido do texto das competências necessárias com o perfil do pesquisador, mesmo quando as palavras são diferentes ("PCR quantitativo" e "qPCR", por exemplo).

Aparece "indisponível" porque essa comparação depende de um modelo de IA (embedding) que ainda não roda no servidor. É a pendência IA 9. Sem ela, a nota sai das outras três parcelas (termos em comum 20%, área de atuação 25%, disponibilidade 10%), reescaladas para somar 100%.

- Aplique o embedding para resolver essa pendência de forma que eu consiga apresentar pela empresa usando tanto meu banco local tanto o Neon para ela entender como vai funcionar e resolver esse valor de indisponível. A SPEC-13 passou para a onda 1 e cobre os dois bancos.

O rótulo técnico não explica nada disso ao Supervisor, e "indisponível" parece defeito. Com o pedido do PO para aplicar o embedding, a proposta ficou assim:

1. Na onda 1 (SPEC-13): a parcela passa a ter valor, no banco local e no Neon, com o nome "Afinidade com o tema". Se o modelo cair, a linha sai do cartão e uma frase no topo da aba explica (SPEC-02).

### Texto resumido na tela, detalhe no relatório

Concordo, com um ajuste: o detalhe fica **a um clique na própria tela**, e o relatório guarda a versão completa. O relatório é para ler, imprimir e arquivar. Quem está decidindo precisa ver o motivo sem sair da tela.

| Camada | O que mostra | Exemplo na Equipe Potencial |
| --- | --- | --- |
| Tela | O essencial, uma linha por item | Nome, nota e o motivo principal |
| Ver detalhes (abre no lugar) | Tudo o que sustenta o item | Todos os motivos e as quatro parcelas da nota |
| Relatório | O texto completo e como foi calculado | A explicação do cálculo, as lacunas e o histórico da rodada |

Os relatórios de oportunidade, equipe e pré-análise já existem e já têm link nas abas, então a mudança é quase toda no front-end (SPEC-03).

Para o relatório receber esse texto, ele precisa usar a tela inteira. Hoje os três relatórios ocupam só a metade esquerda, e a correção está na SPEC-19.

As telas com mais texto fixo hoje, em contagem aproximada de palavras: Saúde da IA (450), Indicadores (300), Perfil (200), Proposta (185), Copiloto (180), Novo problema (175), Aparência (170) e Equipe (165). A contagem não inclui o texto gerado pela IA, que é o maior volume em Proposta, Equipe e Pré-análise.

### Outras IAs no futuro

Dá para fazer sem mudar o banco. Cada chamada de IA já grava o provedor e o modelo usados, e o Copiloto, as competências, o matching e a pré-análise já falam com a IA por uma interface comum. O que falta é o resto do sistema deixar de assumir o Gemini.

Hoje o Gemini está preso em três lugares: a tela Saúde da IA só confere a GEMINI\_API\_KEY, os 12 serviços que chamam IA criam o provedor do Gemini direto, e os prompts estão escritos dentro do código do Gemini.

- Cada provedor que o sistema conhece declara o nome da variável da chave, a do modelo e as do preço. Com a chave no .env, ele aparece na Saúde da IA quando a API reinicia, sem mudar código.
- O .env também diz qual provedor é o principal e qual é a reserva.
- Um fornecedor que o sistema ainda não conhece precisa, uma vez, de um adaptador e da biblioteca dele. A biblioteca é dependência nova e passa pelo portão de decisão.
- A chave nunca aparece na tela, na API nem no log.
- Provedor novo só recebe dado real depois de entrar no inventário de dados e no aviso de privacidade (SPEC-21).

A proposta está na SPEC-23, na onda 4, antes da SPEC-14, que usa o mesmo registro para o modelo de reserva.

### Prompts de IA: antes e depois

O texto de cada prompt, como está hoje no código e como fica depois das specs, está na aba Prompts de IA — antes e depois.

A comparação achou um ponto que nenhuma spec cobria. O IA/README.md manda usar o arquivo IA/Prompt\_Gemini\_PIPE\_Jornada\_Fase1\_v2.txt como prompt de sistema em toda chamada ao Gemini, e o código não o usa. A proposta entra na onda 2 e tem linha própria na tabela de valores.

## O que cada papel faria

Os sete olhares levam ao mesmo plano. Cada um cuida de uma parte dele. Segurança, LGPD e DBA são revisão obrigatória: nenhum PR entra sem eles.

### QA

- Escreve os critérios de aceite de cada spec como cenários Dado / Quando / Então antes do código. Cada cenário vira um teste que falha primeiro.
- Roda as suítes inteiras em todo PR (hoje 609 testes no back-end e 554 no front-end). Olha com mais cuidado o que muda de contrato: criação de conta, prompts e quem vê o quê.
- Inclui no roteiro de aceitação da AC2 um Demandante criado pelo Administrador. Hoje esse roteiro falharia no cadastro do problema.
- Mede a leitura: cinco tarefas cronometradas com alguém que não conhece o sistema, como "descubra por que esta pesquisadora foi sugerida". Mede antes e depois da onda 1.
- Garante que embedding, fila e IA rodam com stub nos testes. Nada de Gemini real nem banco remoto.

### Engenheiro de software

- Uma spec por PR, branch a partir de `main`, na ordem das ondas.
- Regra de negócio no service, validação no serializer. No caso do CNPJ: o serializer confere os dígitos e o serviço de provisionamento cria ou reaproveita a organização.
- Junta rótulos e dicas das telas num módulo de textos do front-end, para a revisão de linguagem acontecer num lugar só. Um teste recusa jargão técnico na tela (rerank, fallback, score, embedding), do mesmo jeito que o teste de contraste já recusa cor ilegível.
- Atualiza o `CONTEXT.md` quando um termo de tela muda.

### Arquiteto

- Decide os três pontos estruturais: onde roda o embedding, como a pré-análise sai da requisição e se as permissões viram tabela.
- Recomendação: embedding com o modelo MiniLM local, que já é dependência; fila com Celery e um Redis gratuito; permissões mantidas como matriz fixa por papel, com o texto do critério ajustado.
- Revisa cada migration. O pacote inteiro pede três, ou quatro se as permissões virarem tabela.
- Confere que todo componente de IA novo tem caminho de reserva e registro da execução.

### Designer UX/UI

- Define o padrão de três camadas (tela, ver detalhes, relatório) e aplica primeiro nas telas mais carregadas.
- Faz a revisão de linguagem com os termos da baseline. Regra de bolso: no máximo uma frase de ajuda por seção, com até 20 palavras.
- Reescreve estados vazios e de "indisponível" para dizer o que falta e o que fazer, e não o estado técnico.
- Desenha o formulário que muda com o perfil: Demandante pede CNPJ, empresa e e-mail; Supervisor e Administrador pedem nome e e-mail.
- Testa com três a cinco pessoas da AC2 antes e depois.

### Segurança

- Antes da onda 1, corrige os achados da SPEC-20, do mais grave ao menos grave.
- Testa como atacante: abrir oportunidade de outra empresa, trocar o próprio papel pela API, mandar arquivo disfarçado, forçar a senha no login e esconder instruções no texto que vai para a IA.
- Revisa todo PR que toca login, permissão, upload, IA ou configuração.
- Propõe a checagem de bibliotecas vulneráveis no CI. Como é dependência nova, passa pelo portão de aprovação.
- Bloqueia o merge enquanto houver falha alta ou crítica aberta.

### LGPD

- Mantém o inventário de dados pessoais: que dado, de quem, para quê, com que base legal, onde fica, por quanto tempo e com quem é compartilhado.
- Confere o sistema e os documentos contra a lei e contra o que a baseline promete ("tratados conforme LGPD", no TAP e na Declaração de Escopo). Os achados estão na SPEC-21.
- Revisa todo PR que cria campo pessoal, manda dado para fora ou muda o tempo de guarda.
- Leva ao PO e ao orientador as decisões que são deles: o encarregado, os prazos e o plano do Gemini.
- O plano reduz muito o risco de processo, mas não o zera. A revisão final do aviso de privacidade deve ser feita por alguém da área jurídica, como o orientador ou o jurídico da AC2.

### DBA

- Revisa cada migration antes do merge: forma normal, nomes no padrão do projeto, chaves, listas fixas com CHECK, índices e volta atrás (SPEC-22).
- Confere a migration contra o Diagrama de Classes Refinado(Diagrama ainda não está com todas as tabelas, o restante será adicionado com base no que o  sistema já usa de tabela no banco) e roda o teste de conformidade com o diagrama.
- Ensaia a migration num restore local do backup do Neon antes de aplicar no Neon.
- Mede, com EXPLAIN, o efeito nas consultas da fila e do matching.

## Impacto no sistema

O pacote não reescreve o sistema. Das 23 specs, 20 não mexem no banco. Três pedem migration (SPEC-07, SPEC-10 e SPEC-13), a SPEC-15 pede uma quarta só se as permissões virarem tabela, e a SPEC-06 pede uma pequena se o critério da lacuna ganhar coluna própria. O risco alto se concentra em duas specs de infraestrutura: a SPEC-13, adiantada para a onda 1 a pedido do PO, e a SPEC-14, na onda 4. As duas têm caminho de reserva.

| Spec | Resolve | O que muda | Banco | Risco |
| --- | --- | --- | --- | --- |
| SPEC-01 Demandante com CNPJ | Pedido do PO | Formulário Novo usuário; contrato e serviço de criação de conta | Sem mudança | Baixo |
| SPEC-02 Linguagem clara | Pedido do PO | Rótulos, dicas e estados vazios em cerca de 15 telas; mensagens de erro da API | Sem mudança | Baixo |
| SPEC-03 Resumo na tela, detalhe no relatório | Pedido do PO | "Ver detalhes" em 6 telas; seções explicativas nos 3 relatórios | Sem mudança | Médio |
| SPEC-19 Relatórios na tela inteira | Pedido do PO | Layout comum aos 3 relatórios: documento, sumário e ações lado a lado | Sem mudança | Baixo |
| SPEC-04 Teto de gasto da IA | IA 13 | Tabela de preço e limite no `.env`; aviso na tela Saúde da IA | Sem mudança | Baixo |
| SPEC-05 Menos dados pessoais na IA | IA 14 | Prompts da pré-análise e do rerank | Sem mudança | Baixo |
| SPEC-06 Pré-análise com critérios PIPE | IA 8, IA 6 | Prompt e leitura da resposta; aba Pré-análise agrupa lacuna e recomendação | Uma migration pequena se o critério da lacuna ganhar coluna | Médio |
| SPEC-07 Copiloto que entende e atualiza | IA 1, IA 2, IA 3 | Três prompts; serviço do Copiloto; aba Copiloto | Migration: síntese da entrada | Médio |
| SPEC-08 IA mais rápida, pesos ratificados | Passo 6, P24 | Configuração do Gemini; pedido só dos elementos vazios | Sem mudança | Baixo |
| SPEC-09 Portões e situações do fluxo | IA 4, IA 5, P13 | Serviço único de transição; botões bloqueados com motivo | Sem mudança | Médio |
| SPEC-10 Fila com prioridade | P4, P15 | Campo, filtro e ordenação; recorte da fila do Supervisor | Migration: prioridade | Baixo |
| SPEC-11 Rede: inativar e perfil | P3, P10 | Matching e login ignoram inativo; campos do perfil travados | Sem mudança | Baixo |
| SPEC-12 Aviso por e-mail | P17 | Lista de avisos que também saem por e-mail | Sem mudança | Baixo |
| SPEC-13 Matching semântico | IA 9, P2 | Modelo de embedding, geração dos vetores, formação no cálculo | Migration: vetor do membro e da competência | Alto |
| SPEC-23 Outras IAs pela configuração | Pedido do PO | Registro de provedores; escolha no .env; Saúde da IA por provedor; prompts num módulo comum | Sem mudança | Médio |
| SPEC-14 Pré-análise em segundo plano | IA 11, IA 12 | Fila Celery com Redis; provedor de reserva; aba que se atualiza | Sem mudança | Alto |
| SPEC-15 Permissões | P1 | Opção A: só o texto do critério. Opção B: tabela, /API e tela | A: sem mudança. B: migration | Alto |
| SPEC-16 Validar o matching | P5, IA 15 | Comando que mede a pertinência numa amostra rotulada | Sem mudança | Médio |
| SPEC-17 Retenção de dados | P9, P14 | Rotina de anonimização e descarte; aviso no envio de anexo | Sem mudança | Médio |
| SPEC-18 Registro de escopo | E1 a E6 | Documentos da baseline e `CONTEXT.md` | Sem mudança | Baixo |
| SPEC-20 Segurança | Pedido do PO | Download de anexo com login, ambientes separados, CSP, limite nas rotas de IA, documentação da API fechada | Sem mudança | Médio |
| SPEC-21 LGPD | Pedido do PO | Página de privacidade, "Meus dados", camada do Gemini, backups cifrados, inventário | Sem mudança; uma migration se o DBA preferir o ator da trilha em coluna própria | Médio |
| SPEC-22 Revisão do banco | Pedido do PO | Revisão de cada migration; nenhuma mudança própria | Sem mudança | Baixo |

O risco da SPEC-15 vale para a opção B. Na opção A, recomendada, é baixo.

## Ordem de entrega

&#91;embedded content: ordem de entrega · 5 ondas, 23 specs e a etapa final\]

A onda 1 traz o embedding, a pedido do PO, e as correções críticas de segurança e LGPD. As ondas 2 e 3 saem uma spec por PR, na ordem. A onda 4 começou a pedido do usuário, com o Redis ainda pendente de confirmação do Arquiteto; o caminho síncrono continua o padrão. A onda 5 depende mais da AC2 do que de código. A SPEC-23 abre a onda 4 e não depende do Redis. A etapa final começa quando a última spec aceita chega ao main.

## Revisões obrigatórias — Segurança, LGPD e banco

São três specs que valem para o pacote inteiro. As correções críticas entram na onda 1, antes de a AC2 usar dados reais, e a revisão continua em todo PR.

### SPEC-20 · Segurança

**Objetivo.** Fechar as brechas que existem hoje e impedir que uma spec nova abra outra. Respaldo: o TAP pede "segurança e proteção de dados conforme LGPD" e lista o risco de "exposição indevida de dados pessoais ou confidenciais".

**O que já está bem.** Toda rota exige login, menos login, recuperação de senha e aparência pública. Cada ator só vê o que é dele. Há limite de tentativas no login e na recuperação. O token de acesso dura 30 minutos, e o de renovação é trocado a cada uso. HTTPS, HSTS e bloqueio de iframe ligam em produção. Nenhum segredo está no git.

**Achados no código de hoje.**

| Nº | Gravidade | Achado | Correção |
| --- | --- | --- | --- |
| S1 | Alta | Anexos sem controle de acesso. Com `DEBUG=True`, que é o que o `.env` de hoje usa, a pasta `/media/` é servida sem login. O caminho é previsível (ano, mês e nome original do arquivo), e quem acerta o nome baixa o documento da empresa. Com `DEBUG=False`, ninguém baixa, nem quem deveria. | Download só por uma rota com login, que confere se o ator alcança a oportunidade. Nome do arquivo trocado por um código aleatório. A pasta deixa de ser servida direto. |
| S2 | Alta | O `.env` de hoje roda com `AMBIENTE=producao` e `DEBUG=True` contra o Neon. O próprio sistema avisa que isso é incoerente. Um erro mostra a página técnica detalhada, e os anexos ficam abertos (S1). | Desenvolver no banco local. O Neon só é usado por um ambiente de homologação com `DEBUG` desligado. Como apresentar à AC2 nesse modo, o Arquiteto decide. |
| S3 | Média | O tipo do anexo é conferido só pelo que o navegador declara. Um arquivo HTML entra dizendo que é PDF. | Conferir o conteúdo real do arquivo e a extensão, e entregar sempre como download. |
| S4 | Média | Os tokens de acesso e de renovação ficam no `localStorage`. Uma falha de XSS roubaria a sessão. Hoje o front não injeta HTML, o que reduz o risco. | Política de conteúdo (CSP) no front e token de renovação em cookie que o JavaScript não lê. |
| S5 | Média | O texto do Demandante vai para o prompt da IA. Uma instrução escondida nele pode tentar mudar a resposta. | Separar no prompt o texto do usuário das instruções, manter a validação do formato da resposta e testar com textos maliciosos. A saída segue com revisão humana. |
| S6 | Média | As rotas de IA têm o mesmo limite das outras: 240 chamadas por minuto por usuário. Uma conta invadida gasta o teto do mês em minutos. | Limite próprio para as rotas de IA, além do teto por oportunidade da SPEC-04. |
| S7 | Baixa | A documentação da API (`/api/docs/` e `/api/schema/`) é pública e entrega o mapa da API. | Em produção, só para o Administrador. |
| S8 | Baixa | O `/admin/` do Django fica no endereço padrão. | Endereço definido por configuração e acesso só para conta técnica. |
| S9 | Baixa | O CI não confere bibliotecas com falha conhecida, e o front-end nem tem job no CI. | Job do front-end e checagem de dependências, depois da aprovação no portão. |

S1 e S2 entram na onda 1. S3 a S6 entram na onda 2, e S7 a S9 na onda 3.

**Pronto quando.**

- [ ] Teste: o anexo de uma empresa não abre para o Demandante de outra empresa, nem sem login.
- [ ] Teste: arquivo com conteúdo HTML e tipo declarado PDF é recusado.
- [ ] Teste: a recuperação de senha responde igual para e-mail cadastrado e não cadastrado.
- [ ] `manage.py check --deploy` passa sem aviso no ambiente de homologação.
- [ ] Cada PR registra a revisão de segurança com "sem falha alta ou crítica".

### SPEC-21 · LGPD

**Objetivo.** Cumprir o que a baseline promete e a lei exige, para a AC2 poder usar dados reais sem risco de processo. Respaldo: o TAP e a Declaração de Escopo dizem que dados pessoais e confidenciais "devem ser tratados conforme LGPD", e a premissa dos dois é usar dados fictícios ou anonimizados nos testes.

**Achados no sistema e nos documentos.**

| Nº | Gravidade | Achado | Correção |
| --- | --- | --- | --- |
| L1 | Alta | Nenhuma tela tem aviso de privacidade nem o contato do encarregado. A lei exige informar finalidade, base legal, compartilhamento e direitos (art. 9) e indicar o encarregado (art. 41). | Página pública "Privacidade", com link no login e no rodapé, e o contato do encarregado. O cadastro de contatos de suporte que já existe pode guardar esse contato. |
| L2 | Alta | O texto das oportunidades e dados de perfil vão para a IA do Google (Gemini), fora do Brasil (art. 33). Os documentos de Engenharia\_IA anotam que as regras de uso de dados mudam entre a camada gratuita e a paga: na gratuita, o provedor pode usar o conteúdo. | Confirmar a camada da conta. Com dado real, só a camada paga, que não usa o conteúdo. Declarar a transferência no aviso de privacidade e manter a SPEC-05 (sem nomes no prompt). |
| L3 | Alta | O titular não tem como pedir cópia dos próprios dados nem a exclusão da conta (art. 18). | "Meus dados" no perfil: baixar uma cópia e pedir exclusão. O Administrador atende anonimizando a conta, e a trilha passa a mostrar "pessoa removida". |
| L4 | Média | Trilha, anexos e contas ficam guardados para sempre. | Prazos e rotina de descarte da SPEC-17. |
| L5 | Média | Há cópias completas do Neon em disco pessoal (`backups/neon` e `backups/local`), sem criptografia e sem prazo. | Backup cifrado, guardado só até o ensaio da migration dar certo e descartado com registro. |
| L6 | Média | A trilha guarda em texto o e-mail de quem agiu, numa tabela que não se apaga. | A anonimização troca esse e-mail por "pessoa removida", e os eventos novos deixam de copiar e-mail para o detalhe. Guardar o identificador da conta em coluna própria seria mais limpo, mas é migration, e quem decide é o DBA. |
| L7 | Média | O desenvolvimento usa o Neon, que é o banco de produção, contra a premissa de dados fictícios do TAP e do Escopo. | Desenvolver no banco local com dados fictícios. É a mesma correção da S2. |
| L8 | Baixa | A fonte Inter vem dos servidores do Google, que recebem o IP de cada visitante sem aviso. | Servir a fonte junto com o front-end. |
| L9 | Baixa | Não há inventário de dados pessoais nem roteiro para incidente (arts. 37 e 48). | Documento na pasta `docs` com o inventário e o roteiro: quem avisa a ANPD e os titulares, e em quanto tempo. |

L1, L2, L5 e L7 entram na onda 1. L3 e L6 entram na onda 2, e L8 e L9 na onda 3. O inventário também precisa registrar três pontos: o CNPJ de MEI identifica uma pessoa e conta como dado pessoal; o telefone novo do Demandante é opcional e tem finalidade declarada; e a região do servidor do Neon, que ainda precisa ser confirmada, pode ser outra transferência internacional.

**Pronto quando.**

- [ ] A página de privacidade está no ar, com link no login e o contato do encarregado.
- [ ] A camada do Gemini está confirmada e registrada. Sem a camada paga, nenhum dado real vai para a IA.
- [ ] O titular baixa os próprios dados e pede a exclusão pela tela.
- [ ] Nenhum backup com dado real fica sem criptografia.
- [ ] O inventário lista todo dado pessoal do sistema, com finalidade, base legal e prazo.

### SPEC-22 · Revisão do banco (DBA)

**Objetivo.** Toda migration nova segue a normalização e o padrão que o banco já tem. Respaldo: o Diagrama de Classes Refinado, o padrão registrado no `CONTEXT.md` e a regra do `AGENTS.md` de migration revisada e reversível.

**O que a revisão confere.**

- Forma normal até a 3FN: nenhum dado copiado de outra tabela, como o nome da empresa repetido na conta.
- Nomes: tabela com inicial maiúscula em cada palavra (`Proposta_Estruturada`); coluna, restrição e índice em minúsculas e em português; chave primária `id_<tabela>`.
- Listas fixas, como situação e prioridade, com CHECK, igual às que já existem.
- Chave estrangeira com o `on_delete` justificado, e índice para o que a fila e o matching filtram ou ordenam.
- Migration reversível, testada em SQLite (a suíte desta máquina) e em PostgreSQL (o CI).
- Migration que converte dados vai ao Neon pela porta 5432, depois do backup e do ensaio, e nunca pelo `neon_migrate.py`, que não roda conversão de dados.

**As migrations do pacote.**

| Spec | Mudança | O que a revisão decide |
| --- | --- | --- |
| SPEC-06, se aceita | Critério da lacuna | Chave estrangeira opcional para o critério da versão usada, sem copiar o texto do critério. |
| SPEC-07 | Síntese da entrada | Guardar na sessão do Copiloto, porque a síntese depende da sessão e não da oportunidade. Texto opcional, sem cópia na proposta. |
| SPEC-10 | Prioridade da oportunidade | Lista fixa (Alta, Média, Baixa) com CHECK, padrão Média e índice junto da situação, para a fila. |
| SPEC-13 | Vetor do membro e da competência | Tabela satélite 1:1 por entidade, com vetor, modelo e data de geração, em vez de colunas grandes nas tabelas mais lidas. Tipo que funcione em SQLite e em PostgreSQL. |
| SPEC-15, só na opção B | Tabela de permissões | Papel × ação com chave composta. Só existe se o PO escolher a opção B. |
| SPEC-21, opcional | Ator da trilha em coluna própria | Identificador da conta com SET\_NULL ao lado do texto atual, para a anonimização não depender de procurar e-mail em texto. Se o DBA não aprovar, a SPEC-21 segue sem migration. |

A SPEC-01 não cria migration, mas passa pela mesma revisão: o CNPJ é guardado só com os 14 dígitos, sem máscara, e continua único.

**Pronto quando.**

- [ ] Todo PR com migration traz a revisão do DBA.
- [ ] O teste de conformidade com o diagrama passa depois de cada migration.
- [ ] Cada migration volta atrás sem erro no banco local.
- [ ] O diagrama de classes e o `querys.sql` são atualizados quando o schema muda.

## Onda 1 — pedidos do PO e configuração

Sete specs. Seis não mexem no banco. A SPEC-13 entrou aqui a pedido do PO, para a AC2 ver a Equipe Potencial com a parcela de afinidade calculada, e traz a única migration da onda. As correções críticas de segurança e LGPD (S1, S2, L1, L2, L5 e L7) entram junto.

**Andamento em 25/10/2026.** Implementada no branch `feat_ondas_1_2`, ainda sem commit: SPEC-01 a 05, SPEC-19 e SPEC-13. Segurança, LGPD e DBA revisaram as ondas 1 e 2 juntas, e os achados de código já foram corrigidos (detalhes no andamento da onda 2). As suítes passam: 836 testes no backend e 651 no front. Falta o usuário rodar no banco local, com `AMBIENTE=local` no `backend/.env`: `migrate` (ida e volta), `vocabulario_inicial` e `gerar_vetores`.

### SPEC-01 · Cadastro do Demandante Externo com CNPJ

**Objetivo.** O Administrador cria o Demandante já ligado à empresa, e ele cadastra um problema no primeiro acesso.

**O que muda.**

- Back-end: o contrato de criação de conta aceita `cnpj` e `nome_empresa` quando o perfil é Demandante, e recusa os dois nos outros perfis. O CNPJ é conferido na fronteira: 14 dígitos e dígitos verificadores.
- Back-end: o serviço de provisionamento cria a organização demandante ou reaproveita a do mesmo CNPJ, na mesma transação da conta. A trilha registra a empresa.
- Back-end: uma consulta de organização por CNPJ, só para o Administrador, preenche o nome da empresa quando ela já existe.
- Front-end: o formulário "Novo usuário" troca os campos conforme o perfil. Demandante: CNPJ (com máscara 00.000.000/0000-00), Nome da empresa e E-mail de acesso. A edição permite trocar a empresa.
- Banco: nada muda. Usa `Organizacao.cnpj`, que já é único, e o vínculo `Usuario.organizacao`.
- Contas que já existem: o Demandante sem empresa aparece na lista com "Sem empresa vinculada", e o Administrador completa pela edição. Antes do deploy, uma consulta conta quantos há no ambiente.

**Respostas do PO.** O nome é o da empresa. O Demandante também ganha o campo Telefone no Meu Perfil. O campo já existe na tabela `Demandante_Externo` e no diagrama de classes, mas a API e a tela não o mostram. É opcional, tem máscara, e só o próprio Demandante e o Administrador o veem.

**Respaldo.** Diagrama de classes (DemandanteExterno com razão social, CNPJ e telefone) e PB05. Os dois campos entram no backlog como PB88 e PB89.

**Pronto quando.**

- [ ] Demandante criado pelo Administrador cadastra um problema no primeiro acesso.
- [ ] CNPJ com dígito errado é recusado com mensagem clara, no campo.
- [ ] Dois contatos da mesma empresa ficam ligados à mesma organização.
- [ ] Supervisor e Administrador continuam sendo criados só com nome e e-mail.
- [ ] O Demandante salva e corrige o telefone no Meu Perfil.

### SPEC-02 · Linguagem clara

**Objetivo.** Quem não conhece o sistema entende cada tela sem explicação de fora.

**O que muda.**

- Um glossário de tela, com os termos da baseline e nomes simples para o que é técnico. Os textos ficam num módulo só do front-end.
- As mensagens de erro da API ganham acento e perdem jargão. Das cerca de 50 mensagens de regra de negócio, umas 21 estão escritas sem acento ("nao esta").
- O aviso de erro deixa de mostrar o nome técnico do campo antes da mensagem.
- Um teste recusa jargão na tela: rerank, fallback, score, embedding, baseline.

Exemplos do que muda:

| Hoje | Proposta |
| --- | --- |
| Semelhança de conteúdo: indisponível | Afinidade com o tema, com valor (SPEC-13). Se o modelo cair, a linha sai e uma frase no topo explica |
| Termos em comum | Palavras em comum |
| papel: Papel fora dos quatro atores da baseline. | Escolha um perfil da lista. |
| Sua conta nao esta vinculada a uma organizacao demandante. | Sua conta ainda não está ligada a uma empresa. Fale com o administrador. |

**Pronto quando.**

- [ ] O teste de jargão passa em todas as telas.
- [ ] Toda mensagem de erro da API tem acento e nenhum nome de campo técnico.
- [ ] No teste de leitura do QA, quem não conhece o sistema conclui 4 das 5 tarefas sem ajuda.

### SPEC-03 · Resumo na tela, detalhe a um clique e no relatório

**Objetivo.** Cada tela mostra o essencial. O resto fica em "Ver detalhes", e o relatório guarda a versão completa.

**O que muda.**

- Um componente único de "Ver detalhes", que abre no lugar e funciona com teclado e leitor de tela.
- Aplicação, nesta ordem: Equipe, Pré-análise, Proposta, Competências, Saúde da IA e Indicadores.
- Equipe: o cartão fechado mostra nome, nota e o motivo principal. Os detalhes mostram todos os motivos e as parcelas da nota.
- Pré-análise: cada dimensão mostra o nível e uma linha. Os detalhes mostram lacunas e recomendações.
- Proposta: cada elemento aparece recolhido nas duas primeiras linhas.
- Relatórios: o de equipe ganha "Como foi calculado" e o de pré-análise ganha "Como ler esta pré-análise". São os textos que saem das telas.
- Back-end: confere se cada texto que sai da tela já está no relatório. O que faltar entra no serviço do relatório.

**Pronto quando.**

- [ ] Nada desaparece: cada texto retirado da tela está em "Ver detalhes" ou no relatório.
- [ ] O cartão fechado da Equipe tem no máximo três linhas.
- [ ] O Supervisor acha o motivo de uma sugestão em até dois cliques.

### SPEC-04 · Teto de gasto da IA que funciona

**Objetivo.** O teto mensal de R$ 50 e o limite por oportunidade passam a bloquear de verdade.

**O que muda.**

- Configuração: preencher `AI_CUSTO_ENTRADA_BRL_POR_MILHAO` e `AI_CUSTO_SAIDA_BRL_POR_MILHAO` com o preço público do modelo em uso, convertido pelo câmbio do dia. A fonte e a data ficam na documentação de IA.
- Configuração: definir o limite por oportunidade. A equipe propõe R$ 5, um décimo do teto mensal.
- Front-end: a tela Saúde da IA avisa quando a tabela de preço está vazia.

**Pronto quando.**

- [ ] Uma chamada de IA em ambiente local registra o custo em reais.
- [ ] Atingido o limite de uma oportunidade, a próxima chamada dela não sai, e a tela explica o motivo.

### SPEC-05 · Menos dados pessoais enviados à IA

**Objetivo.** Nenhum nome ou e-mail de pessoa sai para o provedor de IA (LGPD, minimização).

**O que muda.**

- Os prompts da pré-análise e da reordenação do matching trocam o nome por um apelido ("Pesquisador A", "Pesquisador B"). O sistema traduz de volta ao ler a resposta.
- Competências, titulação e disponibilidade continuam no prompt, porque são o que a IA avalia.
- Mudança de prompt passa pelo portão de decisão. O PO já liberou, e o PR registra essa liberação.

**Pronto quando.**

- [ ] Em teste, o texto que chega ao provedor falso não tem nome nem e-mail de nenhum membro.
- [ ] A tela continua mostrando o nome certo de cada pessoa.

### SPEC-19 · Relatórios ocupando a tela inteira

Entrou depois das outras, por isso o número. Vai junto da SPEC-03, que coloca mais texto nos relatórios.

**Objetivo.** Os três relatórios (oportunidade, equipe e pré-análise) usam a largura da tela, sem a metade direita vazia.

**Por que acontece.** Os três usam o mesmo estilo, `RelatorioPage.scss`. O documento tem largura máxima de 900 px e nada o centraliza, então ele fica preso à esquerda. Já a barra de ações ocupa a largura toda, e o botão de imprimir vai parar no canto direito, longe do documento. Numa tela larga, quase metade da área fica vazia.

**O que muda.**

- Um layout de relatório único, usado pelos três. Corrigido uma vez, vale para todos, inclusive para um relatório novo.
- Tela larga (a partir de cerca de 1200 px): duas colunas. À esquerda, o documento. À direita, um painel que acompanha a rolagem, com o sumário das seções, a identificação (código, situação, data em que foi gerado) e as ações (imprimir, voltar à oportunidade).
- Tela média: documento centralizado, com o painel numa faixa acima dele. Celular: uma coluna só.
- Os campos de identificação passam de duas para três colunas quando houver espaço. O texto corrido mantém largura de leitura, com linha de até uns 80 caracteres, porque linha muito longa cansa.
- Impressão: o painel some e o documento ocupa a folha, como hoje.
- Sem mudança no back-end nem no banco.

**Pronto quando.**

- [ ] Em 1366 px e 1920 px, nenhum relatório deixa faixa vazia além das margens.
- [ ] O sumário leva a cada seção, também pelo teclado.
- [ ] A impressão sai igual à de hoje.
- [ ] O QA anexa ao PR prints dos três relatórios em 375, 1366 e 1920 px, nos temas claro e escuro.

### SPEC-13 · Matching semântico e formação no cálculo

**Objetivo.** Ligar a parcela de 45% da nota que hoje aparece como "indisponível". Sem ela, a meta de 80% de pertinência do TAP fica fora de alcance. Foi adiantada para a onda 1 a pedido do PO, para a apresentação à AC2.

**O que muda.**

- Back-end: o provedor de embedding passa a usar o modelo MiniLM multilíngue, que já está nas dependências. O vetor tem 384 posições.
- Banco: o vetor do membro da rede e o da competência necessária ficam em tabelas satélite, com o modelo e a data de geração, como propõe a SPEC-22. É a migration desta onda.
- Tipo do campo: binário ou JSON, e não o array do Postgres. A suíte roda em SQLite nesta máquina e em Postgres no CI, e o array só existe no Postgres.
- Geração: o vetor é refeito quando o perfil ou a competência muda. Um comando gera os vetores da rede inteira uma vez.
- Vocabulário de competências (P11, que a pendência IA 9 cita): a proposta é o modelo híbrido, texto livre com uma lista de sinônimos, para "qPCR" e "PCR quantitativo" virarem o mesmo termo antes do vetor. A primeira lista sai da rede atual.
- Dois bancos, a pedido do PO: a migration e o comando rodam primeiro no banco local e depois no Neon, pela porta 5432, com backup antes e ensaio num restore local. O comando grava dados, então não vai pelo `neon_migrate.py`.
- Apresentação: um roteiro curto mostra à AC2 a mesma oportunidade nos dois bancos, com a parcela calculada.
- Formação (P2): curso e nível entram no texto do perfil que vira vetor. Isso muda o algoritmo, então o resultado é medido na amostra da SPEC-16.
- Memória: o modelo ocupa algumas centenas de MB no servidor. O Arquiteto confere se cabe no plano de hospedagem.
- Testes: provedor falso com vetores fixos. A suíte nunca baixa o modelo.
- Front-end: a parcela volta com o nome "Afinidade com o tema".

**Pronto quando.**

- [ ] Uma rodada de matching sai com a parcela calculada, sem o aviso de cálculo reduzido, no banco local e no Neon.
- [ ] Com o modelo fora do ar, a rodada sai pelas outras três parcelas e a tela explica.
- [ ] Quando a amostra da SPEC-16 existir, a pertinência nela não cai em relação ao cálculo de hoje.

## Onda 2 — prompts do Copiloto e da pré-análise

Três specs que mudam o que a IA recebe e devolve. Todas passam pelo portão de decisão de prompt, que o PO liberou. Cada PR registra a versão nova do prompt na execução de IA. Os quatro prompts passam a usar o prompt de sistema da baseline (IA/Prompt\_Gemini\_PIPE\_Jornada\_Fase1\_v2.txt), como pede o IA/README.md. O texto de antes e de depois de cada um está na aba Prompts de IA — antes e depois.

**Andamento em 25/10/2026.** As SPEC-06, 07 e 08 foram implementadas no branch `feat_ondas_1_2`, junto com os achados S1 a S4, S6, L1, L3 e L5 a L7 das SPEC-20 e 21. O resultado das revisões:

- **Segurança.** Nenhuma falha alta. Corrigido:
  - a marca `<dados>` do prompt agora é reconhecida em qualquer grafia;
  - trocar ou redefinir a senha encerra as outras sessões;
  - o login e a saída só aceitam a origem do próprio site, e o login só aceita JSON;
  - a cópia dos dados não traz mais a atividade de uma conta anterior que usou o mesmo e-mail.

  Ficam para depois:
  - um cache compartilhado para o limite da IA, no deploy;
  - o `/admin/` e a documentação da API, na onda 3.
- **LGPD.** Corrigido:
  - a anonimização apaga também o e-mail nas execuções da IA e o nome nos textos que a IA escreveu;
  - a trilha guarda só o nome dos campos editados, e o histórico lê o nome na conta;
  - o contexto da oportunidade marca "Complementação do Demandante", sem o nome;
  - o pedido de exclusão não manda mais aviso com o nome;
  - a cópia dos dados ganhou avisos, anexos, CNPJ, registros feitos por outras pessoas e indicações em equipe;
  - a experiência vai para a IA sem e-mail, telefone ou link;
  - a cópia e o download de anexo saem com `Cache-Control: no-store`;
  - o backup vai direto do `pg_dump` para a cifra.

  Para o PO ou a área jurídica:
  - **L2**: confirmar a camada paga do Gemini. Para a LGPD, isso bloqueia o merge;
  - **N6**: o perfil anonimizado ainda guarda titulação e competências. Decidir entre apagar os dois ou chamar o processo de pseudonimização no aviso;
  - o texto da página de privacidade e a indicação do encarregado;
  - cifrar ou descartar os backups antigos que estão em claro.
- **DBA.** Corrigido:
  - **A1**: a anonimização só troca os campos que guardam pessoa, e o que aconteceu fica escrito;
  - **M2**: a lacuna com critério fica na dimensão do critério;
  - **M3**: a documentação do repositório foi atualizada. O `querys.sql` fica fora do repositório e é com o usuário.

  Schema novo sem linha própria na SPEC-22: `natureza` e `pergunta` em `Lacuna_Proposta` (SPEC-07). Eles entram na migration `copilot 0012`, junto com o `id_criterio` (SPEC-06) e a `sintese`.

  Propostas do DBA, que precisam de aceite:
  - a coluna `id_ator` na trilha (a migration opcional da SPEC-21);
  - CHECKs que amarrem natureza e critério ao tipo da lacuna;
  - um índice parcial para o pedido de exclusão;
  - ajustes nas tabelas de vetor.

### SPEC-06 · Pré-análise com os critérios PIPE

**Objetivo.** A tela diz que a pré-análise usa os critérios PIPE, e o prompt passa a recebê-los. Cada recomendação responde a uma lacuna.

**O que muda.**

- O prompt recebe os 23 critérios da versão vigente, agrupados nas 6 dimensões. O mapa critério × dimensão foi montado pela equipe e o PO ratifica.
- Cada recomendação volta com a lacuna que resolve e o critério de origem, ou marcada "sem evidência". O campo que liga recomendação e lacuna já existe e está vazio, então não há migration.
- A Lacuna não tem onde guardar o critério (A1 a F3): o campo\_afetado guarda a dimensão. A proposta é uma coluna própria, com uma migration pequena revisada pelo DBA (SPEC-22).
- Resposta sem esse vínculo conta como resposta malformada e usa a nova tentativa que já existe.
- A aba e o relatório mostram cada lacuna com a recomendação logo abaixo.

**Pronto quando.**

- [ ] Toda recomendação mostra a lacuna e o critério, ou "sem evidência".
- [ ] O texto segue orientativo: nenhuma ocorrência de nota, parecer, aprovação ou decisão da FAPESP.

### SPEC-07 · Copiloto que entende a entrada e usa a resposta

**Objetivo.** O Supervisor responde uma pergunta e vê a proposta mudar. Hoje "respondi e nada mudou" é o que mais confunde.

**O que muda.**

- Interpretação inicial (IA 1): ao abrir a sessão, o Copiloto devolve uma síntese editável da entrada, com o problema, o contexto e o que falta. Precisa de um campo novo, e a proposta é guardá-lo na sessão do Copiloto. É a migration desta onda.
- Perguntas (IA 2): a proposta é usar o banco de perguntas PIPE para os elementos vazios, que é previsível e não gasta IA. A IA só formula pergunta para elemento preenchido, mas fraco.
- Resposta (IA 2): preenche o elemento vazio. Em elemento já preenchido, vira uma sugestão que o Supervisor aceita ou recusa. Nada é sobrescrito sem revisão humana.
- Lacunas (IA 3): o prompt avalia cada elemento como ausente, inconsistente ou pouco desenvolvido, e devolve o que fazer em cada caso.

**Pronto quando.**

- [ ] Responder uma pergunta muda o elemento ou mostra uma sugestão para aceitar.
- [ ] A síntese inicial aparece e pode ser editada.
- [ ] Cada lacuna diz o tipo e a recomendação.

### SPEC-08 · IA mais rápida e parâmetros ratificados

**Objetivo.** Reduzir a espera do Copiloto e fechar os parâmetros de IA como versão 1.

**O que muda.**

- O "raciocínio" do Gemini 2.5 Flash ganha limite por configuração, e o Copiloto pede só os elementos vazios.
- A biblioteca instalada (google-generativeai 0.8.5) não tem esse limite. Ele pede a biblioteca nova do Google (google-genai), que é dependência nova e passa pelo portão de decisão. A troca muda só o adaptador do Gemini.
- Medição manual, fora da suíte e com chave própria: tempo médio de 10 estruturações antes e depois.
- Ratificação (P24): pesos do matching (0,45 / 0,20 / 0,25 / 0,10), nota mínima 0,26 e os quatro prompts. Acontece depois das SPEC-05 a SPEC-07, porque elas mudam os prompts.

**Pronto quando.**

- [ ] O tempo médio da estruturação cai em relação à medição de antes, e os dois números ficam registrados.
- [ ] A documentação de IA lista os pesos e as versões de prompt ratificados.

## Onda 3 — regras de produto e do fluxo

Quatro specs que transformam avisos em regras. Onde a baseline pede algo, a proposta segue a baseline.

**Andamento em 26/10/2026.** As SPEC-09 a 12 foram implementadas no branch `feat_ondas_1_2`, ainda sem commit, a pedido do usuário. Isso aconteceu antes do "Aceita" do PO: as linhas delas seguem "Pendente" na tabela de valores, e o código usa a proposta da equipe de cada linha. O S7 e o S8 da SPEC-20 entraram junto. A onda 4 (SPEC-23, SPEC-14 e SPEC-15) também foi implementada no mesmo branch, ainda sem commit; ver o andamento na seção dela. As suítes passam: 984 testes no backend e 691 no front.

- **Fluxo.** Continuar e Revisar só valem em Aguardando decisão. Arquivar vale em qualquer etapa em curso. Refazer uma etapa anterior não volta a situação, e pular etapa vale quando o portão da etapa passa. Antes do deploy, `manage.py conferir_situacoes` lista as oportunidades que ficaram atrás dos próprios dados; com `--aplicar`, ajusta.
- **Segurança.** Achou uma falha alta anterior à onda 3: pelo cadastro da rede, o Supervisor trocava o e-mail de login da conta de outro Supervisor ou de um Administrador. Achou também três médias: inativar desfazia a suspensão, alcançava Supervisores e deixava trocar o e-mail de cadastro anonimizado. As quatro foram corrigidas, com teste. Ficam abertos: o `.env` local apontado para o banco oficial, limite de tentativas no login do `/admin/` e a checagem de bibliotecas no CI (portão).
- **LGPD.** Nenhuma falha alta nova; a L2 continua bloqueando o merge. O aviso de privacidade agora cita o e-mail das decisões. A conta anonimizada não volta por nenhuma porta, e a justificativa do Revisar avisa que sai por e-mail.
- **DBA.** A migration `opportunities` 0007 foi aprovada com condição: aceite do PO e ensaio no PostgreSQL antes do Neon. A coluna ganhou padrão no banco, e o índice leva o nome da coluna.

**Para o PO:** marcar as linhas da onda 3. Decidir também se membro inativo continua indo à pré-análise numa equipe antiga e se um pedido de exclusão aberto suspende o e-mail de decisão.

**Para o Arquiteto e o usuário:** incluir a prioridade no Diagrama de Classes e no `querys.sql`. Usar como remetente uma conta de e-mail da AC2, não uma conta pessoal.

### SPEC-09 · Portões e situações do fluxo

**Objetivo.** A oportunidade só avança quando a etapa anterior está pronta, e cada mudança de situação tem regra e responsável.

**O que muda.**

- Um serviço único de transição, com a lista de mudanças válidas e quem dispara cada uma (P13). Os outros serviços passam a chamá-lo. Transição fora da lista é recusada com o motivo.
- Proposta de transições, para o PO confirmar: Entrada, Em estruturação, Competências, Matching, Pré-análise, Aguardando decisão, e daí Continuar, Revisar ou Arquivar. Revisar volta para Em estruturação.
- Proposta não revisada (IA 4): Competências, Equipe e Pré-análise ficam bloqueadas até a revisão, como pede o PB41. Hoje só há aviso.
- Pré-análise sem equipe (IA 5): a execução é recusada, como pede o PB50 ("e uma equipe potencial definida").
- Front-end: o botão bloqueado diz o motivo numa linha e leva à etapa que falta.
- Antes do deploy: conferir as oportunidades que já existem no ambiente e corrigir a situação das que ficariam fora da regra.

**Pronto quando.**

- [ ] A API recusa transição inválida e diz por quê.
- [ ] Competências não roda com proposta não revisada.
- [ ] Pré-análise não roda sem equipe potencial.
- [ ] Revisar devolve a oportunidade para Em estruturação.

### SPEC-10 · Fila com prioridade

**Objetivo.** O Supervisor sabe o que atacar primeiro (PB61: "com indicação de status e prioridade").

**O que muda.**

- Prioridade (P4): campo novo com Alta, Média e Baixa, definido pelo Supervisor. Toda oportunidade nasce Média. É a migration desta onda.
- A fila ganha filtro e ordenação por prioridade. A mudança de prioridade entra na trilha. O Demandante não vê a prioridade, porque é trabalho interno.
- Visibilidade (P15): a proposta é manter como está. Todo Supervisor vê a fila inteira, porque o Núcleo é uma unidade só e um Supervisor cobre o outro. O recorte "Aguardando minha atuação" já existe.

**Pronto quando.**

- [ ] O Supervisor define a prioridade e a fila ordena por ela.
- [ ] A mudança aparece na trilha com autor e data.
- [ ] A tela do Demandante não mostra a prioridade.

### SPEC-11 · Rede: inativar membro e campos do perfil

**Objetivo.** Tirar alguém da rede sem apagar a história, e deixar claro o que o Pesquisador pode editar.

**O que muda.**

- Inativar (P3): o membro sai das próximas rodadas de matching e perde o login. Continua nas equipes já geradas, marcado como inativo. Reativar devolve as duas coisas. A situação "inativo" já existe no banco.
- Perfil (P10): o Pesquisador edita formação, titulação, competências, técnicas, linhas de pesquisa, experiência e disponibilidade, que são os campos do RF03. Nome, e-mail, papel na rede e instituição ficam com o Supervisor.

**Pronto quando.**

- [ ] Membro inativo não aparece numa rodada nova e não consegue entrar.
- [ ] As equipes antigas continuam mostrando o membro, marcado como inativo.
- [ ] A API recusa a edição de campo travado feita pelo Pesquisador.

### SPEC-12 · Aviso por e-mail ao Demandante

**Objetivo.** O Demandante fica sabendo, fora da plataforma, quando o problema dele muda de rumo (PB26).

**O que muda.**

- O aviso dentro da plataforma continua como está. A proposta é que só três avisos também saiam por e-mail: Revisar (com o pedido de complementação), Continuar e Arquivar.
- O e-mail não leva informação interna, como observações do Supervisor, equipe ou prioridade.
- O envio já tem chave de liga e desliga. Em teste o e-mail fica na memória e nunca sai.

**Pronto quando.**

- [ ] Revisar, Continuar e Arquivar geram e-mail para as contas da empresa demandante.
- [ ] Nenhum e-mail real sai durante a suíte de testes.

## Onda 4 — arquitetura e infraestrutura

A fila da pré-análise, que é a spec de risco alto que sobrou, e a decisão de permissões. Ficam por último porque nada das outras ondas depende delas. A SPEC-14 tem caminho de reserva: se falhar, o sistema continua como hoje. A SPEC-23, pedido do PO, abre a onda e prepara o registro de provedores que o modelo de reserva da SPEC-14 usa.

**Andamento em 26/10/2026.** SPEC-23, SPEC-14 e SPEC-15 implementadas no branch `feat_ondas_1_2`, ainda sem commit, a pedido do usuário. A SPEC-15 seguiu a opção A (matriz fixa somente leitura). O `docker-compose.yml` ganhou Redis e worker; `dev.py` ainda sobe só backend e front. Testes: 984 no backend e 691 no front; build do front verde. O aceite do PO e a confirmação do Redis pelo Arquiteto continuam pendentes; o caminho síncrono segue o padrão.

### SPEC-23 · Outras IAs ligadas pela configuração

Entrou depois das outras, a pedido do PO, por isso o número. Vem antes da SPEC-14, porque o modelo de reserva usa o mesmo registro.

**Objetivo.** Ligar outra IA sem mexer no código de quem a usa. Com a chave de um provedor no .env, ele aparece na Saúde da IA.

**O que muda.**

- Back-end: um registro de provedores. Cada um declara o nome de tela, a variável da chave, a do modelo e as do preço por milhão de tokens. O Gemini é o primeiro, com as variáveis que já existem: GEMINI\_API\_KEY, AI\_MATCH\_GEMINI\_MODEL, AI\_CUSTO\_ENTRADA\_BRL\_POR\_MILHAO e AI\_CUSTO\_SAIDA\_BRL\_POR\_MILHAO.
- Back-end: AI\_PROVEDOR\_PRINCIPAL e AI\_PROVEDOR\_RESERVA, no .env, escolhem quem responde. Os 12 serviços que hoje criam o provedor do Gemini direto passam a pedi-lo ao registro.
- Back-end: os prompts saem do código do Gemini para um módulo comum, com versão, e qualquer provedor usa o mesmo texto (aba Prompts de IA).
- Back-end: o teto mensal da SPEC-04 continua um só e soma todos os provedores. O preço é o de cada provedor.
- API e front-end: a Saúde da IA mostra uma linha por provedor do registro: chave configurada ou não, modelo, papel (principal, reserva ou só configurado) e, no mês, chamadas, falhas, uso do caminho sem IA, custo e tempo de resposta. Os números saem da tabela de execuções de IA, que já guarda o provedor.
- Segurança: a chave nunca sai do servidor. A tela mostra só "configurada" ou "sem chave".
- Fornecedor novo: um adaptador que cumpre a interface que já existe (ProvedorDeIA) e uma linha no registro. A biblioteca do fornecedor é dependência nova e passa pelo portão de decisão.
- LGPD: escolher um provedor novo como principal ou reserva exige antes a revisão de LGPD, porque é mais um destino de dados pessoais (SPEC-21).
- Banco: nada muda. ExecucaoIA.provedor e ExecucaoIA.modelo já existem.
- Testes: um provedor falso no registro. A suíte nunca chama provedor real.

**Respaldo.** Engenharia\_IA pede o provedor de reserva na tabela de falhas e o custo de cada chamada. O AGENTS.md põe provedor de IA e dependência nova no portão de decisão. Entra no backlog como PB93.

**Pronto quando.**

- [ ] Com a chave de um provedor do registro no .env, ele aparece na Saúde da IA quando a API reinicia, sem mudar código.
- [ ] Trocar o provedor principal é uma linha no .env, e a execução de IA registra qual provedor respondeu.
- [ ] Nenhuma tela, resposta da API ou log mostra a chave.
- [ ] A Saúde da IA soma o custo de todos os provedores contra o teto mensal.

### SPEC-14 · Pré-análise em segundo plano e modelo de reserva

**Objetivo.** A pré-análise para de prender a tela e a requisição. Uma falha do modelo principal não deixa o Supervisor sem resposta.

**O que muda.**

- Infraestrutura (IA 11): o Celery está instalado, mas não configurado. Entram a configuração, um Redis gratuito como fila e um processo de worker no deploy.
- API: pedir a pré-análise responde na hora, com a situação "pendente". O worker executa e muda para "executando" e depois "concluída" ou "erro". Essas situações já existem no banco.
- Front-end: a aba mostra "em andamento" e se atualiza sozinha.
- Modelo de reserva (IA 12): a proposta é começar com um segundo modelo do mesmo provedor, escolhido por configuração. Não pede chave nem dependência nova. Um provedor diferente fica para depois, porque pede dependência e chave.
- Testes: fila em modo síncrono. Nenhum Redis remoto.
- O mesmo padrão pode servir depois ao Copiloto e ao matching. Esta spec começa só pela pré-análise.

**Andamento em 26/10/2026.** `PREANALISE_ASSINCRONA=False` é o padrão; ligada, o POST responde 202 e o worker conclui. Broker ausente ou falha ao enfileirar grava `fila_indisponivel` e responde 503. O `docker-compose.yml` sobe Redis e worker; `dev.py` ainda não. Falta a confirmação do Redis pelo Arquiteto e o ensaio do worker no ambiente de deploy.

**Pronto quando.**

- [ ] Pedir a pré-análise devolve a tela na hora, e o resultado aparece sozinho quando fica pronto.
- [ ] Worker parado: a pré-análise termina em "erro" com mensagem clara e botão para tentar de novo.
- [ ] Falha do modelo principal: o de reserva responde, e a execução de IA registra qual foi usado.

### SPEC-15 · Permissões do Administrador

**Objetivo.** Fechar o PB04 ("configurar permissões") sem abrir brecha nas regras que a baseline fixa.

**Opção A, recomendada.** A matriz continua fixa por papel. A tela do Administrador passa a mostrá-la em modo leitura, e o texto do critério do PB04 é ajustado no controle de escopo. Sem migration.

**Opção B.** As permissões viram tabela, com API e tela de edição. Pede migration e uma checagem em toda rota. O risco é um Administrador tirar do Supervisor o poder de decidir, que a RN-A07 garante.

A recomendação é a opção A. Os quatro atores e o que cada um faz são regra da baseline, e não configuração.

**Andamento em 26/10/2026.** Opção A implementada: `/admin/permissoes` mostra a matriz por papel em modo somente leitura, sem migration. O ajuste do texto do PB04 no controle de escopo ainda não foi registrado.

**Pronto quando (opção A).**

- [ ] A tela do Administrador mostra quem pode fazer o quê, por papel.
- [ ] O ajuste do PB04 está registrado no controle de escopo.

## Onda 5 — qualidade, dados e escopo

Três specs que dependem mais de combinar com a AC2 e o orientador do que de código. Podem começar já, em paralelo com as outras ondas.

### SPEC-16 · Medir a pertinência do matching

**Objetivo.** Tornar medida a meta de 80% de pertinência do TAP. Hoje ela não tem como ser conferida.

**O que muda.**

- Com a AC2: uma amostra de 10 a 20 oportunidades, reais e anonimizadas ou realistas, cada uma com os pesquisadores que a AC2 considera pertinentes.
- Pertinência: a parte das sugestões da equipe potencial que a AC2 marca como pertinente. A meta é 80% ou mais.
- Back-end: um comando que roda o matching sobre a amostra e mostra a pertinência por oportunidade e no total. Roda só em ambiente local, com dados fictícios ou anonimizados.
- A mesma amostra serve ao comparativo de modelos (IA 15): dois geradores e dois embeddings sobre os mesmos casos.
- O número é medido antes e depois da SPEC-13 e de toda mudança de peso.

**Pronto quando.**

- [ ] A amostra rotulada pela AC2 está registrada.
- [ ] O comando reproduz o mesmo número em duas execuções.
- [ ] O resultado de antes e de depois da SPEC-13 está na documentação de IA.

### SPEC-17 · Retenção de dados (LGPD)

**Objetivo.** Definir por quanto tempo a trilha e os anexos ficam guardados, e cumprir isso sem trabalho manual.

**O que muda.**

- Proposta de prazos, para o PO e o orientador confirmarem: eventos de conta (entrada e saída) por 12 meses e depois anonimizados; eventos da oportunidade enquanto ela existir, porque sustentam a rastreabilidade; anexos até 24 meses depois do arquivamento.
- Anonimizar quer dizer trocar quem agiu por "pessoa removida", mantendo o tipo do evento e a data.
- Back-end: uma rotina agendada aplica os prazos, tem modo de simulação e registra na trilha o que fez.
- Front-end: o envio de anexo informa o prazo de guarda e os tipos de arquivo aceitos.

**Pronto quando.**

- [ ] A simulação lista o que seria anonimizado ou descartado, sem mudar nada.
- [ ] Um evento vencido perde os dados pessoais e mantém tipo e data.
- [ ] Os prazos aparecem na tela de anexos e no manual.

### SPEC-18 · Product Backlog e registro de escopo

**Objetivo.** O sistema fica igual ao que os documentos descrevem. O que ele tem a mais entra no Product Backlog, e o que mudou entra no controle de escopo, que a Declaração de Escopo exige.

**O que muda.**

- Nova versão do Product Backlog (1.1), com os itens da seção "Itens a mais que entram no Product Backlog": PBs novos do PB79 ao PB93, cada um com épico, prioridade e marcação de MVP definidos pelo PO.
- Os PBs que já existem e estavam fora do MVP (PB28, PB73 a PB75 e PB77) passam a "adiantado".
- A divergência do PB06 entre o Product Backlog e a Especificação de Requisitos é resolvida pelo PO, e o documento errado é corrigido.
- O controle de mudanças registra Aparência, Saúde da IA e Indicadores de IA como mudança de escopo, e os pedidos novos deste plano.
- O `CONTEXT.md` é atualizado no PR de cada spec que muda termo, regra ou situação.

**Pronto quando.**

- [ ] O Product Backlog 1.1 traz todos os itens da tabela, com épico, prioridade e MVP.
- [ ] A marcação do PB06 é a mesma nos dois documentos.
- [ ] Nenhuma tela ou rota do sistema fica sem um PB ou um registro de mudança que a sustente.

## Etapa final — verificação de conformidade

Depois que as 23 specs estiverem no main, o sistema é conferido de novo contra os documentos, do mesmo jeito que o artifact de pendências fez. O resultado vira um artifact novo, com o que foi implementado e o que ainda falta no Product Backlog.

**Quando começa.** Com a última spec aceita pelo PO no main. Spec que o PO não aceitou, ou mandou ajustar, entra no artifact como pendência, com o motivo.

**O que a verificação confere.**

1. As 26 pendências do artifact de pendências: cada uma fechada, com a spec, o PR e o teste que a fecham.
2. As 78 histórias da Especificação de Requisitos, pelo critério de aceite e não pelo título, e o que pedem o TAP, a Declaração de Escopo v1.2, o Diagrama de Classes e Engenharia\_IA.
3. Os itens a mais (E1 a E13) e os pedidos do PO: cada um com o seu PB (PB79 a PB93) ou com registro no controle de mudanças.
4. O que ficou fora da comparação anterior: o tempo de resposta de 3 s e os outros requisitos não funcionais, agora medidos, e o /admin/ restrito à conta técnica (S8), porque o que se edita ali não entra na trilha.
5. Os prompts em uso: o texto do código é o aprovado na aba Prompts de IA, e cada execução registra a versão.
6. As revisões: Segurança e LGPD sem falha alta ou crítica aberta, o teste de conformidade com o Diagrama de Classes passando e o CONTEXT.md atualizado.
7. As suítes inteiras do back-end e do front-end passando.

**O que sai: o artifact "Conformidade do sistema".** Compartilhado com o PO, como o de pendências, em três partes:

- Implementado: uma linha por spec, com o que entrou, o PR, o documento que a sustenta e o teste que prova.
- O que falta no backlog nas funcionalidades novas: os PB79 a PB93 e os PBs adiantados (PB28, PB73 a PB75 e PB77), cada um com a situação (feito, em parte ou não feito), a prioridade e o MVP definidos pelo PO.
- Divergências que sobraram: o que o sistema ainda não faz, ou faz diferente dos documentos, e quem decide.

**Quem faz.** O QA conduz, com Segurança, LGPD e DBA. O PO aceita o resultado.

**Regra.** A verificação não cria funcionalidade. O que ela achar vira pendência no artifact ou item no Product Backlog, e só vira código com uma spec nova aceita pelo PO.

**Pronto quando.**

- [ ] O artifact de conformidade está publicado, e o link está neste plano.
- [ ] Toda pendência, história e item a mais tem destino: feito, PB ou registro de mudança.
- [ ] O PO marcou o resultado como aceito.

## Valores que o PO confirma

O PO liberou as pendências. Nos 31 pontos abaixo, a equipe escolheu um caminho. O PO marca "Aceita" ou "Ajustar" em cada linha, e a spec só começa com a linha dela aceita.

| Ponto | Proposta da equipe | Spec | Decisão do PO |
| --- | --- | --- | --- |
| "Nome" no cadastro do Demandante | Nome da empresa | SPEC-01 | Aceita |
| Preço por milhão de tokens | Preço público do modelo em uso, no câmbio do dia | SPEC-04 | Aceita |
| Limite de gasto por oportunidade | R$ 5 (um décimo do teto mensal de R$ 50) | SPEC-04 | Aceita |
| Mapa dos 23 critérios nas 6 dimensões | O mapa montado pela equipe, como está | SPEC-06 | Aceita |
| Prompt de sistema da baseline | O arquivo IA/Prompt\_Gemini\_PIPE\_Jornada\_Fase1\_v2.txt em toda chamada; cada tarefa manda o formato de saída do sistema | SPEC-05 a SPEC-08 | Aceita |
| Onde fica o critério da lacuna | Coluna própria na Lacuna, ligada ao critério da versão usada | SPEC-06 | Aceita |
| De onde vêm as perguntas do Copiloto | Banco PIPE para elemento vazio; IA só para elemento fraco | SPEC-07 | Aceita |
| Resposta sobre elemento já preenchido | Vira sugestão para o Supervisor aceitar ou recusar | SPEC-07 | Aceita |
| Onde fica a síntese da entrada | Na sessão do Copiloto | SPEC-07 | Aceita |
| Pesos e nota mínima do matching | 0,45 / 0,20 / 0,25 / 0,10 e 0,26, como estão | SPEC-08 | Aceita |
| Limite de raciocínio do Gemini | Trocar a google-generativeai pela google-genai (dependência nova) | SPEC-08 | Aceita |
| Proposta não revisada | Bloqueia Competências, Equipe e Pré-análise | SPEC-09 | Pendente |
| Pré-análise sem equipe | Recusada | SPEC-09 | Pendente |
| Para onde volta uma oportunidade em Revisar | Em estruturação | SPEC-09 | Pendente |
| Valores e dono da prioridade | Alta, Média e Baixa, pelo Supervisor; nasce Média | SPEC-10 | Pendente |
| Quem vê a fila | Todo Supervisor vê a fila inteira | SPEC-10 | Pendente |
| O que é inativar um membro | Sai do matching e perde o login; histórico fica | SPEC-11 | Pendente |
| Campos que o Pesquisador edita | Os do RF03; nome, e-mail, papel e instituição ficam com o Supervisor | SPEC-11 | Pendente |
| Avisos que também saem por e-mail | Revisar, Continuar e Arquivar | SPEC-12 | Pendente |
| Onde roda o embedding | Modelo MiniLM local, no servidor da API | SPEC-13 | Aceita |
| Fila de tarefas | Celery com um Redis gratuito | SPEC-14 | Implementado; aceite pendente |
| Modelo de reserva | Segundo modelo do mesmo provedor | SPEC-14 | Implementado; aceite pendente |
| Como ligar outra IA | Registro de provedores; principal e reserva escolhidos no .env | SPEC-23 | Implementado; aceite pendente |
| Permissões | Opção A: matriz fixa, mostrada ao Administrador | SPEC-15 | Implementado; aceite pendente |
| Prazos de guarda | Conta: 12 meses. Anexos: 24 meses depois do arquivamento | SPEC-17 | Pendente |
| Vocabulário de competências | Híbrido: texto livre com lista de sinônimos | SPEC-13 | Aceita |
| Como apresentar com o Neon | Ambiente de homologação com DEBUG desligado | SPEC-20 | Aceita |
| Plano da conta do Gemini | Camada paga antes de entrar dado real | SPEC-21 | Aceita |
| Encarregado de dados (LGPD) | Indicado pela AC2, que é a controladora dos dados | SPEC-21 | Aceita |
| MVP do PB06 | Sim, como no Product Backlog; corrigir a Especificação | SPEC-18 | Pendente |
| Prioridade dos PB79 a PB93 | Should Have e fora do MVP, menos PB88, PB89 e PB91, que entram no MVP | SPEC-18 | Pendente |

A amostra de validação do matching (SPEC-16) não é escolha: precisa ser montada com a AC2.

## Rastreabilidade: pendências aceitas → specs

As 26 pendências do [artifact de pendências](https://claude.ai/artifact/T2SLWhGRRwqfDCzsSonFmd) têm spec, e nenhuma spec contraria o que ele pede. Em quatro casos o artifact deixou duas opções: o plano propõe uma, e vale a linha aceita na tabela de valores.

| Pendência | O que o artifact pede | Spec | Como o plano cumpre |
| --- | --- | --- | --- |
| IA 13 | Preço por milhão de tokens e limite por oportunidade | SPEC-04 | Valores na tabela de valores |
| IA 15 | Comparativo de 2 geradores e 2 embeddings em 10 a 20 casos rotulados | SPEC-16 | Mesma amostra da meta de 80% |
| P5 | Amostra de validação da meta de 80%, com a AC2 | SPEC-16 | Comando que mede a pertinência |
| IA 14 | Tirar nomes do prompt da pré-análise e do rerank | SPEC-05 | Apelidos no lugar dos nomes |
| IA 8 | Novo prompt com os critérios PIPE e ratificar o mapa 23 × 6 | SPEC-06 | Mapa na tabela de valores |
| IA 6 | Prompt devolve o par lacuna e recomendação, sem migration | SPEC-06 | Usa o campo que já existe |
| IA 2 | Decidir de onde vêm as perguntas e o que a resposta faz | SPEC-07 | Escolha na tabela de valores |
| IA 3 | Prompt que avalia a qualidade de cada elemento | SPEC-07 | Ausente, inconsistente ou pouco desenvolvido |
| IA 1 | Prompt da síntese e campo novo (migration) | SPEC-07 | Lugar do campo na tabela de valores e revisão do DBA |
| Passo 6 | Limitar o raciocínio e pedir só os elementos vazios | SPEC-08 | Medido antes e depois |
| P24 | Ratificar pesos, nota mínima e prompts | SPEC-08 | Depois das SPEC-05 a SPEC-07 |
| IA 4 | Manter o aviso ou bloquear sem revisão | SPEC-09 | Escolha: o plano propõe bloquear |
| IA 5 | Manter o aviso ou recusar pré-análise sem equipe | SPEC-09 | Escolha: o plano propõe recusar |
| P13 | Transições, quem dispara e a volta do Revisar | SPEC-09 | Serviço único de transição |
| P4 | Quem dá a prioridade e com que valores (migration) | SPEC-10 | Revisão do DBA |
| P15 | Confirmar quem vê a fila | SPEC-10 | Mantém como está |
| P3 | Definir o que é inativar | SPEC-11 | Sai do matching e perde o login |
| P10 | Listar os campos do próprio perfil | SPEC-11 | Os campos do RF03 |
| P17 | Quais avisos também saem por e-mail | SPEC-12 | Revisar, Continuar e Arquivar |
| IA 9 | Embedding no servidor e vetores da rede, ligado ao vocabulário de competências (P11) | SPEC-13 | Adiantada para a onda 1, no banco local e no Neon |
| P2 | O matching passa a ler a formação | SPEC-13 | Formação no texto que vira vetor |
| IA 11 | Redis para a fila | SPEC-14 | Celery com Redis gratuito |
| IA 12 | Escolher o provedor ou modelo de reserva | SPEC-14 | Segundo modelo do mesmo provedor |
| P1 | Matriz fixa ou tabela de permissões | SPEC-15 | Escolha: o plano propõe matriz fixa |
| P9 | Prazo e anonimização da trilha | SPEC-17 | Prazos na tabela de valores |
| P14 | Prazo dos anexos e tipos aceitos | SPEC-17 | Com a correção S3 da SPEC-20 |

Uma divergência entre os próprios documentos precisa do PO: o PB06 (ativar e desativar contas) está marcado "MVP: Sim" no Product Backlog e "MVP: Não" na Especificação de Requisitos. O artifact de pendências seguiu a Especificação.

## Itens a mais que entram no Product Backlog

Tudo o que o sistema faz sem um PB que peça entra no Product Backlog 1.1 como item novo, a partir do PB79. O que já é PB, mas estava fora do MVP, só muda a marcação para "adiantado". Prioridade e MVP de cada item novo são do PO.

| No sistema | Respaldo hoje | Entra no backlog como | Épico |
| --- | --- | --- | --- |
| Aparência: cores e tema, com prévia (E1) | Nenhum documento | PB79 Aparência da plataforma | EP08 |
| Console de Saúde da IA (E2) | Engenharia\_IA pede o custo, não a tela | PB80 Saúde e custo da IA | EP08 |
| Indicadores de IA (E3) | Não pedido | PB81 Indicadores de IA | EP08 |
| Indicadores de oportunidades, matching e maturidade (E4) | PB73 a PB75, fora do MVP | Marcação "adiantado" | EP08 |
| Relatório de equipe potencial (E5) | PB77, fora do MVP | Marcação "adiantado" | EP08 |
| Filtros da fila por situação, origem e data | PB28, fora do MVP | Marcação "adiantado" | EP03 |
| Ativar e desativar contas (E6) | PB06, com MVP divergente entre documentos | Corrigir a marcação no documento que estiver errado | EP01 |
| Reenviar convite de primeiro acesso (E6) | Não pedido | PB82 Reenvio de convite | EP01 |
| Auditoria da plataforma inteira (E7) | PB69 e PB70 pedem só a da oportunidade | PB83 Auditoria da plataforma | EP08 |
| Sessão do Copiloto com rodadas (E8) | Leitura nossa do RF04 | PB84 Sessão do Copiloto | EP04 |
| Recomendação marcada como acatada (E9) | Não pedido | PB85 Recomendação acatada | EP06 |
| Competência digitada à mão (E10) | PB42 pede derivação pelo sistema | PB86 Competência manual | EP05 |
| Justificativa obrigatória na decisão (E11) | A baseline pede rastreabilidade | PB87 Justificativa da decisão | EP07 |
| CNPJ e razão social do Demandante (E12) | Diagrama de classes (DemandanteExterno) | PB88 Cadastro do Demandante com CNPJ | EP01 |
| Telefone no Meu Perfil do Demandante | Diagrama de classes (DemandanteExterno) | PB89 Telefone do Demandante | EP01 |
| Troca de senha e contatos de suporte (E13) | PB03 pede só a recuperação | PB90 Troca de senha e suporte | EP01 |
| Privacidade e direitos do titular (SPEC-21) | TAP e Escopo: "conforme LGPD" | PB91 Privacidade e direitos do titular | EP01 |
| Linguagem clara, resumo e layout dos relatórios (SPEC-02, SPEC-03, SPEC-19) | Não pedido | PB92 Clareza das telas e relatórios | EP08 |
| Outras IAs pela configuração (SPEC-23) | Engenharia\_IA pede um provedor de reserva, não vários | PB93 Provedores de IA configuráveis | EP08 |

CNPJ e telefone têm respaldo no diagrama de classes, mas nenhum PB os pede. Por isso também entram no backlog.

## Riscos e como contornar

O maior risco é de prazo, não técnico. A validação com a AC2 começa em novembro, e as ondas 1 e 2 são as que ela vai perceber.

| Risco | Onde | Como contornar |
| --- | --- | --- |
| Não caber tudo antes dos testes de aceitação (nov–dez/2026) | Pacote inteiro | Ondas 1 e 2 primeiro. A onda 4 pode sair em parte, porque cada spec dela tem caminho de reserva |
| Resumir demais e esconder o que o Supervisor precisa | SPEC-03 | Regra de que nada some, testada; teste de leitura antes e depois |
| Bloqueios novos travarem oportunidades que já estão no meio do fluxo | SPEC-09 | Conferir os dados do ambiente antes do deploy e ajustar a situação das que ficariam fora da regra |
| Prompt novo piorar a resposta da IA | SPEC-05 a SPEC-07 | Comparar na amostra da SPEC-16; a versão do prompt fica registrada e dá para voltar |
| Modelo de embedding não caber na memória da hospedagem | SPEC-13 | O cálculo atual, sem a parcela, continua como reserva; modelo menor como segunda opção |
| Redis gratuito com limite de uso ou fora do ar | SPEC-14 | A pré-análise termina em "erro" com "tentar de novo"; execução direta como reserva, ligada por configuração |
| A AC2 demorar a montar a amostra | SPEC-16 | Pedir já, na próxima reunião; sem ela, a meta de 80% chega à entrega sem prova |
| A AC2 começar a usar dados reais antes das correções críticas | SPEC-20 e SPEC-21 | Nenhum dado real entra antes do fim da onda 1. Até lá, só dados fictícios |
| Tomar o plano como garantia jurídica | SPEC-21 | Alguém da área jurídica revisa o aviso de privacidade antes de abrir para a AC2 |
| Migration aplicada no Neon sem ensaio | SPEC-13 e SPEC-22 | Backup e ensaio num restore local antes de cada escrita no Neon, como manda a regra 7 |
| Prompt de sistema da baseline deixar a IA mais lenta e mais cara | SPEC-05 a SPEC-08 | Medir tempo e custo antes e depois na SPEC-08; o teto da SPEC-04 segura o gasto |
| Provedor novo receber dado real sem revisão de LGPD | SPEC-23 | Provedor novo só vira principal ou reserva depois da revisão de LGPD e da entrada no inventário |
