import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AbaAnexos from './AbaAnexos'

const api = vi.hoisted(() => ({ listarAnexos: null, enviarAnexo: null }))

vi.mock('../../../../services/pdConnectApi', () => ({
  listarAnexos: (...args) => api.listarAnexos(...args),
  enviarAnexo: (...args) => api.enviarAnexo(...args),
}))

const LAUDO = {
  id_anexo: 1,
  nome_original: 'laudo-lote-42.pdf',
  mime: 'application/pdf',
  tamanho_bytes: 204800,
  enviado_por_nome: 'Agroindústria Vale Verde',
  criado_em: '2026-09-20T10:00:00.000Z',
}

function arquivo(nome = 'novo-laudo.pdf', bytes = 1024) {
  const conteudo = new Array(bytes).fill('a').join('')

  return new File([conteudo], nome, { type: 'application/pdf' })
}

function renderizar(props = {}) {
  return render(<AbaAnexos codigo="OP-2026-001" podeEnviar {...props} />)
}

beforeEach(() => {
  api.listarAnexos = vi.fn().mockResolvedValue([LAUDO])
  api.enviarAnexo = vi.fn().mockResolvedValue({ ...LAUDO, id_anexo: 2 })
})

describe('AbaAnexos — leitura', () => {
  it('lista os documentos da oportunidade vindos da API', async () => {
    renderizar()

    expect(await screen.findByText('laudo-lote-42.pdf')).toBeInTheDocument()
    expect(api.listarAnexos).toHaveBeenCalledWith('OP-2026-001')
  })

  it('mostra tamanho legível e quem enviou', async () => {
    renderizar()

    expect(await screen.findByText(/200 KB/)).toBeInTheDocument()
    expect(screen.getByText(/Agroindústria Vale Verde/)).toBeInTheDocument()
  })

  it('sem documento, diz o que a aba guarda em vez de ficar em branco', async () => {
    api.listarAnexos = vi.fn().mockResolvedValue([])
    renderizar()

    expect(await screen.findByText(/nenhum documento/i)).toBeInTheDocument()
  })

  it('avisa quando a lista não carrega, em vez de fingir vazio', async () => {
    api.listarAnexos = vi.fn().mockRejectedValue(new Error('rede fora'))
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não foi possível carregar/i
    )
  })
})

describe('AbaAnexos — envio', () => {
  it('manda o arquivo escolhido e recarrega a lista', async () => {
    const user = userEvent.setup({ delay: null })
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    await user.upload(screen.getByLabelText(/anexar documento/i), arquivo())

    await waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(1))
    expect(api.enviarAnexo.mock.calls[0][0]).toBe('OP-2026-001')
    expect(api.enviarAnexo.mock.calls[0][1].name).toBe('novo-laudo.pdf')
    expect(api.listarAnexos).toHaveBeenCalledTimes(2)
  })

  it('recusa arquivo grande demais sem gastar a viagem até o servidor', async () => {
    const user = userEvent.setup({ delay: null })
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    await user.upload(
      screen.getByLabelText(/anexar documento/i),
      arquivo('gigante.pdf', 11 * 1024 * 1024)
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/10 MB/)
    expect(api.enviarAnexo).not.toHaveBeenCalled()
  })

  it('mostra a recusa do servidor', async () => {
    const user = userEvent.setup({ delay: null })
    api.enviarAnexo = vi.fn().mockRejectedValue(new Error('Tipo de arquivo não aceito.'))
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    await user.upload(screen.getByLabelText(/anexar documento/i), arquivo())

    expect(await screen.findByRole('alert')).toHaveTextContent(/não aceito/i)
  })

  it('quem não conduz a oportunidade lê sem campo de envio', async () => {
    renderizar({ podeEnviar: false })
    await screen.findByText('laudo-lote-42.pdf')

    expect(screen.queryByLabelText(/anexar documento/i)).not.toBeInTheDocument()
  })
})
