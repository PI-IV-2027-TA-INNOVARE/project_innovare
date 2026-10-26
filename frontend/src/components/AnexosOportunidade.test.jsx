import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnexosOportunidade from './AnexosOportunidade'

const api = vi.hoisted(() => ({ listarAnexos: null, enviarAnexo: null, baixarAnexo: null }))

vi.mock('../services/pdConnectApi', () => ({
  listarAnexos: (...args) => api.listarAnexos(...args),
  enviarAnexo: (...args) => api.enviarAnexo(...args),
  baixarAnexo: (...args) => api.baixarAnexo(...args),
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
  return render(<AnexosOportunidade codigo="OP-2026-001" podeEnviar {...props} />)
}

beforeEach(() => {
  api.listarAnexos = vi.fn().mockResolvedValue([LAUDO])
  api.enviarAnexo = vi.fn().mockResolvedValue({ ...LAUDO, id_anexo: 2 })
})

describe('AnexosOportunidade — leitura', () => {
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

describe('AnexosOportunidade — envio', () => {
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

describe('AnexosOportunidade — download protegido', () => {
  it('baixa o documento pela API, com a sessão, e não por endereço público', async () => {
    const user = userEvent.setup()
    const conteudo = new Blob(['%PDF'], { type: 'application/pdf' })
    api.baixarAnexo = vi.fn().mockResolvedValue({ conteudo, nome: 'laudo.pdf' })
    URL.createObjectURL = vi.fn(() => 'blob:local')
    URL.revokeObjectURL = vi.fn()

    render(<AnexosOportunidade codigo="OP-2026-001" />)

    await user.click(await screen.findByRole('button', { name: `Baixar ${LAUDO.nome_original}` }))

    expect(api.baixarAnexo).toHaveBeenCalledWith('OP-2026-001', LAUDO)
    expect(URL.createObjectURL).toHaveBeenCalledWith(conteudo)
  })

  it('avisa quando o documento não pode ser baixado', async () => {
    const user = userEvent.setup()
    api.baixarAnexo = vi.fn().mockRejectedValue(new Error('Documento não encontrado nesta oportunidade.'))

    render(<AnexosOportunidade codigo="OP-2026-001" />)

    await user.click(await screen.findByRole('button', { name: `Baixar ${LAUDO.nome_original}` }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Documento não encontrado nesta oportunidade.')
  })
})

describe('AnexosOportunidade — tela', () => {
  /**
   * O botão nativo do campo de arquivo saía cinza e apagado, sem o estilo do
   * app. O botão agora é do app e abre o mesmo seletor: o campo nativo segue
   * na página, escondido só da vista, para o teclado e o leitor de tela.
   */
  it('o botão de escolher arquivo é do app e abre o seletor', async () => {
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    const campo = screen.getByLabelText(/anexar documento/i)
    const botao = screen.getByText('Escolher arquivo')

    expect(botao.closest('label')).toHaveAttribute('for', campo.id)
    expect(botao.closest('label')).toHaveClass('admin-btn')
  })

  it('arrastar um arquivo para a área envia igual a escolher', async () => {
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    fireEvent.drop(screen.getByTestId('anexo-envio'), {
      dataTransfer: { files: [arquivo('foto-do-lote.png')] },
    })

    await waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(1))
    expect(api.enviarAnexo.mock.calls[0][1].name).toBe('foto-do-lote.png')
  })

  it('enquanto envia, diz qual arquivo está subindo', async () => {
    const user = userEvent.setup()
    api.enviarAnexo = vi.fn(() => new Promise(() => {}))
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    await user.upload(screen.getByLabelText(/anexar documento/i), arquivo())

    expect(await screen.findByRole('status')).toHaveTextContent('Enviando novo-laudo.pdf...')
    expect(screen.getByLabelText(/anexar documento/i)).toBeDisabled()
  })

  it('mostra o tipo de cada documento e quantos são', async () => {
    renderizar()
    await screen.findByText('laudo-lote-42.pdf')

    expect(screen.getByText('PDF')).toBeInTheDocument()
    expect(screen.getByText('1 documento')).toBeInTheDocument()
  })

  it('diz quem vê os documentos antes de a pessoa anexar', async () => {
    renderizar({ quemVe: 'O Supervisor, a empresa demandante e a equipe indicada.' })
    await screen.findByText('laudo-lote-42.pdf')

    expect(
      screen.getByText('O Supervisor, a empresa demandante e a equipe indicada.')
    ).toBeInTheDocument()
  })

  it('sem documento, quem pode enviar é convidado a anexar o primeiro', async () => {
    api.listarAnexos = vi.fn().mockResolvedValue([])
    renderizar()

    expect(await screen.findByText(/anexe o primeiro/i)).toBeInTheDocument()
  })
})
