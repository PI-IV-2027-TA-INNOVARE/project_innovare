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
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterEquipePotencial: (...args) => api.obterEquipePotencial(...args),
  executarMatching: (...args) => api.executarMatching(...args),
  ajustarMembroEquipe: (...args) => api.ajustarMembroEquipe(...args),
  adicionarMembroEquipe: (...args) => api.adicionarMembroEquipe(...args),
  validarEquipe: (...args) => api.validarEquipe(...args),
  listarRede: (...args) => api.listarRede(...args),
}))

const SEM_EQUIPE = { data: { codigo: 'equipe_inexistente' }, message: 'sem equipe' }

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

    await userEvent.click(await screen.findByRole('button', { name: /validar equipe/i }))

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

    await userEvent.click(await screen.findByRole('button', { name: /ir para pré-análise/i }))
    expect(irPara).toHaveBeenCalledWith('pre-analise')
  })
})
