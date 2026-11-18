import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaEquipe from './AbaEquipe'
import { ROLES } from '../../../../lib/roles'

/**
 * A aba tem um `Link` para o relatorio (PB77), e `Link` exige Router.
 */
function renderizar(props = {}) {
  return render(
    <MemoryRouter>
      <AbaEquipe oportunidadeId="OP-2026-001" {...props} />
    </MemoryRouter>,
  )
}

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterEquipePotencial: null,
  executarMatching: null,
  ajustarMembroEquipe: null,
  adicionarMembroEquipe: null,
  validarEquipe: null,
  listarRede: null,
  obterProposta: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
  executarMatching: (...args) => api.executarMatching(...args),
  ajustarMembroEquipe: (...args) => api.ajustarMembroEquipe(...args),
  adicionarMembroEquipe: (...args) => api.adicionarMembroEquipe(...args),
  validarEquipe: (...args) => api.validarEquipe(...args),
  listarRede: (...args) => api.listarRede(...args),
  obterProposta: (...args) => api.obterProposta(...args),
  listarCompetencias: (...args) => api.listarCompetencias(...args),
}))

const SEM_EQUIPE = { data: { codigo: 'equipe_inexistente' }, message: 'sem equipe' }

const SEM_PROPOSTA = { data: { codigo: 'proposta_inexistente' }, message: 'sem proposta' }

const EQUIPE = {
  id_equipe: 3,
  data_geracao: '2026-10-15T12:00:00Z',
  execucao: {
    id_execucao: 'exec-1',
    estrategia: 'hibrido_v1',
    usou_rerank: false,
    fallback_usado: true,
    status: 'ok',
  },
  membros: [
    {
      id_membro_equipe: 10,
      id_membro: 1,
      nome: 'Marina Alves',
      papel: 'pesquisador',
      papel_rotulo: 'Pesquisador',
      titulacao: 'Doutorado',
      disponibilidade: 'Integral',
      score_compatibilidade: '0.7200',
      match_reasons: ['Competência "Microbiologia de alimentos" coberta pelo perfil (100%).'],
      score_features: { semantico: null, lexical: 1, area: 0.5, disponibilidade: 1 },
      incluido: true,
      origem: 'ia',
      origem_rotulo: 'Sugerida pelo matching',
      validada: false,
    },
  ],
  lacunas: [
    {
      id_lacuna_equipe: 5,
      descricao: 'Nenhuma pessoa sugerida cobre "Estatística aplicada" de forma suficiente.',
    },
  ],
}

describe('AbaEquipe', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael' }
    api.obterEquipePotencial = vi.fn().mockResolvedValue(EQUIPE)
    api.executarMatching = vi
      .fn()
      .mockResolvedValue({ equipe: EQUIPE, avaliados: 12 })
    api.ajustarMembroEquipe = vi.fn().mockResolvedValue({})
    api.adicionarMembroEquipe = vi.fn().mockResolvedValue({})
    api.validarEquipe = vi.fn().mockResolvedValue({})
    api.listarRede = vi.fn().mockResolvedValue({
      results: [{ id_membro: 9, nome: 'Clara Nunes', papel_rede: 'pesquisador' }],
    })
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: true,
    })
    api.listarCompetencias = vi
      .fn()
      .mockResolvedValue([{ id_competencia_necessaria: 1, descricao: 'Microbiologia de alimentos' }])
  })

  /**
   * Quem saiu da rede continua na equipe que já foi gerada, marcado: a
   * composição daquela rodada precisa continuar legível, e o Supervisor
   * precisa saber que a pessoa não está mais disponível.
   */
  it('marca quem ficou inativo na rede', async () => {
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      ...EQUIPE,
      membros: [{ ...EQUIPE.membros[0], inativo: true }],
    })

    renderizar()

    expect(await screen.findByText('Inativo na rede')).toBeInTheDocument()
  })

  it('separa a supervisão das demais sugestões', async () => {
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      ...EQUIPE,
      membros: [
        EQUIPE.membros[0],
        {
          ...EQUIPE.membros[0],
          id_membro_equipe: 11,
          id_membro: 2,
          nome: 'Lia Doutora',
          papel: 'supervisor',
          papel_rotulo: 'Supervisor',
        },
      ],
    })

    renderizar()

    const supervisao = await screen.findByRole('list', { name: 'Supervisão' })
    const pesquisa = screen.getByRole('list', { name: 'Pesquisa' })

    expect(within(supervisao).getByText('Lia Doutora')).toBeInTheDocument()
    expect(within(pesquisa).getByText('Marina Alves')).toBeInTheDocument()
    expect(within(pesquisa).queryByText('Lia Doutora')).not.toBeInTheDocument()
  })

  it('acha pela busca quem incluir na equipe, sem carregar a rede inteira', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.type(await screen.findByLabelText(/incluir alguém da rede/i), 'Clara')
    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'Clara' })),
    )

    await user.click(await screen.findByRole('option', { name: /Clara Nunes/ }))
    await user.click(screen.getByRole('button', { name: /^incluir$/i }))

    await waitFor(() =>
      expect(api.adicionarMembroEquipe).toHaveBeenCalledWith('OP-2026-001', {
        id_membro: 9,
        papel: 'pesquisador',
      }),
    )
  })

  it('trava nova rodada enquanto a proposta não foi revisada', async () => {
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: false,
    })

    renderizar()

    expect(await screen.findByText(/ainda não foi revisada/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rodar de novo/i })).toBeDisabled(),
    )
  })

  it('o cartão fechado traz nome, nota e o motivo principal; o resto fica a um clique', async () => {
    const user = userEvent.setup()
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      ...EQUIPE,
      membros: [
        {
          ...EQUIPE.membros[0],
          match_reasons: ['Motivo principal da sugestão.', 'Segundo motivo da sugestão.'],
        },
      ],
    })
    renderizar()

    expect(await screen.findByText('Motivo principal da sugestão.')).toBeVisible()
    expect(screen.getByText('Segundo motivo da sugestão.')).not.toBeVisible()
    expect(screen.getByText('Palavras em comum')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Ver detalhes' }))

    expect(screen.getByText('Segundo motivo da sugestão.')).toBeVisible()
    expect(screen.getByText('Palavras em comum')).toBeVisible()
  })

  it('mostra a sugestão com score e justificativa visível', async () => {
    renderizar()

    expect(await screen.findByText('Marina Alves')).toBeInTheDocument()
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(
      screen.getByText(/Microbiologia de alimentos" coberta pelo perfil/i),
    ).toBeInTheDocument()
  })

  it('explica no topo que a afinidade com o tema não entrou na nota e tira a linha do cartão', async () => {
    renderizar()

    expect(
      await screen.findByText(/afinidade com o tema não estava disponível/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/hibrido_v1/)).not.toBeInTheDocument()
    expect(screen.queryByText('indisponível')).not.toBeInTheDocument()
  })

  it('deixa explícito que não há convite nem aceite', async () => {
    renderizar()

    expect(
      await screen.findByText(/não há convite, aceite nem recusa/i),
    ).toBeInTheDocument()
  })

  it('mostra a lacuna de competência da equipe', async () => {
    renderizar()

    expect(
      await screen.findByText(/Estatística aplicada" de forma suficiente/i),
    ).toBeInTheDocument()
  })

  it('tira alguém da composição pelo ajuste do Supervisor', async () => {
    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /tirar da equipe/i }))

    await waitFor(() =>
      expect(api.ajustarMembroEquipe).toHaveBeenCalledWith('OP-2026-001', 10, {
        incluido: false,
      }),
    )
  })

  it('valida a equipe e avisa que ninguém foi convocado', async () => {
    renderizar()

    const barra = await screen.findByRole('group', { name: 'Ações da etapa' })
    await userEvent.click(within(barra).getByRole('button', { name: /validar equipe/i }))

    expect(await screen.findByText(/nenhum convite foi enviado/i)).toBeInTheDocument()
  })

  it('oferece rodar o matching quando ainda não há equipe', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)

    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /rodar matching/i }))

    await waitFor(() => expect(api.executarMatching).toHaveBeenCalledWith('OP-2026-001'))
  })

  it('deixa o Pesquisador somente em leitura', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }

    renderizar()

    expect(await screen.findByText(/somente leitura/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /validar equipe/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * Com a equipe gerada, o aviso só aparecia ao Supervisor. O Pesquisador
   * está nessa equipe e lê a oportunidade: sem a indicação, tomava por
   * definitivo um texto que ninguém revisou.
   */
  it('o Pesquisador vê que a proposta não foi revisada, sem pedido de revisão (RN-IA01)', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria' }
    api.obterProposta = vi.fn().mockResolvedValue({
      problema_pesquisa: 'Contaminação resiste à pasteurização.',
      revisada_por_humano: false,
    })

    renderizar({ irPara: vi.fn() })

    expect(
      await screen.findByText(/ainda não foi revisada pelo supervisor/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /revisar a proposta/i }),
    ).not.toBeInTheDocument()
  })

  /**
   * Rodar de novo cria outra equipe e a tela passa a mostrar a nova: quem foi
   * tirado, incluído à mão ou validado na anterior se perde. Um clique sem
   * aviso apagava esse trabalho.
   */
  it('pede confirmação antes de substituir a equipe ajustada', async () => {
    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: /rodar de novo/i }))

    expect(screen.getByText(/os ajustes feitos nesta equipe/i)).toBeInTheDocument()
    expect(api.executarMatching).not.toHaveBeenCalled()

    const dialogo = screen.getByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: /rodar de novo/i }))

    await waitFor(() => expect(api.executarMatching).toHaveBeenCalledWith('OP-2026-001'))
  })

  it('com a equipe validada, aponta a pré-análise', async () => {
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      ...EQUIPE,
      membros: EQUIPE.membros.map((membro) => ({ ...membro, validada: true })),
    })
    const irPara = vi.fn()

    renderizar({ irPara })

    const barra = await screen.findByRole('group', { name: 'Ações da etapa' })
    await userEvent.click(within(barra).getByRole('button', { name: /continuar para pré-análise/i }))
    expect(irPara).toHaveBeenCalledWith('pre-analise')
  })

  /**
   * A barra dizia "Equipe validada" com o botão "Validar equipe" ainda ativo.
   */
  it('com a equipe validada, o botão diz que está validada e fica inativo', async () => {
    api.obterEquipePotencial = vi.fn().mockResolvedValue({
      ...EQUIPE,
      membros: EQUIPE.membros.map((membro) => ({ ...membro, validada: true })),
    })

    renderizar({ irPara: vi.fn() })

    const barra = await screen.findByRole('group', { name: 'Ações da etapa' })

    expect(within(barra).getByRole('button', { name: /equipe validada/i })).toBeDisabled()
    expect(within(barra).queryByRole('button', { name: /^validar equipe/i })).toBeNull()
  })

  /**
   * PB66: Continuar conclui o fluxo, e Continuar e Arquivada não têm saída. O
   * sistema já recusa rodar, ajustar e validar; a tela oferecia os botões e o
   * Supervisor só descobria pela mensagem de erro.
   */
  it('depois de Continuar, não oferece rodar, ajustar nem validar, e diz por quê (PB66)', async () => {
    const irPara = vi.fn()

    renderizar({ situacao: 'continuar', irPara })

    expect(await screen.findByText(/concluiu o fluxo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rodar de novo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tirar da equipe/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /validar equipe/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/incluir alguém da rede/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /gerar relatório/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ver a decisão/i }))
    expect(irPara).toHaveBeenCalledWith('decisao')
  })

  it('arquivada sem equipe, não oferece rodar o matching', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)

    renderizar({ situacao: 'arquivada' })

    expect(await screen.findByText(/foi arquivada/i)).toBeInTheDocument()
    expect(screen.getByText(/nenhum matching foi rodado antes da decisão/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rodar matching/i })).not.toBeInTheDocument()
  })

  /**
   * A etapa 5 abria com "Rodar matching" ligado mesmo com a oportunidade na
   * etapa 1: o servidor recusava só depois do clique. O matching compara as
   * competências necessárias com a rede; sem elas, a aba diz de onde vêm.
   */
  it('sem competências identificadas, não deixa rodar e aponta a etapa Competências', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)
    api.listarCompetencias = vi.fn().mockResolvedValue([])
    const irPara = vi.fn()

    renderizar({ irPara })

    expect(await screen.findByText(/identifique as competências/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rodar matching/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /ir para competências/i }))
    expect(irPara).toHaveBeenCalledWith('competencias')
  })

  it('sem proposta, também aponta a etapa Competências', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)
    api.listarCompetencias = vi.fn().mockRejectedValue(SEM_PROPOSTA)

    renderizar({ irPara: vi.fn() })

    expect(await screen.findByText(/identifique as competências/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rodar matching/i })).toBeDisabled()
  })

  it('falha ao ler as competências não trava o matching', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)
    api.listarCompetencias = vi.fn().mockRejectedValue(new Error('fora do ar'))

    renderizar()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rodar matching/i })).toBeEnabled(),
    )
    expect(screen.queryByText(/identifique as competências/i)).toBeNull()
  })

  /**
   * A rodada travava todas as etapas ("Aguarde a IA terminar") e podia passar
   * de um minuto. O resultado fica salvo no servidor, então a página guarda
   * a rodada, e a pessoa segue trabalhando em outra etapa.
   */
  it('a rodada passa pela página, sem travar as outras etapas', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)
    const aoRodar = vi.fn((acao) => acao())
    const aoOcupar = vi.fn()

    renderizar({ aoRodar, aoOcupar })

    await userEvent.click(await screen.findByRole('button', { name: /rodar matching/i }))

    await waitFor(() => expect(api.executarMatching).toHaveBeenCalledWith('OP-2026-001'))
    expect(aoRodar).toHaveBeenCalledTimes(1)
    expect(aoOcupar).not.toHaveBeenCalledWith(true)
  })

  it('enquanto roda, diz que dá para seguir para outra etapa', async () => {
    api.obterEquipePotencial = vi.fn().mockRejectedValue(SEM_EQUIPE)

    renderizar({ rodadaEmCurso: true })

    expect(await screen.findByText(/pode seguir para outra etapa/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rodando/i })).toBeDisabled()
  })

  it('quando a rodada termina com a pessoa fora da aba, a aba volta já com a equipe', async () => {
    api.obterEquipePotencial = vi
      .fn()
      .mockRejectedValueOnce(SEM_EQUIPE)
      .mockResolvedValue(EQUIPE)

    const { rerender } = renderizar({ rodadaEmCurso: true })

    await screen.findByText(/pode seguir para outra etapa/i)

    rerender(
      <MemoryRouter>
        <AbaEquipe oportunidadeId="OP-2026-001" rodadaEmCurso={false} />
      </MemoryRouter>,
    )

    expect((await screen.findAllByText('Marina Alves')).length).toBeGreaterThan(0)
    expect(api.obterEquipePotencial).toHaveBeenCalledTimes(2)
  })
})
