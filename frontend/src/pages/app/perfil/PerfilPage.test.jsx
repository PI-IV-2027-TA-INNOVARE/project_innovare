import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerfilPage from './PerfilPage'

const estado = vi.hoisted(() => ({
  user: null,
  alterarSenha: null,
  obterMeuPerfil: null,
  atualizarMeuPerfil: null,
  atualizarTelefone: null,
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user }),
}))

vi.mock('../../../services/pdConnectApi', () => ({
  alterarSenha: (...args) => estado.alterarSenha(...args),
  obterMeuPerfil: (...args) => estado.obterMeuPerfil(...args),
  atualizarMeuPerfil: (...args) => estado.atualizarMeuPerfil(...args),
  atualizarTelefone: (...args) => estado.atualizarTelefone(...args),
  baixarMeusDados: vi.fn(),
  obterPedidoDeExclusao: () => Promise.resolve({ solicitada_em: null }),
  pedirExclusaoDaConta: vi.fn(),
}))

const PESQUISADORA = {
  displayName: 'Maria Ferreira',
  email: 'maria.ferreira@ac2microbiologia.com.br',
  role: 'pesquisador',
}

const MEU_PERFIL = {
  id_membro: 1,
  nome: 'Maria Ferreira',
  email: 'maria.ferreira@ac2microbiologia.com.br',
  papel_rede: 'pesquisador',
  titulacao_codigo: 'mestrado',
  organizacao_nome: 'AC2 Microbiologia',
  disponibilidade: 'parcial',
  experiencia: '',
  situacao: 'ativo',
  competencias: ['Microbiologia de alimentos', 'Fermentação'],
  tecnicas: ['PCR em tempo real'],
  linhas: ['Bioinsumos agrícolas'],
  tem_acesso: true,
}

function cartao(titulo) {
  return screen.getByRole('heading', { name: titulo }).closest('.perfil-card')
}

function grupoProfissional() {
  return screen.getByRole('region', { name: 'Perfil profissional' })
}

async function esperarPerfil() {
  await screen.findByRole('heading', { name: 'Perfil profissional', level: 2 })
}

beforeEach(() => {
  estado.user = { ...PESQUISADORA }
  estado.alterarSenha = vi.fn().mockResolvedValue({ detail: 'Senha alterada com sucesso.' })
  estado.obterMeuPerfil = vi.fn().mockResolvedValue(MEU_PERFIL)
  estado.atualizarMeuPerfil = vi.fn().mockResolvedValue(MEU_PERFIL)
})

describe('PerfilPage', () => {
  it('mostra os campos mantidos por outro ator em leitura, e não escondidos', () => {
    render(<PerfilPage />)

    const identificacao = cartao('Identificação')

    expect(within(identificacao).getByLabelText('Nome')).toHaveValue('Maria Ferreira')
    expect(within(identificacao).getByLabelText('Nome')).toHaveAttribute('readonly')
    expect(within(identificacao).getByText(/somente leitura/i)).toBeInTheDocument()

    expect(within(cartao('Vínculo')).getByLabelText('Organização'))
      .toHaveAttribute('readonly')
  })

  it('o campo que o dono da conta não edita continua alcançável', () => {
    /**
     * `readonly` e `disabled` parecem a mesma coisa na tela e nao sao: o
     * `disabled` tira o campo da ordem de tabulacao. Quem usa teclado ou
     * leitor de tela deixa de alcancar - e portanto de ler e de copiar - o
     * proprio nome, e-mail, papel e organizacao.
     *
     * A tela mostra esses campos de proposito, em vez de esconder (ver o caso
     * acima). Desligar o acesso a eles desfaz essa decisao sem que nada na
     * tela mude de aparencia.
     */
    render(<PerfilPage />)

    for (const [secao, campos] of [
      ['Identificação', ['Nome', 'E-mail']],
      ['Vínculo', ['Papel', 'Organização']],
    ]) {
      for (const campo of campos) {
        const alvo = within(cartao(secao)).getByLabelText(campo)

        expect(alvo, `${secao} / ${campo}`).not.toBeDisabled()
        expect(alvo, `${secao} / ${campo}`).toHaveAttribute('readonly')
      }
    }
  })

  it('o que o dono da conta edita não vira campo bloqueado', () => {
    /**
     * A contraparte do caso acima. Titulacao e disponibilidade sao `<select>`,
     * e `<select>` casa com a pseudo-classe CSS `:read-only` - ele nao tem
     * atributo `readonly` para ter. Estilizar campo bloqueado por `:read-only`
     * daria a eles aparencia de travados sendo os dois editaveis; o estilo
     * mira `[readonly]`, que e atributo, e este caso guarda a consequencia.
     */
    render(<PerfilPage />)

    return esperarPerfil().then(() => {
      for (const secao of ['Titulação', 'Disponibilidade']) {
        const campo = within(cartao(secao)).getByRole('combobox')

        expect(campo, secao).not.toHaveAttribute('readonly')
        expect(campo, secao).toBeEnabled()
      }
    })
  })

  it('o dono da conta chega aos próprios dados pelo teclado', async () => {
    const usuario = userEvent.setup()
    render(<PerfilPage />)

    const nome = within(cartao('Identificação')).getByLabelText('Nome')

    nome.focus()

    expect(nome).toHaveFocus()

    await usuario.tab()

    expect(within(cartao('Identificação')).getByLabelText('E-mail')).toHaveFocus()
  })

  it('carrega o perfil profissional da API', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    expect(estado.obterMeuPerfil).toHaveBeenCalledTimes(1)
    expect(within(cartao('Titulação')).getByLabelText('Titulação')).toHaveValue('mestrado')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '83')
  })

  it('não grava sozinho: só o botão Salvar manda para a API', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    const salvar = screen.getByRole('button', { name: /salvar perfil/i })
    expect(salvar).toBeDisabled()

    await user.selectOptions(within(cartao('Titulação')).getByLabelText('Titulação'), 'doutorado')

    expect(salvar).toBeEnabled()
    expect(estado.atualizarMeuPerfil).not.toHaveBeenCalled()

    await user.click(salvar)

    expect(estado.atualizarMeuPerfil).toHaveBeenCalledTimes(1)
    expect(estado.atualizarMeuPerfil.mock.calls[0][0].titulacao_codigo).toBe('doutorado')
    expect(await screen.findByText(/perfil salvo/i)).toBeInTheDocument()
  })

  it('mostra a formação acadêmica que veio da API', async () => {
    estado.obterMeuPerfil = vi.fn().mockResolvedValue({
      ...MEU_PERFIL,
      formacoes: [
        {
          id_formacao: 3,
          curso: 'Ciências Biológicas',
          instituicao: 'Unicamp',
          titulacao_codigo: 'mestrado',
          titulacao_rotulo: 'Mestrado',
          ano_conclusao: 2019,
        },
      ],
    })
    render(<PerfilPage />)
    await esperarPerfil()

    expect(screen.getByDisplayValue('Ciências Biológicas')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2019')).toBeInTheDocument()
  })

  it('declara uma formação e a envia junto com o perfil', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    await user.click(screen.getByRole('button', { name: /adicionar formação/i }))
    await user.type(screen.getByLabelText('Curso'), 'Farmácia')
    await user.type(screen.getByLabelText('Instituição de ensino'), 'USP')
    await user.selectOptions(screen.getByLabelText('Nível'), 'doutorado')
    await user.type(screen.getByLabelText('Conclusão'), '2021')
    await user.click(screen.getByRole('button', { name: /salvar perfil/i }))

    expect(estado.atualizarMeuPerfil.mock.calls[0][0].formacoes).toEqual([
      {
        curso: 'Farmácia',
        instituicao: 'USP',
        titulacao_codigo: 'doutorado',
        ano_conclusao: 2021,
      },
    ])
  })

  it('a formação fica dentro do grupo que o Salvar perfil governa', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    expect(
      within(grupoProfissional()).getByRole('heading', { name: 'Formação acadêmica', level: 3 })
    ).toBeInTheDocument()
  })

  it('recalcula a completude quando uma dimensão é preenchida', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '83')
    expect(screen.getByText(/falta preencher: experiência/i)).toBeInTheDocument()

    await user.type(
      within(cartao('Experiência')).getByLabelText('Resumo da experiência'),
      '11 anos em bioinsumos.'
    )

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/todas as dimensões preenchidas/i)).toBeInTheDocument()
  })

  it('adiciona e remove competências sem duplicar termo equivalente', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    const competencias = cartao('Competências')
    const campo = within(competencias).getByLabelText('Adicionar em Competências')

    await user.type(campo, 'Biologia molecular{Enter}')
    expect(within(competencias).getByRole('button', { name: /remover biologia molecular/i })).toBeInTheDocument()

    await user.type(campo, 'fermentacao{Enter}')
    expect(within(competencias).queryByRole('button', { name: /remover fermentacao/i })).not.toBeInTheDocument()

    await user.click(within(competencias).getByRole('button', { name: /remover biologia molecular/i }))
    expect(within(competencias).queryByRole('button', { name: /remover biologia molecular/i })).not.toBeInTheDocument()
  })

  it('avisa quando uma dimensão fica de fora do matching', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    const tecnicas = cartao('Técnicas')
    await user.click(within(tecnicas).getByRole('button', { name: /remover pcr em tempo real/i }))

    expect(within(tecnicas).getByText(/fica de fora do matching/i)).toBeInTheDocument()
  })

  it('mostra a recusa do servidor ao salvar', async () => {
    const user = userEvent.setup()
    estado.atualizarMeuPerfil = vi.fn().mockRejectedValue(new Error('titulacao_codigo: inválida.'))

    render(<PerfilPage />)
    await esperarPerfil()

    await user.selectOptions(within(cartao('Titulação')).getByLabelText('Titulação'), 'doutorado')
    await user.click(screen.getByRole('button', { name: /salvar perfil/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/inválida/i)
  })

  it('diz quando a conta ainda não tem cadastro na rede interna', async () => {
    estado.obterMeuPerfil = vi.fn().mockRejectedValue(
      Object.assign(new Error('Sem cadastro na rede.'), { status: 404 })
    )

    render(<PerfilPage />)

    expect(await screen.findByText(/ainda não está vinculada a um cadastro/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Perfil profissional', level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('dá conta e senha a quem não integra a rede interna, sem tocar na API da rede', () => {
    estado.user = {
      displayName: 'Agroindústria Vale Verde',
      email: 'contato@valeverde.com.br',
      role: 'demandante',
    }

    render(<PerfilPage />)

    expect(cartao('Identificação')).toBeInTheDocument()
    expect(cartao('Senha')).toBeInTheDocument()
    expect(within(cartao('Vínculo')).getByLabelText('Papel')).toHaveValue('Demandante Externo')

    expect(estado.obterMeuPerfil).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Competências', level: 2 })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('troca a senha pela API e limpa os campos', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const senha = cartao('Senha')

    await user.type(within(senha).getByLabelText('Senha atual'), 'senha-antiga')
    await user.type(within(senha).getByLabelText(/^Nova senha/), 'senha-nova-123')
    await user.type(within(senha).getByLabelText('Confirmar nova senha'), 'senha-nova-123')
    await user.click(within(senha).getByRole('button', { name: /alterar senha/i }))

    expect(estado.alterarSenha).toHaveBeenCalledWith({
      senha_atual: 'senha-antiga',
      nova_senha: 'senha-nova-123',
      confirmar_senha: 'senha-nova-123',
    })

    expect(await screen.findByText(/senha alterada/i)).toBeInTheDocument()
    expect(within(senha).getByLabelText('Senha atual')).toHaveValue('')
  })

  it('recusa confirmação divergente sem chamar a API', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const senha = cartao('Senha')

    await user.type(within(senha).getByLabelText('Senha atual'), 'senha-antiga')
    await user.type(within(senha).getByLabelText(/^Nova senha/), 'senha-nova-123')
    await user.type(within(senha).getByLabelText('Confirmar nova senha'), 'outra-senha-9')
    await user.click(within(senha).getByRole('button', { name: /alterar senha/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/não corresponde/i)
    expect(estado.alterarSenha).not.toHaveBeenCalled()
  })
})

describe('PerfilPage — alcance do botão Salvar perfil', () => {
  /**
   * O botao precisa estar dentro do que ele salva.
   *
   * Ele enviava titulacao, disponibilidade, competencias, tecnicas, linhas e
   * experiencia - seis cartoes que ficavam **ao lado** dele na grade, como
   * irmaos. Lido na tela, o botao parecia salvar so o cartao onde estava; lido
   * por leitor de tela, nao havia relacao nenhuma entre ele e os campos.
   *
   * A hierarquia de titulo faz parte do conserto, e nao e enfeite: para quem
   * navega por cabecalho, ela e o unico jeito de perceber que os seis campos
   * pertencem ao grupo que o botao governa.
   */
  it('os campos que o botão salva ficam dentro do grupo que o contém', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    const grupo = grupoProfissional()

    expect(within(grupo).getByRole('button', { name: /salvar perfil/i })).toBeInTheDocument()

    for (const titulo of [
      'Titulação',
      'Disponibilidade',
      'Competências',
      'Técnicas',
      'Linhas de pesquisa',
      'Experiência',
    ]) {
      expect(
        within(grupo).getByRole('heading', { name: titulo, level: 3 }),
        titulo
      ).toBeInTheDocument()
    }
  })

  it('o que o botão não salva fica fora do grupo', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    const grupo = grupoProfissional()

    for (const titulo of ['Identificação', 'Vínculo', 'Senha']) {
      expect(
        within(grupo).queryByRole('heading', { name: titulo }),
        titulo
      ).not.toBeInTheDocument()
    }
  })

  it('a senha continua com ação própria, fora do alcance do Salvar perfil', async () => {
    /**
     * Uma acao global de "salvar alteracoes" seria enganosa aqui: a troca de
     * senha e outra transacao - exige a senha atual e vai para outro endpoint.
     * Uma acao por grupo transacional, e nao uma para a tela toda.
     */
    render(<PerfilPage />)
    await esperarPerfil()

    expect(
      within(cartao('Senha')).getByRole('button', { name: /alterar senha/i })
    ).toBeInTheDocument()

    expect(
      within(grupoProfissional()).queryByRole('button', { name: /alterar senha/i })
    ).not.toBeInTheDocument()
  })

  it('avisa que há alteração pendente e para de avisar depois de salvar', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    const grupo = grupoProfissional()

    expect(within(grupo).queryByText(/alterações não salvas/i)).not.toBeInTheDocument()

    await user.selectOptions(
      within(cartao('Titulação')).getByLabelText('Titulação'),
      'doutorado'
    )

    expect(within(grupo).getByText(/alterações não salvas/i)).toBeInTheDocument()

    await user.click(within(grupo).getByRole('button', { name: /salvar perfil/i }))

    expect(await screen.findByText(/perfil salvo/i)).toBeInTheDocument()
    expect(within(grupo).queryByText(/alterações não salvas/i)).not.toBeInTheDocument()
  })
})

describe('PerfilPage — grade dos cartões', () => {
  /**
   * A grade se montava com `auto-fit`, entao o numero de colunas vinha da
   * largura da janela: em tela larga os seis cartoes caiam 4 em cima e 2
   * embaixo, com dois orfaos na segunda faixa.
   *
   * Duas faixas de tres exigem que os seis cartoes sejam irmaos diretos da
   * mesma grade - um cartao aninhado, ou um paragrafo solto entre eles,
   * desalinha a faixa inteira.
   *
   * A ordem tambem e layout, e nao enfeite: as tres listas de vocabulario
   * (competencias, tecnicas e linhas) tem a mesma estrutura, e juntas na
   * mesma faixa nascem com altura parecida. Misturar uma delas com os campos
   * curtos devolve a faixa torta que o usuario viu.
   *
   * O resto do conserto e so CSS, que esta suite nao enxerga (`css: false`):
   * os cartoes perderam o `align-items: start`, entao esticam para a altura
   * da faixa, e viraram `subgrid` de duas linhas para que cabecalho e corpo
   * se alinhem entre vizinhos - sem isso, descricoes de tamanhos diferentes
   * empurravam os campos de cada cartao para alturas diferentes.
   *
   * Duas consequencias de esticar cartao, consertadas no mesmo lugar:
   *
   * 1. `.admin-field` e grid, e o `align-content: stretch` padrao repartia a
   *    sobra de altura entre label e campo. Num `.admin-form__row`, o campo
   *    sem dica ficava mais alto que o vizinho com dica - era o que separava
   *    "Nova senha" de "Confirmar nova senha". Agora ancora no topo, e a
   *    regra vale para todo formulario do console, nao so para este cartao.
   *
   * 2. Em duas colunas, uma grade de tres cartoes deixa o ultimo sozinho. Ele
   *    passa a ocupar a faixa inteira - `:nth-child(odd of .perfil-card)`
   *    junto de `:nth-last-child(1 of .perfil-card)` pega o ultimo cartao so
   *    quando a contagem e impar, entao a regra continua certa se um cartao
   *    entrar ou sair da grade.
   */
  it('mantém os seis cartões como irmãos diretos da grade, em duas faixas de três', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    const grade = grupoProfissional().querySelector('.perfil-grupo__grid')
    const filhos = [...grade.children]

    for (const filho of filhos) {
      expect(filho.className, filho.outerHTML.slice(0, 120)).toContain('perfil-card')
    }

    expect(filhos.map((filho) => filho.querySelector('.perfil-card__title').textContent))
      .toEqual([
        'Titulação',
        'Disponibilidade',
        'Experiência',
        'Competências',
        'Técnicas',
        'Linhas de pesquisa',
      ])
  })

  it('mantém os cartões de conta como irmãos diretos da grade da página', () => {
    estado.user = {
      displayName: 'Agroindústria Vale Verde',
      email: 'contato@valeverde.com.br',
      role: 'demandante',
    }

    render(<PerfilPage />)

    const grade = document.querySelector('.perfil-grid')

    expect([...grade.children].map((filho) => filho.querySelector('.perfil-card__title').textContent))
      .toEqual(['Identificação', 'Vínculo', 'Contato', 'Senha', 'Meus dados'])
  })
})

describe('PerfilPage — telefone do Demandante Externo', () => {
  beforeEach(() => {
    estado.user = {
      displayName: 'Agroindústria Vale Verde',
      email: 'contato@valeverde.com.br',
      role: 'demandante',
      organizacao: { nome: 'Agroindústria Vale Verde' },
      telefone: '',
    }
    estado.atualizarTelefone = vi.fn().mockResolvedValue({ telefone: '(19) 99876-5432' })
  })

  it('mostra o campo de telefone só para o Demandante', async () => {
    render(<PerfilPage />)

    expect(screen.getByLabelText('Telefone')).toBeInTheDocument()
  })

  it('salva o telefone com máscara', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    await user.type(screen.getByLabelText('Telefone'), '19998765432')
    expect(screen.getByLabelText('Telefone')).toHaveValue('(19) 99876-5432')

    await user.click(screen.getByRole('button', { name: 'Salvar telefone' }))

    expect(estado.atualizarTelefone).toHaveBeenCalledWith('(19) 99876-5432')
    expect(await screen.findByText('Telefone salvo.')).toBeInTheDocument()
  })

  it('recusa número incompleto sem chamar a API', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    await user.type(screen.getByLabelText('Telefone'), '9988')
    await user.click(screen.getByRole('button', { name: 'Salvar telefone' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Telefone incompleto')
    expect(estado.atualizarTelefone).not.toHaveBeenCalled()
  })

  it('não oferece telefone a quem não é Demandante', async () => {
    estado.user = { ...PESQUISADORA }
    render(<PerfilPage />)
    await esperarPerfil()

    expect(screen.queryByLabelText('Telefone')).not.toBeInTheDocument()
  })
})
