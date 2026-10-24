import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProblemaFormPage from './ProblemaFormPage'

const auth = { user: { email: 'demandante@valeverde.com.br' }, isAuthenticated: true }

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

const api = vi.hoisted(() => ({
  criarOportunidade: null,
  enviarAnexo: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  criarOportunidade: (...args) => api.criarOportunidade(...args),
  enviarAnexo: (...args) => api.enviarAnexo(...args),
}))

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/problemas/novo']}>
      <Routes>
        <Route path="/problemas/novo" element={<ProblemaFormPage />} />
        <Route path="/problemas" element={<p>Meus problemas</p>} />
      </Routes>
    </MemoryRouter>
  )
}

async function preencher(usuario) {
  await usuario.type(
    screen.getByLabelText(/Título/i), 'Contaminação na linha de envase'
  )
  await usuario.type(
    screen.getByLabelText(/Resumo/i), 'Perdas por contaminação microbiana no lote de verão.'
  )
}

const laudo = () =>
  new File(['%PDF-1.4'], 'laudo.pdf', { type: 'application/pdf' })

beforeEach(() => {
  window.localStorage.clear()
  api.criarOportunidade = vi.fn().mockResolvedValue({ codigo: 'OP-2026-014' })
  api.enviarAnexo = vi.fn().mockResolvedValue({ id_anexo: 1 })
})

describe('ProblemaFormPage — anexos do Demandante (PB21)', () => {
  it('envia os arquivos escolhidos depois de criar o problema', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await preencher(usuario)
    await usuario.upload(screen.getByLabelText(/Selecionar arquivos/i), laudo())
    await usuario.click(screen.getByRole('button', { name: /Cadastrar problema/i }))

    await waitFor(() =>
      expect(api.enviarAnexo).toHaveBeenCalledWith(
        'OP-2026-014', expect.objectContaining({ name: 'laudo.pdf' })
      )
    )
  })

  it('nao promete envio quando nenhum arquivo foi escolhido', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await preencher(usuario)
    await usuario.click(screen.getByRole('button', { name: /Cadastrar problema/i }))

    await waitFor(() => expect(api.criarOportunidade).toHaveBeenCalled())
    expect(api.enviarAnexo).not.toHaveBeenCalled()
  })

  /**
   * O problema existe; perder o anexo nao pode apagar isso da tela. O cadastro
   * e o dado que o Demandante nao consegue refazer sozinho.
   */
  it('o problema continua cadastrado quando o anexo falha', async () => {
    api.enviarAnexo = vi.fn().mockRejectedValue(new Error('arquivo grande demais'))

    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await preencher(usuario)
    await usuario.upload(screen.getByLabelText(/Selecionar arquivos/i), laudo())
    await usuario.click(screen.getByRole('button', { name: /Cadastrar problema/i }))

    expect(
      await screen.findByText(
        /O problema OP-2026-014 foi cadastrado, mas laudo\.pdf não subiu/
      )
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent)
    ).toContain('laudo.pdf')
  })

  it('nao diz mais que nenhum arquivo sai do computador', async () => {
    renderPagina()

    expect(
      screen.queryByText(/Nenhum arquivo sai do seu computador/i)
    ).not.toBeInTheDocument()
  })
})
