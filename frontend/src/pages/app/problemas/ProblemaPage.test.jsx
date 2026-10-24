import { render, screen, waitFor } from '@testing-library/react'
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
