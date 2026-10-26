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
   * "Abrir sessão" era um passo que ninguém sabia que existia: a caixa de
   * resposta só aparecia depois dele, e "Estruturar" funcionava sem ele. A
   * sessão continua existindo no servidor, mas abre sozinha na primeira
   * resposta.
   */
  it('abre a conversa sozinho na primeira resposta', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.type(
      await screen.findByLabelText(/sua resposta/i),
      'A perda média é de 4% do lote.',
    )
    await userEvent.click(screen.getByRole('button', { name: /responder e atualizar/i }))

    await waitFor(() =>
      expect(api.responderCopiloto).toHaveBeenCalledWith(
        'OP-2026-001',
        'A perda média é de 4% do lote.',
        {},
      ),
    )
    expect(api.iniciarSessaoCopiloto).toHaveBeenCalledWith('OP-2026-001')
    expect(screen.queryByRole('button', { name: /abrir sessão/i })).toBeNull()
  })

  it('não reabre a conversa que já está em andamento', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.type(await screen.findByLabelText(/sua resposta/i), 'Mais contexto.')
    await userEvent.click(screen.getByRole('button', { name: /responder e atualizar/i }))

    await waitFor(() => expect(api.responderCopiloto).toHaveBeenCalled())
    expect(api.iniciarSessaoCopiloto).not.toHaveBeenCalled()
  })

  it('explica que o limite de gasto barrou a chamada', async () => {
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

    await userEvent.type(
      await screen.findByLabelText(/sua resposta/i),
      'A perda média é de 4% do lote.',
    )
    await userEvent.click(screen.getByRole('button', { name: /responder e atualizar/i }))

    await waitFor(() => expect(api.estruturarComCopiloto).toHaveBeenCalledWith('OP-2026-001'))
    expect(await screen.findByText(/o copiloto preencheu metodologia/i)).toBeInTheDocument()
  })

  it('responde a pergunta escolhida, com o elemento e a pergunta', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue(COM_SESSAO)

    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    const pergunta = (await screen.findByText('Qual problema real você quer resolver?')).closest('li')
    await userEvent.click(within(pergunta).getByRole('button', { name: /responder/i }))

    expect(screen.getByText(/respondendo: qual problema real/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/sua resposta/i), 'Perda de lotes de suco.')
    await userEvent.click(screen.getByRole('button', { name: /responder e atualizar/i }))

    await waitFor(() =>
      expect(api.responderCopiloto).toHaveBeenCalledWith('OP-2026-001', 'Perda de lotes de suco.', {
        elemento: 'problema_pesquisa',
        pergunta: 'Qual problema real você quer resolver?',
      }),
    )
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

  it('sem conversa, oferece ler a entrada antes de estruturar', async () => {
    render(<AbaCopiloto oportunidadeId="OP-2026-001" />)

    await userEvent.click(await screen.findByRole('button', { name: /ler a entrada/i }))

    await waitFor(() => expect(api.iniciarSessaoCopiloto).toHaveBeenCalledWith('OP-2026-001'))
  })

  it('mostra a sugestão para o elemento escrito e grava só ao aceitar', async () => {
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
})
