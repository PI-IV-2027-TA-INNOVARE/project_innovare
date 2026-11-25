import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaCopiloto from './AbaCopiloto'
import { ROLES } from '../../../../lib/roles'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterEstadoCopiloto: null,
  iniciarSessaoCopiloto: null,
  responderCopiloto: null,
  estruturarComCopiloto: null,
  concluirSessaoCopiloto: null,
  atualizarSinteseCopiloto: null,
  aceitarSugestaoCopiloto: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterEstadoCopiloto: (...args) => api.obterEstadoCopiloto(...args),
  iniciarSessaoCopiloto: (...args) => api.iniciarSessaoCopiloto(...args),
  responderCopiloto: (...args) => api.responderCopiloto(...args),
  estruturarComCopiloto: (...args) => api.estruturarComCopiloto(...args),
  concluirSessaoCopiloto: (...args) => api.concluirSessaoCopiloto(...args),
  atualizarSinteseCopiloto: (...args) => api.atualizarSinteseCopiloto(...args),
  aceitarSugestaoCopiloto: (...args) => api.aceitarSugestaoCopiloto(...args),
}))

const SEM_SESSAO = {
  sessao: null,
  mensagens: [],
  perguntas: [
    {
      id: 'Q001',
      elemento: 'problema_pesquisa',
      pergunta: 'Qual problema real você quer resolver?',
      motivo: 'Define a dor central.',
      campo: 'problema_mercado',
      origem: 'base_pipe',
    },
  ],
  lacunas: [],
  elementos_vazios: [
    'problema_pesquisa',
    'hipotese',
    'objetivo_geral',
    'objetivos_especificos',
    'metodologia',
    'resultados_esperados',
    'caracterizacao_inovacao',
    'infraestrutura_recursos',
  ],
  proposta_iniciada: false,
  base_disponivel: true,
  baseline_id: 'PIPE_JT_F1_2026_R1_V2',
}

const COM_SESSAO = {
  ...SEM_SESSAO,
  sessao: {
    id_sessao: 'abc',
    estado: 'aberta',
    estado_rotulo: 'Aberta',
    sintese: 'Problema: lotes perdidos por contaminação.\nContexto: linha de envase.',
    sintese_conferida: true,
  },
  mensagens: [
    {
      id_mensagem: 1,
      autor: 'copiloto',
      autor_rotulo: 'Copiloto',
      conteudo: 'Sessão aberta. Elementos sem conteúdo: 8 de 8.',
    },
  ],
  proposta_iniciada: true,
  elementos_vazios: ['metodologia'],
  lacunas: [
    {
      id_lacuna: 7,
      campo_afetado: 'metodologia',
      natureza: 'ausente',
      natureza_rotulo: 'Ausente',
      descricao: 'A proposta não descreve a metodologia.',
      recomendacao: 'Como o método será validado?',
      severidade: 'alta',
      severidade_rotulo: 'Alta',
    },
  ],
}

const PRONTA_PARA_ESTRUTURAR = { ...SEM_SESSAO, sessao: COM_SESSAO.sessao }

async function abrirElementoDa(texto) {
  const elemento = (await screen.findByText(texto)).closest('details')
  if (!elemento.open) await userEvent.click(elemento.querySelector('summary'))
  return elemento
}

const OUTRA_INFORMACAO = /mais alguma coisa que o copiloto deve saber/i

async function escreverOutraInformacao(texto) {
  const abrir = await screen.findByRole('button', { name: /adicionar outra informação/i })
  await userEvent.click(abrir)
  const campo = screen.getByLabelText(OUTRA_INFORMACAO)
  await userEvent.type(campo, texto)
  return campo
}

const SINTESE_COM_FALTAS = [
  'Problema: Estender a validade sem mudar a fórmula.',
  'Contexto: A validade atual foi definida sem estudo formal.',
  'O que falta:',
  '- Qual o produto?',
  '- Qual o prazo de validade atual?',
].join('\n')

const COMPLETA_COM_PONTO = {
  ...COM_SESSAO,
  elementos_vazios: [],
  perguntas: [
    {
      id: 'lacuna-9',
      elemento: 'metodologia',
      pergunta: 'Quais controles serão usados?',
      motivo: 'O texto não diz como validar.',
      campo: '',
      origem: 'copiloto',
    },
  ],
  lacunas: [
    {
      id_lacuna: 9,
      campo_afetado: 'metodologia',
      natureza: 'pouco_desenvolvido',
      natureza_rotulo: 'Pouco desenvolvido',
      descricao: 'Faltam os controles.',
      recomendacao: 'Descreva o controle positivo e o negativo.',
      severidade: 'media',
      severidade_rotulo: 'Média',
    },
  ],
}

describe('AbaCopiloto', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(SEM_SESSAO)
    api.iniciarSessaoCopiloto = vi.fn().mockResolvedValue({})
    api.responderCopiloto = vi.fn().mockResolvedValue({})
    api.estruturarComCopiloto = vi
      .fn()
      .mockResolvedValue({ preenchidos: ['metodologia'], fallback_usado: false })
    api.concluirSessaoCopiloto = vi.fn().mockResolvedValue({})
    api.atualizarSinteseCopiloto = vi.fn().mockResolvedValue({})
    api.aceitarSugestaoCopiloto = vi.fn().mockResolvedValue({})
  })

  it('mostra a contagem de elementos e as perguntas da baseline', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(
      await screen.findByText(/0 de 8 elementos preenchidos/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Qual problema real você quer resolver?'),
    ).toBeInTheDocument()
  })

  it('avisa que a saída precisa de revisão humana', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(
      await screen.findByText(/precisa de revisão humana/i),
    ).toBeInTheDocument()
  })

  it('não inventa pergunta quando a base não está disponível', async () => {
    api.obterEstadoCopiloto = vi
      .fn()
      .mockResolvedValue({ ...SEM_SESSAO, base_disponivel: false, perguntas: [] })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(
      await screen.findByText(/perguntas orientadoras não estão disponíveis/i),
    ).toBeInTheDocument()
  })

  /**
   * Responder antes de conferir o resumo gravava as respostas, mas "Enviar e
   * atualizar a proposta" não atualizava nada: parava num aviso pedindo o
   * resumo. Agora as perguntas aparecem para leitura e os campos só abrem
   * depois do resumo conferido.
   */
  it('sem o resumo conferido, as perguntas aparecem e os campos esperam', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const elemento = await abrirElementoDa('Qual problema real você quer resolver?')

    expect(within(elemento).getByLabelText('Qual problema real você quer resolver?')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /adicionar outra informação/i })).toBeNull()
    expect(screen.getByText(/para responder, confira antes o resumo da entrada/i)).toBeInTheDocument()
    expect(screen.getByText('Primeiro confira o resumo da entrada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enviar|estruturar/i })).toBeNull()
  })

  it('não reabre a conversa que já está em andamento', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await escreverOutraInformacao('Mais contexto.')
    await userEvent.click(screen.getByRole('button', { name: /enviar a resposta e estruturar/i }))

    await waitFor(() => expect(api.responderCopiloto).toHaveBeenCalled())
    expect(api.iniciarSessaoCopiloto).not.toHaveBeenCalled()
  })

  it('explica que o limite de gasto barrou a chamada', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    api.estruturarComCopiloto = vi.fn().mockResolvedValue({
      preenchidos: [],
      fallback_usado: true,
      motivo_fallback: 'limite_da_oportunidade',
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )

    expect(
      await screen.findByText(/o copiloto não foi chamado: esta oportunidade atingiu o limite de gasto com ia/i),
    ).toBeInTheDocument()
  })

  /**
   * A rodada leva de 10 a 30 segundos no Gemini. Antes, só o rótulo do botão
   * mudava; agora a aba diz quanto costuma demorar, conta o tempo e avisa a
   * página para travar a troca de etapa.
   */
  it('mostra a espera enquanto o Copiloto trabalha e trava a troca de etapa', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    let liberar
    api.estruturarComCopiloto = vi.fn(
      () => new Promise((resolve) => {
        liberar = resolve
      }),
    )
    const aoOcupar = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" aoOcupar={aoOcupar} />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )

    expect(await screen.findByText(/10 a 30 segundos/i)).toBeInTheDocument()
    expect(aoOcupar).toHaveBeenLastCalledWith(true)

    liberar({ preenchidos: ['metodologia'], fallback_usado: false })

    await waitFor(() => expect(aoOcupar).toHaveBeenLastCalledWith(false))
    expect(screen.queryByText(/10 a 30 segundos/i)).not.toBeInTheDocument()
  })

  /**
   * O resultado ia num toast de 2,6 s que, além disso, sumia quando a página
   * recarregava a oportunidade. Agora fica na aba, com o caminho da revisão.
   */
  it('diz o que foi preenchido e leva à revisão da proposta', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    const irPara = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={irPara} />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )

    expect(await screen.findByText(/o copiloto preencheu metodologia/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /revisar a proposta/i }))
    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('a resposta atualiza a proposta na mesma hora', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await escreverOutraInformacao('A perda média é de 4% do lote.')
    await userEvent.click(screen.getByRole('button', { name: /enviar a resposta e estruturar/i }))

    await waitFor(() => expect(api.estruturarComCopiloto).toHaveBeenCalledWith('OP-2026-001'))
    expect(await screen.findByText(/o copiloto preencheu metodologia/i)).toBeInTheDocument()
  })

  it('responde a pergunta no próprio elemento, com o elemento e a pergunta', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const elemento = await abrirElementoDa('Qual problema real você quer resolver?')
    const campo = within(elemento).getByLabelText('Qual problema real você quer resolver?')

    await userEvent.type(campo, 'Perda de lotes de suco.')
    await userEvent.click(screen.getByRole('button', { name: /enviar a resposta e estruturar/i }))

    await waitFor(() =>
      expect(api.responderCopiloto).toHaveBeenCalledWith('OP-2026-001', 'Perda de lotes de suco.', {
        elemento: 'problema_pesquisa',
        pergunta: 'Qual problema real você quer resolver?',
      }),
    )
  })

  /**
   * A caixa de resposta era uma só, no fim da página: respondia-se uma
   * pergunta por vez, e cada envio rodava o Copiloto de novo, de 10 a 30
   * segundos com as etapas travadas. Agora cada pergunta tem o seu campo,
   * nenhuma é obrigatória, e o envio leva todas juntas a uma rodada só.
   */
  it('responde várias perguntas e o Copiloto atualiza a proposta uma vez só', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      perguntas: [
        ...SEM_SESSAO.perguntas,
        {
          id: 'Q020',
          elemento: 'metodologia',
          pergunta: 'Que controles o método terá?',
          motivo: '',
          campo: 'metodo',
          origem: 'base_pipe',
        },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    for (const [texto, resposta] of [
      ['Qual problema real você quer resolver?', 'Perda de lotes.'],
      ['Que controles o método terá?', 'Com controle positivo.'],
    ]) {
      const elemento = await abrirElementoDa(texto)
      await userEvent.type(within(elemento).getByLabelText(texto), resposta)
    }

    expect(screen.getByText('2 respostas prontas para enviar.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /enviar as 2 respostas e estruturar/i }))

    await waitFor(() => expect(api.estruturarComCopiloto).toHaveBeenCalledTimes(1))
    expect(api.responderCopiloto).toHaveBeenCalledTimes(2)
    expect(api.responderCopiloto).toHaveBeenCalledWith('OP-2026-001', 'Perda de lotes.', {
      elemento: 'problema_pesquisa',
      pergunta: 'Qual problema real você quer resolver?',
    })
    expect(api.responderCopiloto).toHaveBeenCalledWith('OP-2026-001', 'Com controle positivo.', {
      elemento: 'metodologia',
      pergunta: 'Que controles o método terá?',
    })
  })

  /**
   * Eram dois botões para a mesma rodada: "Estruturar" no topo, para quem não
   * respondia, e "Enviar e atualizar a proposta" no fim, desativado até
   * alguém escrever. Agora é um botão só, na barra do fim, que estrutura com
   * ou sem resposta e diz qual dos dois vai fazer.
   */
  it('sem resposta escrita, o mesmo botão estrutura e diz com o que', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/nenhuma é obrigatória/i)).toBeInTheDocument()
    expect(
      screen.getByText('Nenhuma resposta escrita: o Copiloto usa a descrição e o resumo.'),
    ).toBeInTheDocument()

    const barra = screen.getByRole('group', { name: 'Ações da etapa' })
    const estruturar = within(barra).getByRole('button', { name: /estruturar com o copiloto/i })

    expect(estruturar).not.toHaveClass('admin-btn--outline')
    expect(screen.getAllByRole('button', { name: /estruturar/i })).toHaveLength(1)

    await userEvent.click(estruturar)

    await waitFor(() => expect(api.estruturarComCopiloto).toHaveBeenCalledWith('OP-2026-001'))
    expect(api.responderCopiloto).not.toHaveBeenCalled()
  })

  it('apagar o texto tira a resposta do envio', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const elemento = await abrirElementoDa('Qual problema real você quer resolver?')
    const campo = within(elemento).getByLabelText('Qual problema real você quer resolver?')

    await userEvent.type(campo, 'Rascunho.')
    expect(screen.getByText('1 resposta pronta para enviar.')).toBeInTheDocument()
    expect(within(elemento).getByText(/1 resposta pronta/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar a resposta e estruturar/i })).toBeEnabled()

    await userEvent.clear(campo)

    expect(
      screen.getByText('Nenhuma resposta escrita: o Copiloto usa a descrição e o resumo.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /enviar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /estruturar o que falta/i })).toBeEnabled()
    expect(api.responderCopiloto).not.toHaveBeenCalled()
  })

  it('se uma resposta falha, a que não foi enviada continua no campo', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)
    api.responderCopiloto = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Falha de rede.'))

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const elemento = await abrirElementoDa('Qual problema real você quer resolver?')
    const campo = within(elemento).getByLabelText('Qual problema real você quer resolver?')

    await userEvent.type(campo, 'Perda de lotes.')
    await escreverOutraInformacao('O lote tem 2 t.')
    await userEvent.click(screen.getByRole('button', { name: /enviar as 2 respostas e estruturar/i }))

    expect(await screen.findByText(/1 de 2 respostas registradas/i)).toBeInTheDocument()
    expect(screen.getByLabelText(OUTRA_INFORMACAO)).toHaveValue('O lote tem 2 t.')
    expect(campo).toHaveValue('')
    expect(api.estruturarComCopiloto).not.toHaveBeenCalled()
  })

  it('avisa a página enquanto houver resposta escrita e não enviada', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)
    const aoAlterar = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" aoAlterar={aoAlterar} />)

    await escreverOutraInformacao('Mais contexto.')

    expect(aoAlterar).toHaveBeenLastCalledWith(true)

    await userEvent.clear(screen.getByLabelText(OUTRA_INFORMACAO))

    expect(aoAlterar).toHaveBeenLastCalledWith(false)
  })

  it('mostra o resumo da entrada e deixa o Supervisor corrigir', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/lotes perdidos por contaminação/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /corrigir o resumo/i }))
    const campo = screen.getByLabelText(/resumo da entrada/i)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Problema: perda de 4% dos lotes.')
    await userEvent.click(screen.getByRole('button', { name: /salvar o resumo/i }))

    await waitFor(() =>
      expect(api.atualizarSinteseCopiloto).toHaveBeenCalledWith(
        'OP-2026-001',
        'Problema: perda de 4% dos lotes.',
      ),
    )
  })

  /**
   * PB87: a estruturação parte do resumo validado. O botão cheio do topo era
   * "Estruturar com o Copiloto", desativado até o resumo ser conferido, com o
   * motivo só no `title`, que não aparece no celular. O que destravava a
   * tela, "Ler a entrada", era um botão de contorno mais abaixo. Agora a
   * única ação principal é a que a pessoa precisa fazer.
   */
  it('sem conversa, a ação principal é ler a entrada', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const ler = await screen.findByRole('button', { name: /ler a entrada/i })

    expect(ler).not.toHaveClass('admin-btn--outline')
    expect(screen.queryByRole('button', { name: /estruturar/i })).toBeNull()
    for (const botao of screen.getAllByRole('button')) {
      expect(botao).not.toHaveAttribute('title')
    }
  })

  it('com o resumo ainda não conferido, oferece usar o resumo e só então estrutura', async () => {
    const naoConferida = { ...COM_SESSAO, sessao: { ...COM_SESSAO.sessao, sintese_conferida: false } }
    api.obterEstadoCopiloto = vi
      .fn()
      .mockResolvedValueOnce(naoConferida)
      .mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/confira antes de seguir/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /estruturar o que falta/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /usar este resumo/i }))

    await waitFor(() =>
      expect(api.atualizarSinteseCopiloto).toHaveBeenCalledWith(
        'OP-2026-001',
        COM_SESSAO.sessao.sintese,
      ),
    )
    expect(await screen.findByRole('button', { name: /estruturar o que falta/i })).toBeEnabled()
  })

  /**
   * Sem IA, a conversa abre com o resumo vazio. O botão dizia "Corrigir o
   * resumo" e era de contorno, embora fosse a única coisa a fazer.
   */
  it('sem resumo escrito, a ação principal é escrever o resumo', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      sessao: { ...COM_SESSAO.sessao, sintese: '', sintese_conferida: false },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const escrever = await screen.findByRole('button', { name: /escrever o resumo/i })

    expect(escrever).not.toHaveClass('admin-btn--outline')
    expect(screen.queryByRole('button', { name: /corrigir o resumo/i })).toBeNull()
  })

  /**
   * A lista "como usar" tinha três passos e não dizia em qual a pessoa
   * estava, dentro de uma tela que já mostra sete etapas.
   */
  it.each([
    ['sem conversa', SEM_SESSAO, 0],
    ['com o resumo conferido', PRONTA_PARA_ESTRUTURAR, 1],
    ['com algo já escrito', COM_SESSAO, 2],
  ])('os passos marcam o feito e o atual: %s', async (_, estado, atual) => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(estado)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const passos = await screen.findByRole('list', { name: /como usar o copiloto/i })
    const itens = within(passos).getAllByRole('listitem')

    expect(itens).toHaveLength(3)
    itens.forEach((item, indice) => {
      if (indice === atual) expect(item).toHaveAttribute('aria-current', 'step')
      else expect(item).not.toHaveAttribute('aria-current')

      if (indice < atual) expect(item).toHaveTextContent(/feito/i)
      else expect(item).not.toHaveTextContent(/feito/i)
    })
  })

  /**
   * Os oito elementos vinham fechados, todos com "Ainda não há texto na
   * proposta", que o título "Falta escrever" já dizia, e as perguntas ficavam
   * a oito cliques. Agora o primeiro elemento com pergunta já vem aberto.
   */
  it('com o resumo conferido, o primeiro elemento com pergunta já vem aberto', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const primeiro = (await screen.findByText('Qual problema real você quer resolver?')).closest('details')
    const abertos = document.querySelectorAll('.copiloto__elementos details[open]')

    expect(primeiro).toHaveAttribute('open')
    expect(abertos).toHaveLength(1)
    expect(screen.queryByText(/ainda não há texto na proposta/i)).toBeNull()
  })

  it('sem o resumo conferido, nenhum elemento abre sozinho', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await screen.findByText('Qual problema real você quer resolver?')

    expect(document.querySelectorAll('.copiloto__elementos details[open]')).toHaveLength(0)
  })

  /**
   * O resumo vinha como texto corrido, com "Problema:" e "- " digitados, e
   * "Usar este resumo" morava numa faixa amarela de alerta, longe de
   * "Corrigir". Conferir é passo normal: os campos têm rótulo e as duas ações
   * ficam juntas, depois do texto.
   */
  it('o resumo a conferir mostra os campos com rótulo e as duas ações juntas', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...PRONTA_PARA_ESTRUTURAR,
      sessao: { ...COM_SESSAO.sessao, sintese: SINTESE_COM_FALTAS, sintese_conferida: false },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const usar = await screen.findByRole('button', { name: /está certo, usar este resumo/i })
    const resumo = usar.closest('.copiloto__resumo')
    const campos = within(resumo).getAllByRole('term').map((termo) => termo.textContent)

    expect(campos).toEqual(['Problema', 'Contexto', 'O que falta'])
    expect(within(resumo).getByText('Estender a validade sem mudar a fórmula.')).toBeInTheDocument()
    expect(within(resumo).getByText(/2 perguntas, logo abaixo em sobre a entrada/i)).toBeInTheDocument()
    expect(within(resumo).queryByText(/^Problema:/)).toBeNull()
    expect(usar.closest('.admin-callout')).toBeNull()
    expect(usar.parentElement).toContainElement(
      within(resumo).getByRole('button', { name: /corrigir o resumo/i }),
    )
  })

  /**
   * As perguntas mais úteis, as que o Copiloto não achou na entrada (qual o
   * produto, qual o prazo atual), ficavam só no texto do resumo, sem campo.
   * Agora são as primeiras perguntas, e a resposta leva a pergunta junto.
   */
  it('responde as perguntas do que falta na entrada, com a pergunta junto', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...PRONTA_PARA_ESTRUTURAR,
      sessao: { ...COM_SESSAO.sessao, sintese: SINTESE_COM_FALTAS },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const entrada = await screen.findByRole('list', { name: 'Sobre a entrada' })
    await userEvent.type(within(entrada).getByLabelText('Qual o prazo de validade atual?'), '45 dias.')
    await userEvent.click(screen.getByRole('button', { name: /enviar a resposta e estruturar/i }))

    await waitFor(() =>
      expect(api.responderCopiloto).toHaveBeenCalledWith(
        'OP-2026-001',
        '[Entrada] Qual o prazo de validade atual?\nResposta: 45 dias.',
        {},
      ),
    )
    expect(document.querySelectorAll('.copiloto__elementos details[open]')).toHaveLength(0)
  })

  it('a pergunta da entrada já respondida mostra a resposta, sem campo', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...PRONTA_PARA_ESTRUTURAR,
      sessao: { ...COM_SESSAO.sessao, sintese: SINTESE_COM_FALTAS },
      mensagens: [
        {
          id_mensagem: 2,
          autor: 'humano',
          autor_rotulo: 'Humano',
          conteudo: '[Entrada] Qual o produto?\nResposta: Iogurte natural.',
        },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const entrada = await screen.findByRole('list', { name: 'Sobre a entrada' })
    const respondida = within(entrada).getByText('Qual o produto?').closest('li')

    expect(respondida).toHaveTextContent('Respondida: Iogurte natural.')
    expect(within(respondida).queryByRole('textbox')).toBeNull()
    expect(within(entrada).getByLabelText('Qual o prazo de validade atual?')).toBeEnabled()
  })

  /**
   * "Encerrar conversa" voltava a aba ao começo sem avisar: o resumo
   * conferido e as respostas enviadas deixavam de valer, e a mensagem dizia
   * só que a proposta continuava editável. O uso real é pedir ao Copiloto que
   * leia a entrada outra vez, e agora o botão diz isso e pede confirmação.
   */
  it('ler a entrada de novo pede confirmação e abre uma conversa nova', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(await screen.findByRole('button', { name: /ler a entrada de novo/i }))

    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/as respostas já enviadas deixam de ser usadas/i))
    await waitFor(() => expect(api.iniciarSessaoCopiloto).toHaveBeenCalledWith('OP-2026-001'))
    expect(api.concluirSessaoCopiloto.mock.invocationCallOrder[0]).toBeLessThan(
      api.iniciarSessaoCopiloto.mock.invocationCallOrder[0],
    )
    expect(screen.queryByRole('button', { name: /encerrar conversa/i })).toBeNull()
    confirmar.mockRestore()
  })

  it('sem confirmar, a conversa continua como está', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(await screen.findByRole('button', { name: /ler a entrada de novo/i }))

    expect(api.concluirSessaoCopiloto).not.toHaveBeenCalled()
    expect(api.iniciarSessaoCopiloto).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('sem resumo, porque o Copiloto não leu a entrada, oferece tentar de novo', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      sessao: { ...COM_SESSAO.sessao, sintese: '', sintese_conferida: false },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/o copiloto não conseguiu ler a entrada/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ler a entrada de novo/i })).toBeInTheDocument()
  })

  /**
   * PB91 pede que o Supervisor, ao voltar, consulte as rodadas anteriores. A
   * lista mostrava só as respostas dele: o que o Copiloto disse em cada rodada
   * tinha saído da tela, e nenhuma linha dizia quando. Agora a conversa vem
   * inteira, cada fala com o autor e a data.
   */
  it('a conversa mostra as rodadas dos dois lados, com autor e data (PB91)', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      mensagens: [
        {
          id_mensagem: 1,
          autor: 'copiloto',
          autor_rotulo: 'Copiloto',
          conteudo: 'Li a entrada e resumi o problema, o contexto e o que falta.',
          criado_em: '2026-11-20T13:05:00Z',
        },
        {
          id_mensagem: 2,
          autor: 'humano',
          autor_rotulo: 'Humano',
          conteudo: '[Metodologia] Que controles o método terá?\nResposta: Positivo e negativo.',
          criado_em: '2026-11-20T13:10:00Z',
        },
        {
          id_mensagem: 3,
          autor: 'humano',
          autor_rotulo: 'Humano',
          conteudo: 'O lote tem 2 t.',
          criado_em: '2026-11-20T13:11:00Z',
        },
        {
          id_mensagem: 4,
          autor: 'copiloto',
          autor_rotulo: 'Copiloto',
          conteudo: 'Rodada concluída: 1 elemento preenchido e 0 lacunas em aberto.',
          criado_em: '2026-11-20T13:12:00Z',
        },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const conversa = (await screen.findByRole('heading', { name: 'Conversa com o Copiloto' })).closest('details')
    const falas = within(conversa).getAllByRole('listitem')

    expect(falas).toHaveLength(4)
    expect(falas[0]).toHaveTextContent('Copiloto')
    expect(falas[0]).toHaveTextContent('Li a entrada e resumi')
    expect(falas[1]).toHaveTextContent('Supervisor')
    expect(falas[1]).toHaveTextContent('Metodologia: Que controles o método terá?')
    expect(falas[1]).toHaveTextContent('Positivo e negativo.')
    expect(falas[2]).toHaveTextContent('Outra informação')
    expect(falas[3]).toHaveTextContent('Rodada concluída')

    for (const fala of falas) {
      expect(within(fala).getByText(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/)).toHaveAttribute('datetime')
    }
  })

  /**
   * "Outra informação para o Copiloto" não dizia para onde o texto ia, e
   * quem não entende um campo não o usa. Agora ele é uma pergunta, diz que
   * vai junto com as respostas e só abre quando a pessoa pede.
   */
  it('a informação extra é uma pergunta que abre quando a pessoa pede', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByRole('button', { name: /adicionar outra informação/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(OUTRA_INFORMACAO)).toBeNull()

    const campo = await escreverOutraInformacao('O varejo pede 60 dias.')

    expect(campo).toHaveAccessibleDescription(/vai junto com as respostas/i)
    expect(screen.getByText(/o copiloto escreve os elementos mesmo sem respostas/i)).toBeInTheDocument()
  })

  it('sem conversa, oferece ler a entrada antes de estruturar', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(await screen.findByRole('button', { name: /ler a entrada/i }))

    await waitFor(() => expect(api.iniciarSessaoCopiloto).toHaveBeenCalledWith('OP-2026-001'))
  })

  it('mostra a sugestão para o elemento escrito e grava só ao aceitar', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    const aoEstruturar = vi.fn()
    api.estruturarComCopiloto = vi.fn().mockResolvedValue({
      preenchidos: [],
      fallback_usado: false,
      sugestoes: [
        {
          elemento: 'metodologia',
          elemento_rotulo: 'Metodologia',
          texto_sugerido: 'PCR em tempo real com controle positivo.',
          motivo: 'A resposta trouxe o controle.',
        },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" aoEstruturar={aoEstruturar} />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )

    const sugestao = (await screen.findByText('PCR em tempo real com controle positivo.')).closest('li')
    expect(sugestao).toHaveTextContent('A resposta trouxe o controle.')
    expect(api.aceitarSugestaoCopiloto).not.toHaveBeenCalled()

    await userEvent.click(within(sugestao).getByRole('button', { name: /aceitar/i }))

    await waitFor(() =>
      expect(api.aceitarSugestaoCopiloto).toHaveBeenCalledWith(
        'OP-2026-001',
        'metodologia',
        'PCR em tempo real com controle positivo.',
      ),
    )
    await waitFor(() =>
      expect(screen.queryByText('PCR em tempo real com controle positivo.')).not.toBeInTheDocument(),
    )
    expect(aoEstruturar).toHaveBeenCalled()
  })

  it('recusar a sugestão tira da tela sem gravar', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    api.estruturarComCopiloto = vi.fn().mockResolvedValue({
      preenchidos: [],
      fallback_usado: false,
      sugestoes: [
        { elemento: 'metodologia', elemento_rotulo: 'Metodologia', texto_sugerido: 'Outra.', motivo: '' },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )
    await userEvent.click(await screen.findByRole('button', { name: /recusar/i }))

    expect(screen.queryByText('Outra.')).not.toBeInTheDocument()
    expect(api.aceitarSugestaoCopiloto).not.toHaveBeenCalled()
  })

  it('cada lacuna diz o tipo e o que fazer, também no elemento já escrito', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      elementos_vazios: [],
      perguntas: [
        {
          id: 'lacuna-9',
          elemento: 'metodologia',
          pergunta: 'Quais controles serão usados?',
          motivo: 'Faltam os controles.',
          campo: '',
          origem: 'copiloto',
        },
      ],
      lacunas: [
        {
          id_lacuna: 9,
          campo_afetado: 'metodologia',
          natureza: 'pouco_desenvolvido',
          natureza_rotulo: 'Pouco desenvolvido',
          descricao: 'Faltam os controles.',
          recomendacao: 'Descreva o controle positivo e o negativo.',
          severidade: 'media',
          severidade_rotulo: 'Média',
        },
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const lacuna = (await screen.findByText('Descreva o controle positivo e o negativo.')).closest('li')
    expect(lacuna).toHaveTextContent('Pouco desenvolvido')
    expect(lacuna).toHaveTextContent('Metodologia')

    const pergunta = screen.getByText('Quais controles serão usados?').closest('li')
    expect(pergunta).toHaveTextContent('Pergunta do Copiloto')

    expect(screen.getByRole('button', { name: /reavaliar a proposta/i })).toBeEnabled()
  })

  it('diz que nada foi preenchido quando o provedor cai no fallback', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(PRONTA_PARA_ESTRUTURAR)
    api.estruturarComCopiloto = vi
      .fn()
      .mockResolvedValue({ preenchidos: [], fallback_usado: true })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(
      await screen.findByRole('button', { name: /estruturar com o copiloto/i }),
    )

    expect(
      await screen.findByText(/o copiloto não respondeu e nada foi preenchido/i),
    ).toBeInTheDocument()
  })

  it('mostra as lacunas com a severidade', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(
      await screen.findByText('A proposta não descreve a metodologia.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Como o método será validado?')).toBeInTheDocument()
  })

  it('deixa o Pesquisador somente em leitura', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/somente leitura/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /estruturar com o copiloto/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * PB66: depois de Continuar, ler a entrada, responder, estruturar, aceitar
   * sugestão e encerrar a conversa deixam de ser oferecidos. O sistema recusa
   * as etapas, e encerrar a conversa avisava que a proposta "continua
   * editável", o que deixou de ser verdade.
   */
  it('depois de Continuar, não oferece conduzir o Copiloto (PB66)', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" situacao="continuar" />)

    expect(await screen.findByText(/concluiu o fluxo/i)).toBeInTheDocument()
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /estruturar o que falta/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /enviar|estruturar/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /ler a entrada de novo/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/lotes perdidos por contaminação/i)).toBeInTheDocument()
  })

  /**
   * "8 de 8 elementos preenchidos" ao lado de uma lista de problemas fazia a
   * proposta parecer pronta. Preencher conta elemento com texto; os pontos
   * para revisar são o que o Copiloto deixou aberto no que já está escrito.
   */
  it('separa o preenchimento dos pontos para revisar no que já está escrito', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    expect(await screen.findByText(/8 de 8 elementos preenchidos/i)).toBeInTheDocument()
    expect(screen.getByText('1 ponto para revisar')).toBeInTheDocument()
  })

  it('o ponto sobre elemento ainda vazio conta como falta, não como revisão', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    expect(await screen.findByText(/7 de 8 elementos preenchidos/i)).toBeInTheDocument()
    expect(screen.getByText('Nenhum ponto para revisar')).toBeInTheDocument()
  })

  it('sem nada escrito, não fala em pontos para revisar', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await screen.findByText(/0 de 8 elementos preenchidos/i)
    expect(screen.queryByText(/pontos? para revisar/i)).toBeNull()
  })

  it('separa o que falta escrever do que revisar no que já está escrito', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COMPLETA_COM_PONTO,
      elementos_vazios: ['hipotese'],
      lacunas: [
        {
          id_lacuna: 3,
          campo_afetado: 'hipotese',
          natureza: 'ausente',
          natureza_rotulo: 'Ausente',
          descricao: 'A proposta não descreve a hipótese.',
          recomendacao: '',
          severidade: 'media',
          severidade_rotulo: 'Média',
        },
        ...COMPLETA_COM_PONTO.lacunas,
      ],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const falta = await screen.findByRole('list', { name: 'Falta escrever' })
    const revisar = screen.getByRole('list', { name: 'Para revisar no que já está escrito' })

    expect(within(falta).getByText('A proposta não descreve a hipótese.')).toBeInTheDocument()
    expect(within(revisar).getByText('Descreva o controle positivo e o negativo.')).toBeInTheDocument()
    expect(within(revisar).queryByText('A proposta não descreve a hipótese.')).toBeNull()
  })

  /**
   * O ponto dizia o que fazer, mas a pessoa tinha de achar sozinha o
   * elemento na outra aba.
   */
  it('cada elemento leva ao mesmo elemento na proposta', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)
    const irPara = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={irPara} />)

    const elemento = await abrirElementoDa('Descreva o controle positivo e o negativo.')
    await userEvent.click(within(elemento).getByRole('button', { name: /editar na proposta/i }))

    expect(irPara).toHaveBeenCalledWith('proposta', 'metodologia')
  })

  it('quem só lê também abre o elemento na proposta, sem convite a editar', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)
    const irPara = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={irPara} />)

    const elemento = await abrirElementoDa('Descreva o controle positivo e o negativo.')
    expect(within(elemento).queryByRole('button', { name: /editar na proposta/i })).toBeNull()
    expect(within(elemento).queryByRole('textbox')).toBeNull()

    await userEvent.click(within(elemento).getByRole('button', { name: /ver na proposta/i }))
    expect(irPara).toHaveBeenCalledWith('proposta', 'metodologia')
  })

  /**
   * Cada ponto aparecia duas vezes: em "O que o Copiloto apontou" e de novo
   * em "Perguntas orientadoras", com a mesma descrição como subtítulo, e eram
   * 16 botões para 8 pontos. Agora cada elemento é um item só, com o
   * problema, o que fazer, as perguntas com o campo aberto e o atalho.
   */
  it('cada elemento junta o problema, o que fazer e as perguntas, sem repetir a descrição', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COMPLETA_COM_PONTO,
      perguntas: [{ ...COMPLETA_COM_PONTO.perguntas[0], motivo: 'Faltam os controles.' }],
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    const elemento = await abrirElementoDa('Descreva o controle positivo e o negativo.')

    expect(within(elemento).getByText('Faltam os controles.')).toBeInTheDocument()
    expect(within(elemento).getByLabelText('Quais controles serão usados?')).toBeInTheDocument()
    expect(screen.getAllByText('Faltam os controles.')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /editar na proposta/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^responder/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Perguntas orientadoras' })).toBeNull()
  })

  it('o elemento sem pergunta mostra só o problema e o atalho', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({ ...COMPLETA_COM_PONTO, perguntas: [] })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    const elemento = await abrirElementoDa('Descreva o controle positivo e o negativo.')

    expect(within(elemento).queryByRole('textbox')).toBeNull()
    expect(within(elemento).getByRole('button', { name: /editar na proposta/i })).toBeInTheDocument()
  })

  /**
   * O que reavaliar faz morava só no `title` do botão, que não aparece no
   * celular nem para quem navega pelo teclado.
   */
  it('explica na tela o que reavaliar a proposta faz', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const botao = await screen.findByRole('button', { name: /reavaliar a proposta/i })

    expect(botao).not.toHaveAttribute('title')
    expect(botao).toHaveAccessibleDescription(/o texto só muda se você aceitar uma sugestão/i)
    expect(screen.getByText(/o texto só muda se você aceitar uma sugestão/i)).toBeVisible()
  })

  /**
   * O Copiloto parte do resumo da entrada; conferido, ele já fez o seu papel
   * e ocupava a tela inteira acima dos pontos. Agora fica recolhido no topo.
   */
  it('o resumo conferido fica recolhido, antes dos elementos', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const resumo = (await screen.findByRole('heading', { name: 'Resumo da entrada' })).closest('details')
    const elementos = screen.getByRole('heading', { name: 'O que falta e o que revisar' })

    expect(resumo).not.toBeNull()
    expect(resumo).not.toHaveAttribute('open')
    expect(resumo).toHaveTextContent(/conferido/i)
    expect(resumo.compareDocumentPosition(elementos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('o resumo ainda não conferido fica aberto, pedindo conferência', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COM_SESSAO,
      sessao: { ...COM_SESSAO.sessao, sintese_conferida: false },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const resumo = await screen.findByRole('heading', { name: 'Resumo da entrada' })

    expect(resumo.closest('details')).toBeNull()
    expect(screen.getByText(/lotes perdidos por contaminação/i)).toBeVisible()
  })

  /**
   * O botão laranja do topo era "Reavaliar", uma ação que refaz o trabalho,
   * e o avanço ficava num cartão no meio da página. Agora o próximo passo é
   * o botão principal da barra do fim, como nas outras etapas.
   */
  it('com o texto escrito, o próximo passo é o principal e reavaliar fica secundário', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)
    const irPara = vi.fn()

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={irPara} />)

    const reavaliar = await screen.findByRole('button', { name: /reavaliar a proposta/i })
    const barra = screen.getByRole('group', { name: 'Ações da etapa' })
    const continuar = within(barra).getByRole('button', { name: /continuar para proposta estruturada/i })

    expect(reavaliar).toHaveClass('admin-btn--outline')
    expect(continuar).not.toHaveClass('admin-btn--outline')
    expect(within(barra).queryByRole('button', { name: /enviar/i })).toBeNull()

    await userEvent.click(continuar)
    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('com o texto escrito mas o resumo não conferido, reavaliar espera o resumo', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({
      ...COMPLETA_COM_PONTO,
      sessao: { ...COMPLETA_COM_PONTO.sessao, sintese_conferida: false },
    })

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /usar este resumo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reavaliar a proposta/i })).toBeNull()
    expect(screen.getByRole('list', { name: /como usar o copiloto/i })).toBeInTheDocument()
  })

  it('com resposta escrita, enviar vira o principal e continuar fica secundário', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COMPLETA_COM_PONTO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    await escreverOutraInformacao('Mais contexto.')

    const barra = screen.getByRole('group', { name: 'Ações da etapa' })

    expect(within(barra).getByRole('button', { name: /enviar a resposta e reavaliar/i }))
      .not.toHaveClass('admin-btn--outline')
    expect(within(barra).getByRole('button', { name: /continuar para proposta estruturada/i }))
      .toHaveClass('admin-btn--outline')
  })
})
