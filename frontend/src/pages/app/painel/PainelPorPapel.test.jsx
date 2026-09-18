import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PainelPorPapel from './PainelPorPapel'

const api = vi.hoisted(() => ({
  listOportunidades: null,
  listarRede: null,
  obterMeuPerfil: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listOportunidades: (...args) => api.listOportunidades(...args),
  listarRede: (...args) => api.listarRede(...args),
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
  api.listarRede = vi.fn().mockResolvedValue({ results: [MEMBRO, SEM_COMPETENCIA] })
  api.obterMeuPerfil = vi.fn().mockResolvedValue(MEMBRO)
})

describe('PainelPorPapel — Supervisor', () => {
  it('conta a fila que o servidor devolve, não um exemplo local', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const total = (await screen.findByText('Oportunidades')).closest('.stat-card')
    expect(within(total).getByText('3')).toBeInTheDocument()

    const decisao = screen.getByText('Aguardando sua decisão').closest('.stat-card')
    expect(within(decisao).getByText('1')).toBeInTheDocument()

    const andamento = screen.getByText('Em andamento').closest('.stat-card')
    expect(within(andamento).getByText('2')).toBeInTheDocument()
  })

  it('cada indicador leva à fila que corresponde ao que ele conta', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    await screen.findByText('Oportunidades')

    expect(screen.getByText('Aguardando sua decisão').closest('a'))
      .toHaveAttribute('href', '/oportunidades?situacao=aguardando_decisao')

    expect(screen.getByText('Perfis invisíveis ao matching').closest('a'))
      .toHaveAttribute('href', '/rede')
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

  it('conta os perfis invisíveis pela rede do servidor', async () => {
    renderPainel('supervisor', 'Rafael Antunes')

    const alerta = (await screen.findByText('Perfis invisíveis ao matching')).closest('.stat-card')

    expect(within(alerta).getByText('1')).toBeInTheDocument()
    expect(api.listarRede).toHaveBeenCalledTimes(1)
  })
})

describe('PainelPorPapel — Pesquisador', () => {
  it('mostra onde ele foi indicado, sem fila de decisão', async () => {
    api.listOportunidades = vi.fn().mockResolvedValue({ results: [AGUARDANDO] })

    renderPainel('pesquisador', 'Maria Ferreira')

    expect(await screen.findByText('Oportunidades comigo')).toBeInTheDocument()
    expect(screen.queryByText('Aguardando sua decisão')).not.toBeInTheDocument()
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
