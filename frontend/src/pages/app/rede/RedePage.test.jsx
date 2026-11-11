import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RedeFormPage from './RedeFormPage'
import RedePage from './RedePage'
import {
  completudeDoPerfil,
  formacoesDaApi,
  formacoesParaApi,
  titulacaoLabel,
} from './redeData'

const api = vi.hoisted(() => ({
  listarRede: null,
  obterResumoDaRede: null,
  obterMembroRede: null,
  criarMembroRede: null,
  atualizarMembroRede: null,
  liberarAcessoMembro: null,
  inativarMembro: null,
  reativarMembro: null,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listarRede: (...args) => api.listarRede(...args),
  obterResumoDaRede: (...args) => api.obterResumoDaRede(...args),
  obterMembroRede: (...args) => api.obterMembroRede(...args),
  criarMembroRede: (...args) => api.criarMembroRede(...args),
  atualizarMembroRede: (...args) => api.atualizarMembroRede(...args),
  liberarAcessoMembro: (...args) => api.liberarAcessoMembro(...args),
  inativarMembro: (...args) => api.inativarMembro(...args),
  reativarMembro: (...args) => api.reativarMembro(...args),
}))

const MARIA = {
  id_membro: 1,
  nome: 'Maria Ferreira',
  email: 'maria.ferreira@ac2microbiologia.com.br',
  papel_rede: 'pesquisador',
  titulacao_codigo: 'doutorado',
  organizacao_nome: 'AC2 Microbiologia',
  disponibilidade: 'parcial',
  experiencia: '11 anos em pesquisa aplicada de bioinsumos.',
  situacao: 'ativo',
  competencias: ['Microbiologia de alimentos', 'Fermentação'],
  tecnicas: ['PCR em tempo real'],
  linhas: ['Bioinsumos agrícolas'],
  tem_acesso: true,
}

const HELENA = {
  ...MARIA,
  id_membro: 3,
  nome: 'Helena Torres',
  email: 'helena.torres@ac2microbiologia.com.br',
  titulacao_codigo: 'mestrado',
  competencias: ['Biologia molecular', 'Bioinformática'],
  tecnicas: ['Sequenciamento'],
  linhas: ['Microbiota de solo'],
}

const CARLA = {
  ...MARIA,
  id_membro: 5,
  nome: 'Carla Nogueira',
  email: 'carla.nogueira@ac2microbiologia.com.br',
  situacao: 'sem_acesso',
  competencias: ['Química analítica'],
  tecnicas: [],
  linhas: [],
  tem_acesso: false,
}

const PEDRO = {
  ...MARIA,
  id_membro: 6,
  nome: 'Pedro Salgado',
  email: 'pedro.salgado@ac2microbiologia.com.br',
  titulacao_codigo: 'graduacao',
  competencias: ['Cultivo microbiano'],
  tecnicas: [],
  linhas: [],
}

const BANCADA = {
  ...MARIA,
  id_membro: 7,
  nome: 'Núcleo de P&D — Bancada 2',
  email: 'bancada2@ac2microbiologia.com.br',
  titulacao_codigo: 'graduacao',
  situacao: 'inativo',
  competencias: [],
  tecnicas: [],
  linhas: [],
  tem_acesso: false,
}

const REDE = [MARIA, HELENA, CARLA, PEDRO, BANCADA]

function renderRede(rota = '/rede') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/rede" element={<RedePage />} />
        <Route path="/rede/novo" element={<RedeFormPage />} />
        <Route path="/rede/:id" element={<RedeFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarLista() {
  await screen.findByText('Maria Ferreira', {}, { timeout: 2000 })
}

const NIVEL = { graduacao: 1, mestrado: 3, doutorado: 4 }

function redeDoServidor(params = {}) {
  const termo = (params.busca || '').toLowerCase()
  const achados = REDE.filter(
    (pessoa) =>
      !termo ||
      pessoa.nome.toLowerCase().includes(termo) ||
      pessoa.competencias.some((competencia) => competencia.toLowerCase().includes(termo)),
  )
  const ordenados =
    params.ordenar === 'titulacao'
      ? [...achados].sort((a, b) => NIVEL[a.titulacao_codigo] - NIVEL[b.titulacao_codigo])
      : achados

  return Promise.resolve({ count: ordenados.length, results: ordenados })
}

beforeEach(() => {
  api.listarRede = vi.fn(redeDoServidor)
  api.obterResumoDaRede = vi.fn().mockResolvedValue({
    total: 5,
    ativos: 2,
    titulados: 2,
    sem_competencia: 1,
  })
  api.obterMembroRede = vi.fn().mockResolvedValue(MARIA)
  api.criarMembroRede = vi.fn().mockResolvedValue({ ...CARLA, id_membro: 9 })
  api.atualizarMembroRede = vi.fn().mockResolvedValue(MARIA)
  api.liberarAcessoMembro = vi.fn().mockResolvedValue({ ...CARLA, situacao: 'ativo', tem_acesso: true })
  api.inativarMembro = vi.fn().mockResolvedValue({ ...MARIA, situacao: 'inativo' })
  api.reativarMembro = vi.fn().mockResolvedValue({ ...BANCADA, situacao: 'sem_acesso' })
})

describe('RedePage', () => {
  it('conta quantos perfis estão invisíveis para o matching', async () => {
    renderRede()
    await esperarLista()

    const alerta = screen.getByText('Sem competência declarada').closest('.stat-card')
    expect(within(alerta).getByText('1')).toBeInTheDocument()

    const linha = screen.getByText('Núcleo de P&D — Bancada 2').closest('tr')
    expect(within(linha).getByText(/invisível ao matching/i)).toBeInTheDocument()
  })

  it('busca também por competência, não só por nome', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar na rede interna/i), 'bioinformática')

    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(
        expect.objectContaining({ busca: 'bioinformática', page: 1 }),
      ),
    )
    expect(await screen.findByText('Helena Torres')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Maria Ferreira')).not.toBeInTheDocument())
  })

  it('ordena por titulação pela hierarquia, não pelo alfabeto', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /ordenar por titulação/i }))

    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(
        expect.objectContaining({ ordenar: 'titulacao' }),
      ),
    )
    await waitFor(() =>
      expect(['Pedro Salgado', 'Núcleo de P&D — Bancada 2']).toContain(
        document.querySelectorAll('.user-cell__name')[0].textContent,
      ),
    )
    const primeiro = document.querySelectorAll('.user-cell__name')[0].textContent
    expect(['Pedro Salgado', 'Núcleo de P&D — Bancada 2']).toContain(primeiro)
  })

  /**
   * A tela pedia 100 pessoas e contava no navegador: da 101a em diante, a
   * pessoa sumia da lista, da busca e dos números do topo sem aviso.
   */
  it('mostra a rede em páginas de 25 e pede a próxima à API', async () => {
    const user = userEvent.setup()
    api.listarRede = vi.fn().mockResolvedValue({ count: 45, results: REDE })
    renderRede()
    await esperarLista()

    expect(api.listarRede).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 25 }))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /próxima página/i }))

    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    )
  })

  it('ir para a próxima página logo ao abrir não volta sozinho para a página 1', async () => {
    /**
     * A busca espera 300 ms depois da última tecla e então volta à página 1.
     * Essa espera também corria ao abrir a tela, sem ninguém ter digitado:
     * quem passava de página antes dela era jogado de volta para a primeira.
     * Era isso que derrubava, de vez em quando, o teste acima.
     */
    const user = userEvent.setup()
    api.listarRede = vi.fn().mockResolvedValue({ count: 45, results: REDE })
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /próxima página/i }))
    expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
    expect(api.listarRede).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('"Todos" busca a rede inteira, página por página da API, e mostra numa só', async () => {
    /**
     * A paginação da Rede é feita pela API, que entrega no máximo 100 pessoas
     * por vez. "Todos" segue as páginas até a última e junta as pessoas.
     */
    const user = userEvent.setup()
    api.listarRede = vi.fn(async (params) => {
      if (params.page_size !== 100) return { count: REDE.length, results: REDE.slice(0, 2) }

      return params.page === '1'
        ? { count: REDE.length, next: '/?page=2', results: REDE.slice(0, 3) }
        : { count: REDE.length, next: null, results: REDE.slice(3) }
    })
    renderRede()
    await esperarLista()

    const seletor = screen.getByLabelText(/linhas por página/i)

    expect(seletor).toHaveDisplayValue('25')
    expect(within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      '10',
      '25',
      '50',
      'Todos',
    ])

    await user.selectOptions(seletor, 'Todos')

    expect(
      await screen.findByText(`Mostrando 1–${REDE.length} de ${REDE.length}`),
    ).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument()
    expect(api.listarRede).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: '2', page_size: 100 }),
    )
  })

  it('aberta pelo Painel, mostra só quem não declarou competência', async () => {
    /**
     * "Perfis invisíveis ao matching", no Painel, levava à rede inteira. O
     * link agora abre a Rede já recortada em quem não declarou competência,
     * que é exatamente o que o número do Painel conta.
     */
    renderRede('/rede?sem_competencia=1')
    await esperarLista()

    expect(api.listarRede).toHaveBeenCalledWith(
      expect.objectContaining({ sem_competencia: 'true' }),
    )
    expect(screen.getByRole('button', { name: /sem competência declarada/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('o recorte de quem não declarou competência liga, desliga e sai com "Limpar filtros"', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const recorte = screen.getByRole('button', { name: /sem competência declarada/i })

    expect(recorte).toHaveAttribute('aria-pressed', 'false')

    await user.click(recorte)

    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(
        expect.objectContaining({ sem_competencia: 'true', page: 1 }),
      ),
    )

    await user.click(
      within(screen.getByLabelText('Filtros aplicados')).getByRole('button', {
        name: /limpar filtros/i,
      }),
    )

    await waitFor(() =>
      expect(api.listarRede).toHaveBeenLastCalledWith(
        expect.objectContaining({ sem_competencia: '' }),
      ),
    )
    expect(recorte).toHaveAttribute('aria-pressed', 'false')
  })

  it('lembra quantas linhas a pessoa escolheu', async () => {
    const user = userEvent.setup()
    const { unmount } = renderRede()
    await esperarLista()

    await user.selectOptions(screen.getByLabelText(/linhas por página/i), '50')
    unmount()

    renderRede()
    await esperarLista()

    expect(screen.getByLabelText(/linhas por página/i)).toHaveDisplayValue('50')
    expect(api.listarRede).toHaveBeenLastCalledWith(expect.objectContaining({ page_size: 50 }))
  })

  it('os números do topo vêm do resumo da rede inteira', async () => {
    api.obterResumoDaRede = vi.fn().mockResolvedValue({
      total: 130,
      ativos: 90,
      titulados: 70,
      sem_competencia: 12,
    })
    renderRede()
    await esperarLista()

    const total = screen.getByText('Na rede').closest('.stat-card')
    expect(await within(total).findByText('130')).toBeInTheDocument()
  })

  it('libera acesso pela API de quem está cadastrado sem login', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Carla Nogueira').closest('tr')
    expect(within(linha).getByText('Sem acesso')).toBeInTheDocument()

    await user.click(within(linha).getByRole('button', { name: /ações para carla nogueira/i }))
    await user.click(screen.getByRole('menuitem', { name: /liberar acesso/i }))

    expect(api.liberarAcessoMembro).toHaveBeenCalledWith(5)
    expect(await screen.findByText(/acesso liberado para carla nogueira/i)).toBeInTheDocument()
  })

  /**
   * O convite sai por e-mail e leva segundos. Sem aviso, a pessoa clicava de
   * novo: o segundo pedido chegava com a conta ainda sendo criada e voltava como
   * erro, embora o primeiro tivesse liberado o acesso.
   */
  it('enquanto o convite sai, avisa e não aceita um segundo clique', async () => {
    let concluir
    api.liberarAcessoMembro = vi.fn(
      () => new Promise((resolve) => {
        concluir = () => resolve({ ...CARLA, situacao: 'ativo', tem_acesso: true })
      })
    )
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Carla Nogueira').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para carla nogueira/i }))
    await user.click(screen.getByRole('menuitem', { name: /liberar acesso/i }))

    expect(await screen.findByText(/liberando o acesso de carla nogueira/i)).toBeInTheDocument()

    await user.click(within(linha).getByRole('button', { name: /ações para carla nogueira/i }))
    const emAndamento = screen.getByRole('menuitem', { name: /liberando acesso/i })
    expect(emAndamento).toBeDisabled()
    await user.click(emAndamento)

    expect(api.liberarAcessoMembro).toHaveBeenCalledTimes(1)

    concluir()
    expect(await screen.findByText(/acesso liberado para carla nogueira/i)).toBeInTheDocument()
  })

  it('não oferece liberar acesso a quem já tem login', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Maria Ferreira').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))

    expect(screen.queryByRole('menuitem', { name: /liberar acesso/i })).not.toBeInTheDocument()
  })

  /**
   * Inativar tira a pessoa da próxima rodada de matching e do login, sem
   * apagar a participação nas equipes já geradas. É reversível, mas pesa: a
   * tela diz o efeito antes de confirmar.
   */
  it('inativa pela API depois de dizer o efeito', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Maria Ferreira').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(screen.getByRole('menuitem', { name: /inativar na rede/i }))

    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/perde o acesso/i))
    expect(api.inativarMembro).toHaveBeenCalledWith(1)
    expect(await screen.findByText(/não entra mais na plataforma/i)).toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('sem confirmar, nada muda', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Maria Ferreira').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(screen.getByRole('menuitem', { name: /inativar na rede/i }))

    expect(api.inativarMembro).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('oferece reativar a quem está inativo, e não liberar acesso', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Núcleo de P&D — Bancada 2').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para núcleo de p&d — bancada 2/i }))

    expect(screen.queryByRole('menuitem', { name: /liberar acesso/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /reativar na rede/i }))

    expect(api.reativarMembro).toHaveBeenCalledWith(7)
    expect(await screen.findByText(/voltou para a rede/i)).toBeInTheDocument()
  })

  it('abre a ficha clicando na pessoa, sem passar pelo menu', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /abrir a ficha de helena torres/i }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Biologia molecular')
    expect(dialogo).toHaveTextContent('Sequenciamento')
  })

  it('a ficha manda editar na página, não dentro do modal', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /abrir a ficha de helena torres/i }))

    const dialogo = screen.getByRole('dialog')

    expect(within(dialogo).getByRole('link', { name: /editar cadastro/i }))
      .toHaveAttribute('href', '/rede/3')
    expect(within(dialogo).queryByLabelText('Nome')).not.toBeInTheDocument()
  })

  it('avisa e oferece nova tentativa quando a API falha', async () => {
    const user = userEvent.setup()
    api.listarRede = vi.fn().mockRejectedValue(new Error('Sessão expirada.'))

    renderRede()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada.')

    api.listarRede = vi.fn().mockResolvedValue({ results: REDE })
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }))

    await esperarLista()
  })
})

describe('RedeFormPage', () => {
  /**
   * A dica estava solta como irma do `.admin-form__row`, e nao dentro do
   * campo que ela explica. A linha e uma grade de colunas automaticas, entao
   * a dica virava uma **terceira coluna** ao lado dos campos em vez de ficar
   * sob "Instituicao" - e em tela estreita descia sob "Papel na rede",
   * explicando o campo errado.
   */
  it('a dica da instituição fica dentro do campo que ela explica', async () => {
    renderRede('/rede/novo')

    const instituicao = await screen.findByLabelText('Instituição')
    const campo = instituicao.closest('.admin-field')

    expect(within(campo).getByText(/vínculo institucional vem do cadastro/i))
      .toBeInTheDocument()
    expect(instituicao).toHaveAccessibleDescription(
      /vínculo institucional vem do cadastro/i
    )
  })

  it('separa cadastrar na rede de liberar o acesso', async () => {
    renderRede('/rede/novo')

    const acesso = screen.getByRole('heading', { name: 'Acesso à plataforma', level: 2 })
      .closest('.perfil-card')

    expect(within(acesso).getByRole('checkbox')).not.toBeChecked()
  })

  it('marca nome e e-mail como obrigatórios e explica o asterisco', async () => {
    renderRede('/rede/novo')

    expect(await screen.findByLabelText(/^Nome/)).toBeRequired()
    expect(screen.getByLabelText(/^E-mail/)).toBeRequired()
    expect(screen.getByText('Campos com * são obrigatórios.')).toBeInTheDocument()
  })

  it('diz o que acontece com e sem o convite de acesso', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    expect(
      await screen.findByText(/só entra na plataforma depois que o acesso for liberado/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /enviar o convite de acesso/i }))

    expect(screen.getByText(/o convite de primeiro acesso sai para o e-mail/i)).toBeInTheDocument()
  })

  it('as listas do matching têm nome visível e um aviso só quando estão todas vazias', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    const cartao = (await screen.findByRole('heading', { name: 'O que o matching compara', level: 2 }))
      .closest('.perfil-card')

    expect(within(cartao).getByText('Técnicas', { selector: '.admin-field__label' })).toBeInTheDocument()
    expect(within(cartao).queryByText(/fica de fora do matching/i)).not.toBeInTheDocument()
    expect(within(cartao).getByText(/dificilmente aparece nas sugestões/i)).toBeInTheDocument()

    await user.type(within(cartao).getByLabelText(/adicionar em competências/i), 'Microbiologia{Enter}')

    expect(within(cartao).queryByText(/dificilmente aparece nas sugestões/i)).not.toBeInTheDocument()
  })

  it('pede confirmação ao cancelar com dados preenchidos', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(await screen.findByLabelText(/^Nome/), 'Ana Prado')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    const dialogo = screen.getByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: /continuar editando/i }))
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Ana Prado')

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /sair sem salvar/i }))

    expect(await screen.findByRole('heading', { name: 'Rede interna' })).toBeInTheDocument()
  })

  it('sem nada preenchido, cancelar sai direto', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(await screen.findByRole('heading', { name: 'Rede interna' })).toBeInTheDocument()
  })

  it('recusa e-mail inválido antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText(/^Nome/), 'Ana Prado')
    await user.type(screen.getByLabelText(/^E-mail/), 'sem-arroba')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(api.criarMembroRede).not.toHaveBeenCalled()
  })

  it('carrega o cadastro existente da API ao editar', async () => {
    renderRede('/rede/1')

    expect(await screen.findByDisplayValue('Maria Ferreira')).toBeInTheDocument()
    expect(api.obterMembroRede).toHaveBeenCalledWith('1')
    expect(screen.getByRole('button', { name: /salvar cadastro/i })).toBeInTheDocument()
  })

  it('grava o cadastro novo e libera o acesso quando pedido', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText(/^Nome/), 'Ana Prado')
    await user.type(screen.getByLabelText(/^E-mail/), 'ana.prado@ac2microbiologia.com.br')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(api.criarMembroRede).toHaveBeenCalledTimes(1)

    const corpo = api.criarMembroRede.mock.calls[0][0]
    expect(corpo.nome).toBe('Ana Prado')
    expect(corpo.email).toBe('ana.prado@ac2microbiologia.com.br')
    expect(corpo.papel_rede).toBe('pesquisador')

    expect(api.liberarAcessoMembro).toHaveBeenCalledWith(9)
    expect(await screen.findByText(/pesquisador cadastrado na rede/i)).toBeInTheDocument()
  })

  it('cadastra a pessoa com a formação acadêmica', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText(/^Nome/), 'Ana Prado')
    await user.type(screen.getByLabelText(/^E-mail/), 'ana.prado@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /adicionar formação/i }))
    await user.type(screen.getByLabelText('Curso'), 'Engenharia de Alimentos')
    await user.type(screen.getByLabelText('Instituição de ensino'), 'Unesp')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(api.criarMembroRede.mock.calls[0][0].formacoes).toEqual([
      {
        curso: 'Engenharia de Alimentos',
        instituicao: 'Unesp',
        titulacao_codigo: null,
        ano_conclusao: null,
      },
    ])
  })

  it('mostra a recusa do servidor sem perder o formulário', async () => {
    const user = userEvent.setup()
    api.criarMembroRede = vi.fn().mockRejectedValue(new Error('email: já existe cadastro com este e-mail.'))

    renderRede('/rede/novo')

    await user.type(screen.getByLabelText(/^Nome/), 'Ana Prado')
    await user.type(screen.getByLabelText(/^E-mail/), 'ana.prado@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/já existe cadastro/i)
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Ana Prado')
  })
})

describe('redeData', () => {
  it('não envia linha de formação deixada em branco', () => {
    expect(
      formacoesParaApi([
        { curso: '', instituicao: '', titulacao: '', ano: '' },
        { curso: ' Farmácia ', instituicao: 'USP', titulacao: 'doutorado', ano: '2020' },
      ])
    ).toEqual([
      { curso: 'Farmácia', instituicao: 'USP', titulacao_codigo: 'doutorado', ano_conclusao: 2020 },
    ])
  })

  it('traduz a formação da API para a tela', () => {
    expect(
      formacoesDaApi([
        { curso: 'Farmácia', instituicao: 'USP', titulacao_codigo: null, ano_conclusao: null },
      ])
    ).toEqual([{ curso: 'Farmácia', instituicao: 'USP', titulacao: '', ano: '' }])
  })

  it('mede a completude pelas dimensões do RF03', () => {
    const vazio = completudeDoPerfil({})
    expect(vazio.percentual).toBe(0)
    expect(vazio.faltando).toHaveLength(6)

    const completo = completudeDoPerfil({
      titulacao: 'doutorado',
      competencias: ['a'],
      tecnicas: ['b'],
      linhas: ['c'],
      experiencia: 'd',
      disponibilidade: 'parcial',
    })
    expect(completo.percentual).toBe(100)
    expect(completo.faltando).toHaveLength(0)
  })

  it('rotula a titulação pelo vocabulário controlado', () => {
    expect(titulacaoLabel('pos_doutorado')).toBe('Pós-doutorado')
    expect(titulacaoLabel('inexistente')).toBe('inexistente')
  })
})
