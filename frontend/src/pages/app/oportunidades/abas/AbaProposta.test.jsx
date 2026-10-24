import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaProposta from './AbaProposta'
import { ROLES } from '../../../../lib/roles'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterProposta: null,
  criarProposta: null,
  atualizarProposta: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterProposta: (...args) => api.obterProposta(...args),
  criarProposta: (...args) => api.criarProposta(...args),
  atualizarProposta: (...args) => api.atualizarProposta(...args),
}))

const VAZIA = {
  id_proposta: 1,
  oportunidade_codigo: 'OP-2026-001',
  problema_pesquisa: '',
  hipotese: null,
  objetivo_geral: '',
  objetivos_especificos: [],
  metodologia: '',
  resultados_esperados: '',
  caracterizacao_inovacao: '',
  infraestrutura_recursos: '',
  versao: 1,
  revisada_por_humano: false,
  revisor_nome: null,
}

const PREENCHIDA = {
  ...VAZIA,
  problema_pesquisa: 'Contaminação resistente à pasteurização.',
  objetivo_geral: 'Desenvolver protocolo de detecção rápida.',
  objetivos_especificos: ['Isolar cepas', 'Validar o método'],
  metodologia: 'Cultivo seletivo e PCR.',
  resultados_esperados: 'Protocolo validado.',
  caracterizacao_inovacao: 'De 10 dias para 48 horas.',
  infraestrutura_recursos: 'Laboratório da AC2.',
  revisada_por_humano: true,
  revisor_nome: 'Rafael Antunes',
}

function naoIniciada() {
  const erro = new Error('Esta oportunidade ainda nao tem proposta estruturada.')
  erro.status = 404
  erro.data = { detail: erro.message, codigo: 'proposta_inexistente' }
  return erro
}

function renderAba() {
  return render(<AbaProposta oportunidadeId="OP-2026-001" />)
}

beforeEach(() => {
  auth.user = { role: ROLES.SUPERVISOR, name: 'Rafael Antunes' }
  api.obterProposta = vi.fn().mockResolvedValue(PREENCHIDA)
  api.criarProposta = vi.fn().mockResolvedValue(VAZIA)
  api.atualizarProposta = vi.fn().mockImplementation((_codigo, payload) =>
    Promise.resolve({ ...PREENCHIDA, ...payload })
  )
})

describe('AbaProposta — proposta ainda não iniciada', () => {
  beforeEach(() => {
    api.obterProposta = vi.fn().mockRejectedValue(naoIniciada())
  })

  it('oferece o início ao Supervisor em vez de mostrar falha', async () => {
    renderAba()

    expect(
      await screen.findByRole('button', { name: /iniciar proposta/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).toBeNull()
  })

  it('inicia a proposta e abre o formulário', async () => {
    renderAba()

    await userEvent.click(
      await screen.findByRole('button', { name: /iniciar proposta/i })
    )

    await waitFor(() => expect(api.criarProposta).toHaveBeenCalledWith('OP-2026-001'))
    expect(
      await screen.findByLabelText(/problema de pesquisa/i)
    ).toBeInTheDocument()
  })

  it('não oferece o início ao Pesquisador', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria Ferreira' }
    renderAba()

    await waitFor(() => expect(api.obterProposta).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /iniciar proposta/i })).toBeNull()
    expect(api.criarProposta).not.toHaveBeenCalled()
  })
})

describe('AbaProposta — edição', () => {
  it('guarda o texto digitado, não o evento do campo', async () => {
    renderAba()

    const campo = await screen.findByLabelText(/metodologia/i)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Cultivo seletivo.')

    expect(campo).toHaveValue('Cultivo seletivo.')
  })

  it('envia os oito elementos ao salvar', async () => {
    renderAba()

    const campo = await screen.findByLabelText(/metodologia/i)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Cultivo seletivo.')
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(api.atualizarProposta).toHaveBeenCalled())

    const [, payload] = api.atualizarProposta.mock.calls[0]
    expect(payload.metodologia).toBe('Cultivo seletivo.')
    expect(payload.objetivos_especificos).toEqual(['Isolar cepas', 'Validar o método'])
    expect(payload).not.toHaveProperty('revisada_por_humano')
  })

  it('mostra quem revisou, sem HTML cru na tela', async () => {
    renderAba()

    expect(await screen.findByText(/Rafael Antunes/)).toBeInTheDocument()
    expect(screen.queryByText(/<strong>/)).toBeNull()
  })

  it('não cita sigla de requisito ao usuário', async () => {
    const { container } = renderAba()

    await screen.findByLabelText(/problema de pesquisa/i)
    expect(container.textContent).not.toMatch(/RF\d|PB\d|RN-A\d/)
  })
})

describe('AbaProposta — somente leitura', () => {
  beforeEach(() => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria Ferreira' }
  })

  it('desabilita os campos para quem não é Supervisor', async () => {
    renderAba()

    expect(await screen.findByLabelText(/problema de pesquisa/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull()
  })
})

describe('AbaProposta — revisão do que o Copiloto escreveu', () => {
  const DO_COPILOTO = { ...PREENCHIDA, revisada_por_humano: false, revisor_nome: null }

  /**
   * O Copiloto grava com `revisada_por_humano = False`, e a tela não dizia
   * isso: o texto da IA aparecia igual ao do Supervisor. E o botão salvar só
   * habilitava depois de uma edição, então quem concordava com o texto não
   * tinha como registrar a revisão.
   */
  it('avisa que há texto não revisado e deixa registrar a revisão sem editar', async () => {
    api.obterProposta = vi.fn().mockResolvedValue(DO_COPILOTO)

    renderAba()

    expect(await screen.findByText(/ainda não foram revisadas/i)).toBeInTheDocument()
    expect(screen.getByText('Aguardando revisão')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /salvar como revisada/i }))

    await waitFor(() => expect(api.atualizarProposta).toHaveBeenCalled())
  })

  it('depois de revisada, aponta a próxima etapa', async () => {
    const irPara = vi.fn()
    render(<AbaProposta oportunidadeId="OP-2026-001" irPara={irPara} />)

    await userEvent.click(
      await screen.findByRole('button', { name: /ir para competências/i }),
    )

    expect(irPara).toHaveBeenCalledWith('competencias')
  })

  it('explica cada elemento com uma dica curta', async () => {
    renderAba()

    expect(
      await screen.findByText(/um por linha: os passos concretos/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/objetivos específicos/i)).toHaveAccessibleDescription(
      /um por linha/i,
    )
  })

  it('sem proposta, sugere começar pelo Copiloto', async () => {
    api.obterProposta = vi.fn().mockRejectedValue(naoIniciada())
    const irPara = vi.fn()
    render(<AbaProposta oportunidadeId="OP-2026-001" irPara={irPara} />)

    await userEvent.click(await screen.findByRole('button', { name: /ir para o copiloto/i }))

    expect(irPara).toHaveBeenCalledWith('copiloto')
  })
})
