import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaDecisao from './AbaDecisao'

const estilos = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'OportunidadesPage.scss'),
  'utf8',
)

const api = vi.hoisted(() => ({
  obterProposta: null,
  registrarObservacao: null,
  listarPreAnalises: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterProposta: (...args) => api.obterProposta(...args),
  listarPreAnalises: (...args) => api.listarPreAnalises(...args),
  registrarObservacao: (...args) => api.registrarObservacao(...args),
}))

const PROPOSTA_REVISADA = {
  problema_pesquisa: 'Contaminação resiste à pasteurização.',
  revisada_por_humano: true,
}

const DECISAO_REGISTRADA = {
  tipo: 'continuar',
  justificativa: 'Proposta madura e equipe potencial validada pelo Núcleo.',
  autor: 'Rafael Antunes',
  em: Date.parse('2026-09-20T13:00:00.000Z'),
}

const OBSERVACAO_ANTIGA = {
  id: 'o1',
  em: Date.parse('2026-09-18T10:00:00.000Z'),
  categoria: 'observacao',
  ator: 'Rafael Antunes',
  texto: 'Demandante confirmou o volume de lotes perdidos.',
}

const OBSERVACAO_RECENTE = {
  id: 'o2',
  em: Date.parse('2026-09-19T10:00:00.000Z'),
  categoria: 'observacao',
  ator: 'Rafael Antunes',
  texto: 'Equipe cobre a microbiologia, falta quem conheça a usina.',
}

let onRegistrar
let aoRegistrarObservacao

beforeEach(() => {
  onRegistrar = vi.fn()
  aoRegistrarObservacao = vi.fn()
  api.obterProposta = vi.fn().mockResolvedValue(PROPOSTA_REVISADA)
  api.listarPreAnalises = vi.fn().mockResolvedValue([])
  api.registrarObservacao = vi.fn().mockResolvedValue({
    ocorrido_em: '2026-09-22T10:00:00.000Z',
    texto: 'Laudo do lote de verão confirma a contaminação.',
    autor_nome: 'Rafael Antunes',
  })
})

function renderizar(props = {}) {
  return render(
    <AbaDecisao
      oportunidadeId="OP-2026-001"
      podeDecidir
      situacao="aguardando_decisao"
      onRegistrar={onRegistrar}
      aoRegistrarObservacao={aoRegistrarObservacao}
      {...props}
    />
  )
}

const justificativa = () => screen.getByLabelText('Justificativa')
const registrar = () => screen.getByRole('button', { name: /registrar decisão/i })
const confirmar = async (user) =>
  user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirmar e registrar/i }))
const novaObservacao = () => screen.getByLabelText('Nova observação')
const registrarObservacao = () => screen.getByRole('button', { name: /registrar observação/i })

/**
 * No caso de uso da decisão o Supervisor registra observações enquanto
 * analisa e só depois decide. Elas ficavam só na aba Histórico, longe da
 * decisão que ajudam a fundamentar. Na etapa Decisão o Supervisor lê o que já
 * anotou enquanto escreve a justificativa. A observação continua na trilha:
 * a lista vem do mesmo histórico da página, e a nova volta para ele.
 */
describe('AbaDecisao — observações da avaliação (PB65)', () => {
  it('mostra as observações já registradas, a mais recente primeiro', () => {
    renderizar({ observacoes: [OBSERVACAO_ANTIGA, OBSERVACAO_RECENTE] })

    const itens = within(screen.getByRole('list', { name: 'Observações registradas' }))
      .getAllByRole('listitem')

    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent(OBSERVACAO_RECENTE.texto)
    expect(itens[1]).toHaveTextContent(OBSERVACAO_ANTIGA.texto)
  })

  it('sem observação ainda, diz isso em vez de deixar a área vazia', () => {
    renderizar()

    expect(screen.getByText(/nenhuma observação registrada/i)).toBeInTheDocument()
  })

  it('registra a observação e a entrega para o histórico da página', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(novaObservacao(), '  Laudo do lote de verão confirma a contaminação.  ')
    await user.click(registrarObservacao())

    expect(api.registrarObservacao).toHaveBeenCalledWith(
      'OP-2026-001',
      'Laudo do lote de verão confirma a contaminação.',
    )
    expect(aoRegistrarObservacao).toHaveBeenCalledWith(
      expect.objectContaining({
        categoria: 'observacao',
        ator: 'Rafael Antunes',
        texto: 'Laudo do lote de verão confirma a contaminação.',
        em: Date.parse('2026-09-22T10:00:00.000Z'),
      }),
    )
    expect(novaObservacao()).toHaveValue('')
  })

  it('não registra observação vazia', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(novaObservacao(), '   ')

    expect(registrarObservacao()).toBeDisabled()
    expect(api.registrarObservacao).not.toHaveBeenCalled()
  })

  it('mostra a recusa da API sem perder o texto digitado', async () => {
    api.registrarObservacao = vi.fn().mockRejectedValue(new Error('Texto curto demais.'))
    const user = userEvent.setup()
    renderizar()

    await user.type(novaObservacao(), 'Laudo confirma.')
    await user.click(registrarObservacao())

    expect(await screen.findByRole('alert')).toHaveTextContent(/curto demais/i)
    expect(novaObservacao()).toHaveValue('Laudo confirma.')
    expect(aoRegistrarObservacao).not.toHaveBeenCalled()
  })

  it('observação não é decisão: registrar uma não registra a outra', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    await user.type(novaObservacao(), 'Equipe validada em reunião.')
    await user.click(registrarObservacao())

    expect(api.registrarObservacao).toHaveBeenCalledTimes(1)
    expect(onRegistrar).not.toHaveBeenCalled()
    expect(justificativa()).toHaveValue('')
  })

  it('diz que a observação não muda a etapa e que a empresa não a vê', () => {
    renderizar()

    expect(novaObservacao()).toHaveAccessibleDescription(
      /não muda a etapa.*empresa demandante não vê/i,
    )
  })

  it('vale também antes da pré-análise, quando a decisão ainda está travada', () => {
    renderizar({ situacao: 'matching' })

    expect(screen.getByRole('radio', { name: /continuar/i })).toBeDisabled()
    expect(novaObservacao()).toBeEnabled()
  })

  it('depois de Continuar o Supervisor ainda lê as observações', () => {
    renderizar({
      decisao: DECISAO_REGISTRADA,
      situacao: 'continuar',
      observacoes: [OBSERVACAO_ANTIGA],
    })

    expect(screen.getByText(OBSERVACAO_ANTIGA.texto)).toBeInTheDocument()
  })

  it('quem não decide não vê as observações nem o campo', () => {
    renderizar({ podeDecidir: false, observacoes: [OBSERVACAO_ANTIGA] })

    expect(screen.queryByText(OBSERVACAO_ANTIGA.texto)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nova observação')).not.toBeInTheDocument()
  })

  /**
   * A etapa empilha cartões: a última decisão, as observações e o registro da
   * decisão. Sem regra de espaço entre irmãos eles saíam colados, borda com
   * borda, como se fossem um cartão só. A suíte roda sem CSS, então a regra é
   * conferida na folha de estilo.
   */
  it('os cartões empilhados da etapa ficam separados', () => {
    renderizar({
      situacao: 'revisar',
      decisao: { ...DECISAO_REGISTRADA, tipo: 'revisar' },
      irPara: vi.fn(),
    })

    expect(document.querySelectorAll('body > div > .perfil-card')).toHaveLength(3)

    const inicio = estilos.indexOf('\n.oportunidade-conteudo > .perfil-card + .perfil-card {')
    const bloco = estilos.slice(inicio, estilos.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/margin-top:\s*var\(--admin-gap\)/)
  })
})

describe('AbaDecisao — quem pode decidir', () => {
  it('oferece os tres encaminhamentos da baseline, e nada mais', () => {
    renderizar()

    const opcoes = screen.getAllByRole('radio')

    expect(opcoes).toHaveLength(3)
    expect(opcoes.map((opcao) => opcao.getAttribute('value')))
      .toEqual(['continuar', 'revisar', 'arquivar'])
  })

  it('nasce sem encaminhamento escolhido, para nao sugerir um desfecho', () => {
    renderizar()

    for (const opcao of screen.getAllByRole('radio')) {
      expect(opcao).not.toBeChecked()
    }
  })

  it('diz que a decisao e humana e que a IA nao decide', () => {
    renderizar()

    expect(screen.getByText(/a plataforma não decide, e a IA/i)).toBeInTheDocument()
  })
})

describe('AbaDecisao — o que o registro exige', () => {
  it('nao registra sem encaminhamento escolhido', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(justificativa(), 'Motivo suficientemente longo.')
    await user.click(registrar())

    expect(screen.getByRole('alert')).toHaveTextContent(/escolha o encaminhamento/i)
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('nao registra sem justificativa: e o que o historico preserva', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    await user.click(registrar())

    expect(screen.getByRole('alert')).toHaveTextContent(/descreva o motivo/i)
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('recusa justificativa curta demais para explicar algo', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /arquivar/i }))
    await user.type(justificativa(), 'nao deu')
    await user.click(registrar())

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(onRegistrar).not.toHaveBeenCalled()
  })

  it('registra o encaminhamento e a justificativa sem espaco sobrando', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /revisar/i }))
    await user.type(justificativa(), '   Faltam resultados esperados.   ')
    await user.click(registrar())
    await confirmar(user)

    expect(onRegistrar).toHaveBeenCalledTimes(1)
    expect(onRegistrar).toHaveBeenCalledWith(
      'revisar',
      'Faltam resultados esperados.'
    )
  })

  it('cada um dos tres encaminhamentos chega ao registro com o proprio id', async () => {
    for (const tipo of ['continuar', 'revisar', 'arquivar']) {
      onRegistrar = vi.fn()
      const user = userEvent.setup()
      const { unmount } = renderizar()

      await user.click(screen.getByRole('radio', { name: new RegExp(tipo, 'i') }))
      await user.type(justificativa(), 'Justificativa com tamanho bastante.')
      await user.click(registrar())
      await confirmar(user)

      expect(onRegistrar).toHaveBeenCalledWith(tipo, expect.any(String))
      expect(onRegistrar.mock.calls[0][0]).toBe(tipo)

      unmount()
    }
  })

  it('o aviso sai da tela quando a pessoa corrige o campo', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(registrar())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

/**
 * Continuar e Arquivar encerram a oportunidade e nao tem volta, e o Revisar
 * manda a justificativa para a empresa por e-mail. A decisao era gravada no
 * primeiro clique, sem a pessoa conferir o que ia acontecer.
 */
describe('AbaDecisao — confirmação antes de registrar', () => {
  async function preencher(user, tipo) {
    await user.click(screen.getByRole('radio', { name: new RegExp(tipo, 'i') }))
    await user.type(justificativa(), 'Justificativa com tamanho bastante.')
    await user.click(registrar())
  }

  it('pede confirmação, e Voltar não registra', async () => {
    const user = userEvent.setup()
    renderizar()

    await preencher(user, 'continuar')

    const dialogo = await screen.findByRole('dialog')
    expect(onRegistrar).not.toHaveBeenCalled()

    await user.click(within(dialogo).getByRole('button', { name: /voltar/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onRegistrar).not.toHaveBeenCalled()
    expect(justificativa()).toHaveValue('Justificativa com tamanho bastante.')
  })

  it('Continuar e Arquivar dizem que encerram a oportunidade', async () => {
    for (const tipo of ['continuar', 'arquivar']) {
      const user = userEvent.setup()
      const { unmount } = renderizar()

      await preencher(user, tipo)

      const dialogo = await screen.findByRole('dialog')
      expect(dialogo).toHaveAccessibleName(new RegExp(tipo, 'i'))
      expect(within(dialogo).getByText(/as etapas ficam só para leitura/i)).toBeInTheDocument()
      expect(within(dialogo).getByText(/não pode ser refeita/i)).toBeInTheDocument()

      unmount()
    }
  })

  it('Revisar diz que a justificativa vai para a empresa', async () => {
    const user = userEvent.setup()
    renderizar()

    await preencher(user, 'revisar')

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/vai para a empresa demandante/i)).toBeInTheDocument()
    expect(within(dialogo).queryByText(/não pode ser refeita/i)).not.toBeInTheDocument()
  })

  it('com o formulário incompleto, não abre a confirmação', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(registrar())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/**
 * A acao principal da etapa vinha depois das Observacoes, e o minimo da
 * justificativa so aparecia no erro.
 */
describe('AbaDecisao — o que vem primeiro', () => {
  it('o registro da decisão vem antes das observações', () => {
    renderizar()

    const decisao = screen.getByRole('heading', { name: 'Registrar decisão' })
    const observacoes = screen.getByRole('heading', { name: /observações da avaliação/i })

    expect(decisao.compareDocumentPosition(observacoes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('diz o mínimo da justificativa antes do erro', () => {
    renderizar()

    expect(justificativa()).toHaveAccessibleDescription(/mínimo de 10 caracteres/i)
  })
})

/**
 * Na etapa 7 o Supervisor ainda pode mudar a proposta. A pre-analise, porem,
 * leu o texto anterior, e nada avisava que a decisao ia se apoiar numa
 * leitura antiga.
 */
describe('AbaDecisao — proposta mudou depois da pré-análise', () => {
  const RODADAS = [
    { id_pre_analise: 'pa-2', executada_em: '2026-11-14T12:00:00Z', status: 'erro', atual: true },
    { id_pre_analise: 'pa-1', executada_em: '2026-11-10T12:00:00Z', status: 'ok', atual: false },
  ]

  it('avisa e leva à Pré-análise para reavaliar', async () => {
    const irPara = vi.fn()
    const user = userEvent.setup()
    api.obterProposta = vi.fn().mockResolvedValue({ ...PROPOSTA_REVISADA, atualizado_em: '2026-11-12T09:00:00Z' })
    api.listarPreAnalises = vi.fn().mockResolvedValue(RODADAS)

    renderizar({ irPara })

    const texto = await screen.findByText(/a proposta foi salva depois da pré-análise de 10\/11\/2026/i)
    const aviso = texto.closest('[role="note"]')
    expect(aviso).toHaveTextContent(/reavalie antes de decidir/i)

    await user.click(within(aviso).getByRole('button', { name: /ir para pré-análise/i }))
    expect(irPara).toHaveBeenCalledWith('pre-analise')
  })

  it('não avisa quando a proposta foi salva antes da pré-análise', async () => {
    api.obterProposta = vi.fn().mockResolvedValue({ ...PROPOSTA_REVISADA, atualizado_em: '2026-10-31T17:14:00Z' })
    api.listarPreAnalises = vi.fn().mockResolvedValue(RODADAS)

    renderizar()

    await waitFor(() => expect(api.listarPreAnalises).toHaveBeenCalled())
    expect(screen.queryByText(/foi salva depois da pré-análise/i)).not.toBeInTheDocument()
  })

  it('depois de encerrada, não avisa: a decisão já foi tomada', async () => {
    api.obterProposta = vi.fn().mockResolvedValue({ ...PROPOSTA_REVISADA, atualizado_em: '2026-11-12T09:00:00Z' })
    api.listarPreAnalises = vi.fn().mockResolvedValue(RODADAS)

    renderizar({ decisao: DECISAO_REGISTRADA, situacao: 'continuar' })

    await screen.findByText('Decisão registrada')
    expect(screen.queryByText(/foi salva depois da pré-análise/i)).not.toBeInTheDocument()
    expect(api.listarPreAnalises).not.toHaveBeenCalled()
  })
})

describe('AbaDecisao — decisao ja registrada', () => {
  it('mostra o desfecho, a justificativa e quem registrou', () => {
    renderizar({ decisao: DECISAO_REGISTRADA, situacao: 'continuar' })

    expect(screen.getByText('Continuar')).toBeInTheDocument()
    expect(screen.getByText(DECISAO_REGISTRADA.justificativa)).toBeInTheDocument()
    expect(screen.getByText('Rafael Antunes')).toBeInTheDocument()
  })

  it('nao oferece decidir de novo depois de Continuar ou Arquivar', () => {
    renderizar({ decisao: DECISAO_REGISTRADA, situacao: 'continuar' })

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar decisão/i }))
      .not.toBeInTheDocument()
  })

  it('a decisao registrada aparece mesmo para quem nao pode decidir', () => {
    renderizar({ decisao: DECISAO_REGISTRADA, podeDecidir: false })

    expect(screen.getByText(DECISAO_REGISTRADA.justificativa)).toBeInTheDocument()
  })
})

/**
 * O fluxo da oportunidade tem regra: Continuar e Revisar vêm depois da
 * pré-análise, Arquivar vale em qualquer etapa, e depois de Revisar a
 * oportunidade volta para a proposta. A API recusa o que estiver fora disso;
 * a tela não oferece o botão que vai ser recusado e diz o que falta.
 */
describe('AbaDecisao — portões do fluxo', () => {
  it('antes da pré-análise só Arquivar fica liberado, com o motivo', async () => {
    const irPara = vi.fn()
    const user = userEvent.setup()
    renderizar({ situacao: 'matching', irPara })

    expect(screen.getByRole('radio', { name: /continuar/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /revisar/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /arquivar/i })).toBeEnabled()
    expect(screen.getByText(/ficam liberados quando a pré-análise termina/i))
      .toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ir para pré-análise/i }))

    expect(irPara).toHaveBeenCalledWith('pre-analise')
  })

  it('depois de Revisar mostra a última decisão e leva de volta à proposta', async () => {
    const irPara = vi.fn()
    const user = userEvent.setup()
    renderizar({
      situacao: 'revisar',
      decisao: { ...DECISAO_REGISTRADA, tipo: 'revisar' },
      irPara,
    })

    expect(screen.getByText('Última decisão')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /arquivar/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /ir para proposta estruturada/i }))

    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('aguardando decisão, os três encaminhamentos ficam liberados', () => {
    renderizar()

    for (const opcao of screen.getAllByRole('radio')) {
      expect(opcao).toBeEnabled()
    }
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

/**
 * No Revisar a justificativa é o pedido de complementação: vai para a
 * empresa demandante, na plataforma e por e-mail. Quem escreve precisa saber
 * disso antes, porque o que sai por e-mail o sistema não apaga depois.
 */
describe('AbaDecisao — o que sai para a empresa', () => {
  it('avisa, só no Revisar, que a justificativa vai para a empresa', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(screen.getByRole('radio', { name: /continuar/i }))
    expect(screen.queryByText(/vai para a empresa demandante/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /revisar/i }))
    expect(justificativa()).toHaveAccessibleDescription(/vai para a empresa demandante/i)
  })
})

describe('AbaDecisao — quem nao decide', () => {
  it('nao recebe o formulario: decidir e do Supervisor (RN-A05)', () => {
    renderizar({ podeDecidir: false })

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar decisão/i }))
      .not.toBeInTheDocument()
  })

  it('explica que acompanha o resultado em vez de so esconder a acao', () => {
    renderizar({ podeDecidir: false })

    expect(screen.getByText(/aguardando decisão/i)).toBeInTheDocument()
    expect(screen.getByText(/registrado pelo Supervisor/i)).toBeInTheDocument()
  })
})

/**
 * PB90 pede a indicação de revisão pendente também na Decisão, e a aba não
 * tinha nenhuma. O Copiloto pode voltar a escrever depois da pré-análise, e a
 * proposta volta a não revisada sem a situação recuar.
 */
describe('AbaDecisao — proposta não revisada', () => {
  beforeEach(() => {
    api.obterProposta = vi.fn().mockResolvedValue({
      ...PROPOSTA_REVISADA,
      revisada_por_humano: false,
    })
  })

  it('avisa o Supervisor e leva a revisar, sem travar a decisão (PB90)', async () => {
    const irPara = vi.fn()
    renderizar({ irPara })

    expect(await screen.findByText(/só vale como definitivo/i)).toBeInTheDocument()
    expect(screen.queryByText(/fica liberada/i)).not.toBeInTheDocument()
    expect(api.obterProposta).toHaveBeenCalledWith('OP-2026-001')
    screen.getAllByRole('radio').forEach((opcao) => expect(opcao).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: /revisar a proposta/i }))
    expect(irPara).toHaveBeenCalledWith('proposta')
  })

  it('avisa quem acompanha, sem pedir revisão (RN-IA01)', async () => {
    renderizar({ podeDecidir: false, irPara: vi.fn() })

    expect(
      await screen.findByText(/ainda não foi revisada pelo supervisor/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /revisar a proposta/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * Depois de Continuar ou Arquivar a proposta não pode mais ser salva. O
   * texto do Copiloto segue sem valer como definitivo (RN-IA01), mas "revise e
   * salve" pediria o impossível: o aviso só registra que a decisão saiu sem a
   * revisão.
   */
  it('depois de Continuar, registra que a decisão saiu sem revisão, sem pedir revisão (RN-IA01)', async () => {
    renderizar({ decisao: DECISAO_REGISTRADA, situacao: 'continuar', irPara: vi.fn() })

    expect(await screen.findByText(/não foi revisada antes da decisão/i)).toBeInTheDocument()
    expect(screen.getByText(DECISAO_REGISTRADA.justificativa)).toBeInTheDocument()
    expect(screen.queryByText(/você revisa/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /revisar a proposta/i }),
    ).not.toBeInTheDocument()
  })
})
