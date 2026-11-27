import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProblemaFormPage from './ProblemaFormPage'

const auth = {
  user: { email: 'demandante@valeverde.com.br', displayName: 'Agroindústria Vale Verde' },
  isAuthenticated: true,
}

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

const foto = () =>
  new File(['png'], 'foto-do-lote.png', { type: 'image/png' })

function arquivo(nome, bytes, type = 'application/pdf') {
  return new File([new Array(bytes).fill('a').join('')], nome, { type })
}

const campoDeAnexo = () => screen.getByLabelText(/anexar documentos/i)

const cadastrar = (usuario) =>
  usuario.click(screen.getByRole('button', { name: /Cadastrar problema/i }))

beforeEach(() => {
  window.localStorage.clear()
  api.criarOportunidade = vi.fn().mockResolvedValue({ codigo: 'OP-2026-014' })
  api.enviarAnexo = vi.fn().mockResolvedValue({ id_anexo: 1 })
})

describe('ProblemaFormPage — campos obrigatórios', () => {
  it('marca título e resumo como obrigatórios e explica o asterisco', () => {
    renderPagina()

    expect(screen.getByLabelText(/^Título/)).toBeRequired()
    expect(screen.getByLabelText(/resumo do problema/i)).toBeRequired()
    expect(screen.getByText('Campos com * são obrigatórios.')).toBeInTheDocument()
  })

  /**
   * A frase usava o estilo da tela de Oportunidades, que o Demandante nao
   * abre: chegava sem estilo, maior e mais escura que o resto da pagina.
   */
  it('a frase do asterisco usa o estilo comum dos formulários', () => {
    renderPagina()

    expect(screen.getByText('Campos com * são obrigatórios.')).toHaveClass('console-form__legenda')
  })

  /**
   * O botao de cadastrar fica no fim da pagina e os avisos aparecem la em
   * cima: no celular, o toque parecia nao fazer nada.
   */
  it('sem título, leva o foco ao título', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await cadastrar(usuario)

    expect(screen.getByLabelText(/^Título/)).toHaveFocus()
    expect(api.criarOportunidade).not.toHaveBeenCalled()
  })

  it('com título e sem resumo, leva o foco ao resumo', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await usuario.type(screen.getByLabelText(/^Título/), 'Contaminação na linha de envase')
    await cadastrar(usuario)

    expect(screen.getByLabelText(/resumo do problema/i)).toHaveFocus()
  })
})

describe('ProblemaFormPage — quem cadastra', () => {
  /**
   * Um cartao inteiro guardava um campo que nao se edita: parecia algo a
   * preencher e deixava um vazio ao lado do problema.
   */
  it('diz em nome de quem o problema é cadastrado, sem campo para preencher', () => {
    renderPagina()

    expect(screen.getByText(/Cadastrando como/)).toHaveTextContent(
      'Cadastrando como Agroindústria Vale Verde. Só a sua organização e o Núcleo de P&D veem este registro.'
    )
    expect(screen.queryByLabelText(/Organização demandante/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Quem está cadastrando' })).not.toBeInTheDocument()
  })
})

describe('ProblemaFormPage — anexos do Demandante (PB21)', () => {
  it('envia os arquivos escolhidos depois de criar o problema', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await preencher(usuario)
    await usuario.upload(campoDeAnexo(), laudo())
    await cadastrar(usuario)

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
    await cadastrar(usuario)

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
    await usuario.upload(campoDeAnexo(), laudo())
    await cadastrar(usuario)

    expect(
      await screen.findByText(
        /O problema OP-2026-014 foi cadastrado, mas laudo\.pdf não subiu/
      )
    ).toBeInTheDocument()
    expect(screen.getByText('laudo.pdf')).toBeInTheDocument()
  })

  it('nao diz mais que nenhum arquivo sai do computador', async () => {
    renderPagina()

    expect(
      screen.queryByText(/Nenhum arquivo sai do seu computador/i)
    ).not.toBeInTheDocument()
  })
})

describe('ProblemaFormPage — anexos no padrão das outras telas', () => {
  /**
   * O cadastro usava o campo de arquivo do navegador; o acompanhamento do
   * problema e a conducao da oportunidade usam a area de arrastar com o
   * botao do app.
   */
  it('usa a área de arrastar e o botão do app', () => {
    renderPagina()

    const campo = campoDeAnexo()

    expect(screen.getByTestId('anexo-envio')).toContainElement(campo)
    expect(screen.getByText('Escolher arquivos').closest('label')).toHaveAttribute('for', campo.id)
    expect(screen.getByText('Escolher arquivos').closest('label')).toHaveClass('admin-btn')
    expect(campo).toHaveAttribute('multiple')
  })

  /**
   * O campo do navegador troca a escolha inteira: quem anexava um arquivo e
   * depois outro ficava so com o ultimo, sem aviso.
   */
  it('escolher arquivos de novo soma à lista em vez de trocar a escolha', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await usuario.upload(campoDeAnexo(), laudo())
    await usuario.upload(campoDeAnexo(), foto())

    expect(screen.getByText('laudo.pdf')).toBeInTheDocument()
    expect(screen.getByText('foto-do-lote.png')).toBeInTheDocument()

    await preencher(usuario)
    await cadastrar(usuario)

    await waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(2))
  })

  it('o mesmo arquivo escolhido duas vezes entra uma vez só', async () => {
    const usuario = userEvent.setup({ delay: null })
    const mesmo = laudo()
    renderPagina()

    await usuario.upload(campoDeAnexo(), mesmo)
    await usuario.upload(campoDeAnexo(), mesmo)

    expect(screen.getAllByText('laudo.pdf')).toHaveLength(1)
  })

  it('arrastar arquivos para a área soma à lista', () => {
    renderPagina()

    fireEvent.drop(screen.getByTestId('anexo-envio'), {
      dataTransfer: { files: [laudo(), foto()] },
    })

    expect(screen.getByText('laudo.pdf')).toBeInTheDocument()
    expect(screen.getByText('foto-do-lote.png')).toBeInTheDocument()
  })

  it('cada arquivo pode sair da lista antes do cadastro', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await usuario.upload(campoDeAnexo(), [laudo(), foto()])
    await usuario.click(screen.getByRole('button', { name: 'Remover laudo.pdf' }))

    expect(screen.queryByText('laudo.pdf')).not.toBeInTheDocument()

    await preencher(usuario)
    await cadastrar(usuario)

    await waitFor(() => expect(api.enviarAnexo).toHaveBeenCalledTimes(1))
    expect(api.enviarAnexo.mock.calls[0][1].name).toBe('foto-do-lote.png')
  })

  it('mostra o tipo, o tamanho e quantos são', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await usuario.upload(campoDeAnexo(), arquivo('ensaio.pdf', 2048))

    const item = screen.getByText('ensaio.pdf').closest('li')

    expect(within(item).getByText('PDF')).toBeInTheDocument()
    expect(within(item).getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByText('1 documento')).toBeInTheDocument()
  })

  it('arquivo acima de 10 MB fica de fora, com o aviso no bloco de anexos', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderPagina()

    await usuario.upload(campoDeAnexo(), arquivo('gigante.pdf', 11 * 1024 * 1024))

    const alerta = screen.getByRole('alert')

    expect(alerta).toHaveTextContent('gigante.pdf passa de 10 MB e ficou de fora.')
    expect(within(alerta.closest('section')).getByRole('heading', { name: 'Anexos' })).toBeInTheDocument()
    expect(screen.queryByText('gigante.pdf')).not.toBeInTheDocument()
  })

  /**
   * Arrastar nao passa pelo filtro do seletor. Sem esta conferencia, o
   * arquivo so seria recusado depois do cadastro.
   */
  it('arquivo de tipo não aceito fica de fora, com aviso', () => {
    renderPagina()

    fireEvent.drop(screen.getByTestId('anexo-envio'), {
      dataTransfer: { files: [arquivo('programa.exe', 10, 'application/octet-stream')] },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'programa.exe não é de um tipo aceito e ficou de fora.'
    )
    expect(screen.queryByText('programa.exe')).not.toBeInTheDocument()
  })

  /**
   * Os tipos aceitos e o limite apareciam na descricao do cartao e de novo
   * no aviso. Cada informacao fica num lugar so.
   */
  it('tipos aceitos e limite de tamanho aparecem uma vez só', () => {
    renderPagina()

    expect(screen.getAllByText(/10 MB/)).toHaveLength(1)
    expect(screen.getByText(/A seleção não entra no rascunho/)).toBeInTheDocument()
  })
})
