import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PainelPorPapel from './PainelPorPapel'

const api = vi.hoisted(() => ({
  listOportunidades: null,
  obterResumoDaRede: null,
  obterMeuPerfil: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: (...args) => api.listOportunidades(...args),
  obterResumoDaRede: (...args) => api.obterResumoDaRede(...args),
  obterMeuPerfil: (...args) => api.obterMeuPerfil(...args),
}))

const BASE = {
  origem: 'externo',
  resumo: 'Resumo.',
  contexto: '',
  demandante_nome: 'Agroindústria Vale Verde',
  responsavel_nome: 'Rafael Antunes',
  total_anexos: 0,
  ultima_decisao: null,
  criada_em: '2026-08-20T10:00:00.000Z',
  atualizada_em: '2026-09-16T10:00:00.000Z',
}

const AGUARDANDO = {
  ...BASE,
  codigo: 'OP-2026-014',
  titulo: 'Bioinsumo para cana-de-açúcar',
  situacao: 'aguardando_decisao',
}

const ESTRUTURACAO = {
  ...BASE,
  codigo: 'OP-2026-011',
  titulo: 'Cultura starter para queijo artesanal',
  origem: 'interna',
  demandante_nome: null,
  situacao: 'estruturacao',
}

const CONTINUAR = {
  ...BASE,
  codigo: 'OP-2026-009',
  titulo: 'Redução de nitrito em embutidos',
  situacao: 'continuar',
}

const REVISAR = {
  ...BASE,
  codigo: 'OP-2026-012',
  titulo: 'Vida de prateleira de suco integral',
  situacao: 'revisar',
}

const MEMBRO = {
  id_membro: 1,
  nome: 'Maria Ferreira',
  email: 'maria.ferreira@ac2microbiologia.com.br',
  papel_rede: 'pesquisador',
  titulacao_codigo: 'doutorado',
  disponibilidade: 'parcial',
  experiencia: '',
  situacao: 'ativo',
  competencias: ['Microbiologia de alimentos'],
  tecnicas: ['PCR em tempo real'],
  linhas: ['Bioinsumos agrícolas'],
  tem_acesso: true,
}

const SEM_COMPETENCIA = { ...MEMBRO, id_membro: 7, nome: 'Bancada 2', competencias: [] }

function renderPainel(role, displayName) {
  return render(
    <MemoryRouter>
      <PainelPorPapel user={{ role, displayName }} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  api.listOportunidades = vi.fn().mockResolvedValue({
    results: [AGUARDANDO, ESTRUTURACAO, CONTINUAR],
  })
  api.obterResumoDaRede = vi.fn().mockResolvedValue({ total: 2, ativos: 1, titulados: 1, sem_competencia: 1 })
  api.obterMeuPerfil = vi.fn().mockResolvedValue(MEMBRO)
})

describe('PainelPorPapel — Supervisor', () => {
  it('conta a fila inteira, mesmo quando ela passa de uma página da API', async () => {
    /**
     * A API entrega no máximo 100 oportunidades por página, e o Painel lia só
     * a primeira: da 101ª em diante, nada entrava nos indicadores.
     */
    api.listOportunidades = vi
      .fn()
      .mockResolvedValueOnce({ count: 3, next: '/?page=2', results: [AGUARDANDO, ESTRUTURACAO] })
      .mockResolvedValueOnce({ count: 3, next: null, results: [CONTINUAR] })

    renderPainel('supervisor', 'Rafael Antunes')

    const total = (await screen.findByText('Oportunidades')).closest('.stat-card')

    expect(await within(total).findByText('3')).toBeInTheDocument()
    expect(api.listOportunidades).toHaveBeenCalledTimes(2)
  })

  it('conta a fila que o servidor devolve, não um exemplo local', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const total = (await screen.findByText('Oportunidades')).closest('.stat-card')
    expect(within(total).getByText('3')).toBeInTheDocument()

    const decisao = screen.getByText('Aguardando decisão', { selector: '.stat-card__label' }).closest('.stat-card')
    expect(within(decisao).getByText('1')).toBeInTheDocument()

    const andamento = screen.getByText('Em andamento', { selector: '.stat-card__label' }).closest('.stat-card')
    expect(within(andamento).getByText('2')).toBeInTheDocument()
  })

  it('cada indicador diz o que conta, sem deixar o período e a causa para deduzir', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const total = (await screen.findByText('Oportunidades')).closest('.stat-card')
    expect(total).toHaveTextContent('Todas as cadastradas, inclusive as decididas')

    const invisiveis = screen.getByText('Perfis invisíveis ao matching').closest('.stat-card')
    expect(invisiveis).toHaveTextContent('Sem competência declarada — o matching não os encontra')
  })

  it('cada indicador leva à fila que corresponde ao que ele conta', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    await screen.findByText('Oportunidades')

    expect(screen.getByText('Em andamento', { selector: '.stat-card__label' }).closest('a'))
      .toHaveAttribute('href', '/oportunidades?situacao=em_andamento')

    expect(screen.getByText('Aguardando decisão', { selector: '.stat-card__label' }).closest('a'))
      .toHaveAttribute('href', '/oportunidades?situacao=aguardando_decisao')

    expect(screen.getByText('Perfis invisíveis ao matching').closest('a'))
      .toHaveAttribute('href', '/rede?sem_competencia=1')
  })

  it('agrupa por etapa com os números do servidor e abre a fila filtrada', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const etapas = (await screen.findByRole('heading', { name: /oportunidades por etapa/i }))
      .closest('.painel-secao')

    const aguardando = within(etapas).getByText('Aguardando decisão').closest('a')
    expect(aguardando).toHaveAttribute('href', '/oportunidades?situacao=aguardando_decisao')
    expect(within(aguardando).getByText('1')).toBeInTheDocument()

    expect(within(etapas).getByText('Em estruturação')).toBeInTheDocument()
    expect(within(etapas).queryByText('Competências')).not.toBeInTheDocument()
  })

  it('separa as etapas em andamento das que já tiveram decisão', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const etapas = (await screen.findByRole('heading', { name: /oportunidades por etapa/i }))
      .closest('.painel-secao')

    const grupo = (nome) =>
      within(etapas).getByRole('heading', { name: nome }).closest('.painel-etapas-grupo')

    expect(within(grupo('Em andamento')).getByText('Aguardando decisão')).toBeInTheDocument()
    expect(within(grupo('Em andamento')).getByText('Em estruturação')).toBeInTheDocument()
    expect(within(grupo('Em andamento')).queryByText('Continuar')).not.toBeInTheDocument()

    expect(within(grupo('Decididas')).getByText('Continuar')).toBeInTheDocument()
    expect(within(grupo('Decididas')).queryByText('Em estruturação')).not.toBeInTheDocument()
  })

  it('não mostra o grupo das decididas enquanto nenhuma teve decisão', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO, ESTRUTURACAO] })

    renderPainel('supervisor', 'Rafael Antunes')

    const etapas = (await screen.findByRole('heading', { name: /oportunidades por etapa/i }))
      .closest('.painel-secao')

    expect(within(etapas).getByRole('heading', { name: 'Em andamento' })).toBeInTheDocument()
    expect(within(etapas).queryByRole('heading', { name: 'Decididas' })).not.toBeInTheDocument()
  })

  /**
   * A fila chega da atualizacao mais recente para a mais antiga, e o painel
   * pegava as tres primeiras: as que esperavam havia mais tempo ficavam de fora.
   */
  it('lista primeiro as decisões paradas há mais tempo e diz quantas ficaram de fora', async () => {
    const aguardando = (codigo, titulo, atualizadaEm) => ({
      ...AGUARDANDO,
      codigo,
      titulo,
      atualizada_em: atualizadaEm,
    })

    api.listOportunidades = vi.fn().mockResolvedValue({
      results: [
        aguardando('OP-2026-021', 'Mais recente', '2026-09-20T10:00:00.000Z'),
        aguardando('OP-2026-020', 'Quarta mais antiga', '2026-09-15T10:00:00.000Z'),
        aguardando('OP-2026-019', 'Terceira mais antiga', '2026-09-10T10:00:00.000Z'),
        aguardando('OP-2026-018', 'Segunda mais antiga', '2026-09-05T10:00:00.000Z'),
        aguardando('OP-2026-017', 'Mais antiga', '2026-09-01T10:00:00.000Z'),
      ],
    })

    renderPainel('supervisor', 'Rafael Antunes')

    const secao = (await screen.findByRole('heading', { name: 'Esperando decisão' }))
      .closest('.painel-secao')

    const titulos = [...secao.querySelectorAll('.painel-lista__titulo')].map((item) => item.textContent)

    expect(titulos).toEqual(['Mais antiga', 'Segunda mais antiga', 'Terceira mais antiga'])
    expect(secao).toHaveTextContent(
      'Mostrando as 3 que estão há mais tempo sem atualização, de 5 aguardando decisão.'
    )
  })

  it('não fala em "ficaram de fora" quando todas as que esperam decisão cabem na lista', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const secao = (await screen.findByRole('heading', { name: 'Esperando decisão' }))
      .closest('.painel-secao')

    expect(within(secao).getByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
    expect(secao).not.toHaveTextContent(/Mostrando as/)
  })

  /**
   * Toda oportunidade dessa lista esta aguardando decisao, e o titulo da secao
   * ja diz isso. No celular, a etiqueta repetida ocupava quase metade da linha
   * e espremia o titulo em tres linhas.
   */
  it('a lista de decisões não repete em cada item a situação que o título já diz', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const secao = (await screen.findByRole('heading', { name: 'Esperando decisão' }))
      .closest('.painel-secao')

    expect(within(secao).getByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
    expect(secao.querySelector('.fluxo-badge')).toBeNull()
  })

  it('conta os perfis invisíveis pela rede do servidor', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const alerta = (await screen.findByText('Perfis invisíveis ao matching')).closest('.stat-card')

    expect(within(alerta).getByText('1')).toBeInTheDocument()
    expect(api.obterResumoDaRede).toHaveBeenCalledTimes(1)
  })
})

describe('PainelPorPapel — Pesquisador', () => {
  it('mostra onde ele foi indicado, sem fila de decisão', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO] })

    renderPainel('pesquisador', 'Maria Ferreira')

    expect(await screen.findByText('Oportunidades comigo')).toBeInTheDocument()
    expect(screen.queryByText('Aguardando decisão', { selector: '.stat-card__label' })).not.toBeInTheDocument()
    expect(screen.getByText(/não há convite para aceitar ou recusar/i)).toBeInTheDocument()
  })

  it('mede a completude pelo perfil que a API devolve', async () => {
    renderPainel('pesquisador', 'Maria Ferreira')

    const perfil = (await screen.findByText('Perfil completo')).closest('.stat-card')

    expect(within(perfil).getByText('83%')).toBeInTheDocument()
    expect(perfil).toHaveAttribute('href', '/perfil')
  })

  it('não quebra quando a conta ainda não tem cadastro na rede', async () => {
    api.obterMeuPerfil = vi.fn().mockRejectedValue(new Error('Sem cadastro.'))

    renderPainel('pesquisador', 'Maria Ferreira')

    const perfil = (await screen.findByText('Perfil completo')).closest('.stat-card')
    expect(within(perfil).getByText('0%')).toBeInTheDocument()
  })
})

describe('PainelPorPapel — Demandante', () => {
  it('conta e lista os próprios registros, com link para o problema', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO, REVISAR] })

    renderPainel('demandante', 'Agroindústria Vale Verde')

    const cadastrados = (await screen.findByText('Problemas cadastrados')).closest('.stat-card')
    expect(within(cadastrados).getByText('2')).toBeInTheDocument()

    const aguardando = screen.getByText('Aguardando você').closest('.stat-card')
    expect(within(aguardando).getByText('1')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /bioinsumo/i }))
      .toHaveAttribute('href', '/problemas/OP-2026-014')
  })

  it('a lista do Demandante mostra a situação de cada problema', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO, REVISAR] })

    renderPainel('demandante', 'Agroindústria Vale Verde')

    const secao = (await screen.findByRole('heading', { name: 'Seus problemas' }))
      .closest('.painel-secao')

    expect(within(secao).getByText('Revisar', { selector: '.fluxo-badge' })).toBeInTheDocument()
    expect(within(secao).getByText('Aguardando decisão', { selector: '.fluxo-badge' })).toBeInTheDocument()
  })

  it('o indicador "Aguardando você" abre a lista já filtrada', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [REVISAR] })

    renderPainel('demandante', 'Agroindústria Vale Verde')

    expect((await screen.findByText('Aguardando você')).closest('a'))
      .toHaveAttribute('href', '/problemas?situacao=revisar')
  })

  it('não usa a rota do Supervisor para o registro do Demandante', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO] })

    renderPainel('demandante', 'Agroindústria Vale Verde')

    const link = await screen.findByRole('link', { name: /bioinsumo/i })

    expect(link).not.toHaveAttribute('href', '/oportunidades/OP-2026-014')
  })
})

describe('PainelPorPapel — estados', () => {
  it('não inventa painel para o Administrador, que tem o console', () => {
    const { container } = renderPainel('administrador', 'Administração da plataforma')

    expect(container).toBeEmptyDOMElement()
    expect(api.listOportunidades).not.toHaveBeenCalled()
  })

  it('avisa e oferece nova tentativa quando a API falha', async () => {
    const user = userEvent.setup()
    api.listOportunidades = vi.fn().mockRejectedValue(new Error('Sessão expirada.'))

    renderPainel('supervisor', 'Rafael Antunes')

    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada.')

    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO] })
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    expect(await screen.findByText('Oportunidades')).toBeInTheDocument()
  })
})

describe('PainelPorPapel — custo de abertura', () => {
  /**
   * O painel pede duas coisas ao servidor, e elas nao dependem uma da outra.
   *
   * Em serie, o tempo de abrir a tela e a soma das duas idas; em paralelo, a
   * maior das duas. Com a API na mesma maquina a diferenca se perde no ruido;
   * com o banco do outro lado da internet, cada ida custa a conexao mais a
   * consulta, e a espera dobra sem que nenhuma linha pareca errada.
   *
   * O caso afirma a simultaneidade pela unica evidencia que nao depende de
   * cronometro: a segunda chamada acontece **enquanto** a primeira ainda nao
   * respondeu.
   */
  function pendente() {
    let resolver
    const promessa = new Promise((resolve) => {
      resolver = resolve
    })

    return { promessa, resolver }
  }

  it('pede a fila e a rede ao mesmo tempo', async () => {
    const fila = pendente()
    api.listOportunidades = vi.fn(() => fila.promessa)

    renderPainel('supervisor', 'Rafael Antunes')

    await waitFor(() => expect(api.obterResumoDaRede).toHaveBeenCalled())

    fila.resolver({ results: [AGUARDANDO] })
    await screen.findByText('Oportunidades')
  })

  it('pede a fila e o proprio perfil ao mesmo tempo', async () => {
    const fila = pendente()
    api.listOportunidades = vi.fn(() => fila.promessa)

    renderPainel('pesquisador', 'Maria Ferreira')

    await waitFor(() => expect(api.obterMeuPerfil).toHaveBeenCalled())

    fila.resolver({ results: [AGUARDANDO] })
    await screen.findByText('Oportunidades comigo')
  })

  it('o painel do Supervisor nao pede o perfil de pesquisador', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    await screen.findByText('Oportunidades')

    expect(api.obterMeuPerfil).not.toHaveBeenCalled()
  })
})
