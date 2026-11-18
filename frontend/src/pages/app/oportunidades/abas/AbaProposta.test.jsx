import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AbaProposta from './AbaProposta'

const estilos = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'OportunidadesPage.scss'),
  'utf8',
)
import { ROLES } from '../../../../lib/roles'

const auth = { user: null, isAuthenticated: true }

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  obterProposta: null,
  criarProposta: null,
  atualizarProposta: null,
  obterEstadoCopiloto: null,
}))

vi.mock('../../../../services/pdConnectApi', () => ({
  obterProposta: (...args) => api.obterProposta(...args),
  criarProposta: (...args) => api.criarProposta(...args),
  atualizarProposta: (...args) => api.atualizarProposta(...args),
  obterEstadoCopiloto: (...args) => api.obterEstadoCopiloto(...args),
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
  atualizado_em: '2026-10-30T20:42:00-03:00',
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
  api.obterEstadoCopiloto = vi.fn().mockResolvedValue({ lacunas: [] })
})

const PONTO_NA_METODOLOGIA = {
  id_lacuna: 9,
  campo_afetado: 'metodologia',
  natureza: 'pouco_desenvolvido',
  natureza_rotulo: 'Pouco desenvolvido',
  descricao: 'Faltam os controles.',
  recomendacao: 'Descreva o controle positivo e o negativo.',
  severidade: 'media',
  severidade_rotulo: 'Média',
}

describe('AbaProposta — o que o Copiloto apontou', () => {
  /**
   * A aba mostrava os oito elementos iguais, e o que o Copiloto apontou só
   * aparecia na aba dele. Quem revisa precisa ver o ponto ao lado do texto.
   */
  it('mostra no elemento o ponto que o Copiloto deixou aberto', async () => {
    api.obterEstadoCopiloto = vi.fn().mockResolvedValue({ lacunas: [PONTO_NA_METODOLOGIA] })

    renderAba()

    const campo = await screen.findByLabelText(/metodologia/i)

    await waitFor(() => expect(campo).toHaveAccessibleDescription(/faltam os controles/i))
    expect(screen.getByText('Descreva o controle positivo e o negativo.')).toBeInTheDocument()
    expect(screen.getByText(/pouco desenvolvido/i)).toBeInTheDocument()

    const aviso = screen.getByText('Faltam os controles.').closest('[role="note"]')

    expect(aviso).toHaveClass('admin-callout')
    expect(aviso.querySelector('.admin-callout__icon')).not.toBeNull()
    expect(screen.getByLabelText(/problema de pesquisa/i)).not.toHaveAccessibleDescription(
      /copiloto/i,
    )
  })

  it('a falha ao ler os pontos do Copiloto não impede a proposta de abrir', async () => {
    api.obterEstadoCopiloto = vi.fn().mockRejectedValue(new Error('fora do ar'))

    renderAba()

    expect(await screen.findByLabelText(/metodologia/i)).toHaveValue('Cultivo seletivo e PCR.')
    expect(screen.queryByText(/fora do ar/i)).toBeNull()
  })

  it('quem chega por um ponto do Copiloto cai no elemento indicado', async () => {
    const aoFocarCampo = vi.fn()

    render(
      <AbaProposta
        oportunidadeId="OP-2026-001"
        campoEmFoco="metodologia"
        aoFocarCampo={aoFocarCampo}
      />,
    )

    const campo = await screen.findByLabelText(/metodologia/i)

    await waitFor(() => expect(campo).toHaveFocus())
    expect(campo).not.toHaveClass('proposta__texto--recolhido')
    expect(aoFocarCampo).toHaveBeenCalled()
  })
})

describe('AbaProposta — texto longo recolhido', () => {
  const originais = {}

  beforeEach(() => {
    for (const [medida, valor] of [['scrollHeight', 200], ['clientHeight', 48]]) {
      originais[medida] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, medida)
      Object.defineProperty(HTMLElement.prototype, medida, {
        configurable: true,
        get: () => valor,
      })
    }
  })

  afterEach(() => {
    for (const medida of ['scrollHeight', 'clientHeight']) {
      if (originais[medida]) {
        Object.defineProperty(HTMLElement.prototype, medida, originais[medida])
      } else {
        delete HTMLElement.prototype[medida]
      }
    }
  })

  /**
   * Ver o texto inteiro dependia de descobrir que era preciso clicar nele, e
   * o clique já abria a edição. Agora o texto que não cabe nas duas linhas
   * tem um botão para ler tudo, separado de editar.
   */
  it('o texto que não cabe oferece ver tudo sem entrar na edição, e recolher', async () => {
    const user = userEvent.setup()
    renderAba()

    const campo = await screen.findByLabelText(/metodologia/i)
    const ver = screen.getByRole('button', { name: /ver texto completo de metodologia/i })

    expect(ver).toHaveAttribute('aria-expanded', 'false')
    expect(ver).toHaveAttribute('aria-controls', 'metodologia')
    expect(campo.parentElement).toHaveClass('proposta__caixa--cortada')

    await user.click(ver)

    expect(campo).not.toHaveClass('proposta__texto--recolhido')
    expect(campo.parentElement).not.toHaveClass('proposta__caixa--cortada')
    expect(campo).not.toHaveFocus()

    const recolher = screen.getByRole('button', { name: /recolher metodologia/i })
    expect(recolher).toHaveAttribute('aria-expanded', 'true')

    await user.click(recolher)

    expect(campo).toHaveClass('proposta__texto--recolhido')
  })

  it('quem só lê também vê o texto inteiro pelo botão', async () => {
    auth.user = { role: ROLES.PESQUISADOR, name: 'Maria Ferreira' }
    const user = userEvent.setup()
    renderAba()

    const campo = await screen.findByLabelText(/metodologia/i)
    await user.click(screen.getByRole('button', { name: /ver texto completo de metodologia/i }))

    expect(campo).not.toHaveClass('proposta__texto--recolhido')
  })
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

  /**
   * A grade de cartões em duas colunas dos formulários de cadastro punha a
   * legenda sozinha na coluna da esquerda e os campos na da direita.
   */
  it('o formulário da proposta ocupa uma coluna só', async () => {
    const { container } = renderAba()

    await screen.findByText('Revisada por')
    const formulario = container.querySelector('form')

    expect(formulario).toHaveClass('proposta__form')
    expect(formulario).not.toHaveClass('console-form')
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

  it('deixa só ler os campos para quem não é Supervisor', async () => {
    renderAba()

    expect(await screen.findByLabelText(/problema de pesquisa/i)).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull()
  })

  /**
   * O campo recolhido tinha a altura mínima das caixas de texto, que não é
   * múltiplo da linha: o texto saía cortado ao meio, como em "Validar a
   * metodologia…". Agora a altura vem do número de linhas, sem mínimo.
   */
  it('mostra cada elemento preenchido recolhido em três linhas inteiras', async () => {
    renderAba()

    const campo = await screen.findByLabelText(/problema de pesquisa/i)

    expect(campo).toHaveAttribute('rows', '3')
    expect(campo).toHaveClass('proposta__texto--recolhido')

    const inicio = estilos.indexOf('\n.proposta__texto--recolhido {')
    const bloco = estilos.slice(inicio, estilos.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/min-height:\s*0/)
  })

  it('o texto que cabe nas duas linhas não oferece ver tudo', async () => {
    renderAba()

    await screen.findByLabelText(/problema de pesquisa/i)
    expect(screen.queryByRole('button', { name: /ver texto completo/i })).toBeNull()
  })

  it('avisa quem só lê que o texto não foi revisado, sem pedir que salve (RN-IA01)', async () => {
    api.obterProposta = vi
      .fn()
      .mockResolvedValue({ ...PREENCHIDA, revisada_por_humano: false, revisor_nome: null })

    renderAba()

    const aviso = await screen.findByText(/ainda não foram revisadas pelo supervisor/i)

    expect(aviso).not.toHaveTextContent(/salve/i)
  })

  it('quem só lê também abre o texto inteiro clicando nele', async () => {
    const user = userEvent.setup()
    renderAba()

    const campo = await screen.findByLabelText(/problema de pesquisa/i)
    await user.click(campo)

    expect(campo).not.toHaveClass('proposta__texto--recolhido')
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

  it('depois de revisada, o próximo passo fica na barra de ações, ao lado do salvar', async () => {
    const irPara = vi.fn()
    render(<AbaProposta oportunidadeId="OP-2026-001" irPara={irPara} />)

    const barra = await screen.findByRole('group', { name: 'Ações da etapa' })
    expect(within(barra).getByRole('button', { name: /salvar proposta/i })).toBeInTheDocument()

    await userEvent.click(within(barra).getByRole('button', { name: /continuar para competências/i }))

    expect(irPara).toHaveBeenCalledWith('competencias')
  })

  it('diz quando a proposta foi salva', async () => {
    renderAba()

    expect(await screen.findByText(/^Salvo (às|em) .*\d{2}:\d{2}\.$/)).toBeInTheDocument()
  })

  it('com alteração não salva, pede para salvar antes de continuar', async () => {
    render(<AbaProposta oportunidadeId="OP-2026-001" irPara={vi.fn()} />)

    await userEvent.type(await screen.findByLabelText(/hipótese/i), 'Nova hipótese')

    expect(screen.getByText('Há alterações não salvas.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continuar para competências/i })).not.toBeInTheDocument()
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

/**
 * PB66: depois de Continuar ou Arquivar, salvar a proposta é recusado. O
 * Supervisor via o formulário editável, salvava e recebia o erro.
 */
describe('AbaProposta — oportunidade encerrada', () => {
  it('depois de Continuar, o Supervisor só lê a proposta (PB66)', async () => {
    render(<AbaProposta oportunidadeId="OP-2026-001" situacao="continuar" />)

    expect(await screen.findByLabelText(/problema de pesquisa/i)).toHaveAttribute('readonly')
    expect(screen.getByText(/concluiu o fluxo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull()
    expect(screen.queryByText(/ajuste o que precisar e salve/i)).not.toBeInTheDocument()
    expect(screen.getByText(/fica como estava na decisão/i)).toBeInTheDocument()
  })

  it('arquivada sem proposta, não oferece começar', async () => {
    api.obterProposta = vi.fn().mockRejectedValue(naoIniciada())

    render(<AbaProposta oportunidadeId="OP-2026-001" situacao="arquivada" irPara={vi.fn()} />)

    expect(await screen.findByText(/foi arquivada/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ir para o copiloto/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /iniciar proposta/i })).toBeNull()
  })

  it('com o texto sem revisão, diz que a decisão saiu sem ela', async () => {
    api.obterProposta = vi
      .fn()
      .mockResolvedValue({ ...PREENCHIDA, revisada_por_humano: false, revisor_nome: null })

    render(<AbaProposta oportunidadeId="OP-2026-001" situacao="continuar" />)

    expect(
      await screen.findByText(/não foram revisadas antes da decisão/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Não revisada')).toBeInTheDocument()
    expect(screen.queryByText('Aguardando revisão')).not.toBeInTheDocument()
  })
})
