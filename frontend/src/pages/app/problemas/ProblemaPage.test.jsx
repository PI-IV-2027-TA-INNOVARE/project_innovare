import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProblemaPage from './ProblemaPage'

const api = vi.hoisted(() => ({
  obterOportunidade: null,
  listarHistorico: null,
  listarAnexos: null,
  enviarAnexo: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  obterOportunidade: (...args) => api.obterOportunidade(...args),
  listarHistorico: (...args) => api.listarHistorico(...args),
  listarAnexos: (...args) => api.listarAnexos(...args),
  enviarAnexo: (...args) => api.enviarAnexo(...args),
  complementarOportunidade: vi.fn(),
}))

const PROBLEMA = {
  codigo: 'OP-2026-014',
  titulo: 'Bioinsumo para cana-de-açúcar',
  origem: 'externo',
  resumo: 'Resumo.',
  contexto: 'Contexto.',
  demandante_nome: 'Agroindústria Vale Verde',
  responsavel_nome: 'Rafael Antunes',
  situacao: 'entrada',
  total_anexos: 0,
  ultima_decisao: null,
  criada_em: '2026-08-20T10:00:00.000Z',
  atualizada_em: '2026-09-16T10:00:00.000Z',
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/problemas/OP-2026-014']}>
      <Routes>
        <Route path="/problemas/:id" element={<ProblemaPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  api.obterOportunidade = vi.fn().mockResolvedValue(PROBLEMA)
  api.listarHistorico = vi.fn().mockResolvedValue({ results: [] })
  api.listarAnexos = vi.fn().mockResolvedValue([])
  api.enviarAnexo = vi.fn().mockResolvedValue({ id_anexo: 1 })
})

describe('ProblemaPage — custo de abertura', () => {
  /**
   * Mesma forma da tela do Supervisor: o registro e a trilha sao independentes
   * e devem sair juntos. A evidencia e a segunda chamada acontecer enquanto a
   * primeira ainda nao respondeu.
   */
  it('pede o registro e o historico ao mesmo tempo', async () => {
    let liberar
    api.obterOportunidade = vi.fn(
      () => new Promise((resolve) => {
        liberar = resolve
      })
    )

    renderPagina()

    await waitFor(() => expect(api.listarHistorico).toHaveBeenCalledWith('OP-2026-014'))

    liberar(PROBLEMA)
    expect(await screen.findByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
  })

  it('o historico indisponivel nao impede o problema de abrir', async () => {
    api.listarHistorico = vi.fn().mockRejectedValue(new Error('trilha fora do ar'))

    renderPagina()

    expect(await screen.findByText('Bioinsumo para cana-de-açúcar')).toBeInTheDocument()
  })
})


describe('ProblemaPage — cabeçalho, andamento e decisão', () => {
  const comSituacao = (situacao, extra = {}) => {
    api.obterOportunidade = vi.fn().mockResolvedValue({ ...PROBLEMA, situacao, ...extra })
  }

  const andamento = () => screen.findByRole('list', { name: /andamento do problema/i })

  it('carrega o estilo da tela do Supervisor que ela reaproveita', () => {
    /**
     * Cabecalho, historico e selo vem de OportunidadesPage.scss. Sem o import,
     * o estilo so chegava se a pessoa tivesse aberto uma tela do Supervisor -
     * e o Demandante nunca abre: a pagina dele saia sem a linha do tempo.
     */
    const fonte = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ProblemaPage.jsx'),
      'utf8',
    )

    expect(fonte).toContain("import '../oportunidades/OportunidadesPage.scss'")
  })

  it('o cabeçalho segue o da tela do Supervisor: código, situação, origem e atualização', async () => {
    renderPagina()

    await screen.findByRole('heading', { level: 1, name: 'Bioinsumo para cana-de-açúcar' })

    expect(screen.getByText('OP-2026-014')).toBeInTheDocument()
    expect(screen.getByText('Problema externo')).toBeInTheDocument()
    expect(screen.getByText(/^atualizado/i)).toBeInTheDocument()
    expect(screen.getByText(/^cadastrado em/i)).toBeInTheDocument()
  })

  it('a barra de andamento marca as etapas já passadas e a atual', async () => {
    comSituacao('competencias')

    renderPagina()

    const etapas = within(await andamento()).getAllByRole('listitem')

    expect(etapas).toHaveLength(7)
    expect(etapas[0]).toHaveTextContent(/entrada.*concluída/i)
    expect(etapas[1]).toHaveTextContent(/em estruturação.*concluída/i)
    expect(etapas[2]).toHaveAttribute('aria-current', 'step')
    expect(etapas[2]).toHaveTextContent(/competências/i)
    expect(etapas[3]).not.toHaveTextContent(/concluída/i)
    expect(screen.getByText(/análise interna em andamento no núcleo de p&d/i)).toBeInTheDocument()
  })

  it('arquivado mostra a decisão como etapa atual, sem marcar etapas que podem não ter acontecido', async () => {
    comSituacao('arquivada')

    renderPagina()

    const etapas = within(await andamento()).getAllByRole('listitem')

    expect(etapas[6]).toHaveAttribute('aria-current', 'step')
    expect(etapas[6]).toHaveTextContent(/arquivada/i)
    expect(etapas[0]).not.toHaveTextContent(/concluída/i)
  })

  it('continuar conclui todas as etapas e mostra a decisão', async () => {
    comSituacao('continuar')

    renderPagina()

    const etapas = within(await andamento()).getAllByRole('listitem')

    expect(etapas[5]).toHaveTextContent(/concluída/i)
    expect(etapas[6]).toHaveTextContent(/continuar/i)
  })

  it('a decisão vem numa frase no passado, e não num selo que parece botão', async () => {
    comSituacao('arquivada', {
      ultima_decisao: {
        tipo: 'arquivar',
        justificativa: 'Sem equipe que cubra as competências essenciais.',
        registrada_em: '2026-04-17T15:00:00.000Z',
      },
    })

    renderPagina()

    expect(
      await screen.findByText(/o núcleo de p&d decidiu arquivar este problema/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/decisão registrada em 17\/04\/2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/^arquivar$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sem equipe que cubra/i)).not.toBeInTheDocument()
  })

  it('a nota do histórico não contradiz as mudanças de situação que ele mostra', async () => {
    renderPagina()

    expect(
      await screen.findByText(/aqui ficam as mudanças de situação e as decisões/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/competências, matching e pré-análise — não aparece/i)).not.toBeInTheDocument()
  })
})

describe('ProblemaPage — anexos do Demandante (PB21)', () => {
  it('lista os documentos ja vinculados ao problema', async () => {
    api.listarAnexos = vi.fn().mockResolvedValue([
      {
        id_anexo: 1,
        nome_original: 'laudo-lote-42.pdf',
        mime: 'application/pdf',
        tamanho_bytes: 204800,
        enviado_por_nome: 'Agroindústria Vale Verde',
        criado_em: '2026-09-20T10:00:00.000Z',
      },
    ])

    renderPagina()

    expect(await screen.findByText('laudo-lote-42.pdf')).toBeInTheDocument()
    expect(api.listarAnexos).toHaveBeenCalledWith('OP-2026-014')
  })

  it('o Demandante anexa um documento depois do cadastro', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await screen.findByText('Bioinsumo para cana-de-açúcar')
    await usuario.upload(
      screen.getByLabelText(/anexar documento/i),
      new File(['%PDF-1.4'], 'complemento.pdf', { type: 'application/pdf' })
    )

    await waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(1))
    expect(api.enviarAnexo.mock.calls[0][0]).toBe('OP-2026-014')
  })
})
