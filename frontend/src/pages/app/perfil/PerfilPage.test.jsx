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
  it('mostra nome, e-mail, papel e organização no cabeçalho, sem campos que parecem editáveis', () => {
    /**
     * Esses quatro dados sao mantidos por quem administra as contas. Eles
     * ficavam em dois cartoes, como campos `readonly` - e o cabecalho ja
     * mostrava nome, papel e organizacao. Campo que parece editavel e nao e
     * faz a pessoa tentar, ou desconfiar. No cabecalho viram texto: continuam
     * a vista e lidos pelo leitor de tela, sem nada para clicar.
     */
    render(<PerfilPage />)

    const cabecalho = document.querySelector('.perfil-page__header')

    expect(within(cabecalho).getByRole('heading', { name: 'Maria Ferreira', level: 1 })).toBeInTheDocument()
    expect(within(cabecalho).getByText('maria.ferreira@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(within(cabecalho).getByText('Pesquisador')).toBeInTheDocument()
    expect(within(cabecalho).getByText(/AC2 Microbiologia/)).toBeInTheDocument()

    expect(document.querySelectorAll('input[readonly]')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Identificação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Vínculo' })).not.toBeInTheDocument()
  })

  it('diz a quem pedir para mudar os dados da conta', () => {
    render(<PerfilPage />)

    expect(screen.getByText(/mantidos por quem administra as contas/i)).toBeInTheDocument()
  })

  it('ao Administrador, aponta onde ele mesmo muda os dados da conta', () => {
    estado.user = {
      displayName: 'Administração da plataforma',
      email: 'admin@ac2.com.br',
      role: 'administrador',
    }

    render(<PerfilPage />)

    expect(screen.getByText(/administração › usuários/i)).toBeInTheDocument()
    expect(screen.queryByText(/mantidos por quem administra as contas/i)).not.toBeInTheDocument()
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

    expect(cartao('Senha')).toBeInTheDocument()
    expect(within(document.querySelector('.perfil-page__header')).getByText('Demandante Externo'))
      .toBeInTheDocument()

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

    expect(screen.getByRole('alert')).toHaveTextContent(/não coincidem/i)
    expect(estado.alterarSenha).not.toHaveBeenCalled()
  })

  it('mostra as regras reais da nova senha antes de enviar', () => {
    /**
     * O servidor aplica quatro regras: tamanho minimo, nao ser so numeros, nao
     * parecer o nome ou o e-mail e nao ser senha comum. A tela so falava da
     * primeira; as outras tres apareciam como recusa depois do envio.
     */
    render(<PerfilPage />)

    const senha = cartao('Senha')

    expect(within(senha).getByLabelText(/^Nova senha/)).toHaveAccessibleDescription(/só números/i)
    expect(within(senha).getByText(/senha comum/i)).toBeInTheDocument()
  })

  it('cada campo de senha pode ser mostrado', () => {
    render(<PerfilPage />)

    expect(within(cartao('Senha')).getAllByRole('button', { name: 'Mostrar senha' })).toHaveLength(3)
  })

  it('aponta o erro no campo que falhou e leva o foco até ele', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)

    const senha = cartao('Senha')

    await user.type(within(senha).getByLabelText(/^Nova senha/), '12345678')
    await user.type(within(senha).getByLabelText('Confirmar nova senha'), '12345678')
    await user.click(within(senha).getByRole('button', { name: /alterar senha/i }))

    const atual = within(senha).getByLabelText('Senha atual')
    const nova = within(senha).getByLabelText(/^Nova senha/)

    expect(atual).toHaveAttribute('aria-invalid', 'true')
    expect(atual).toHaveAccessibleDescription(/informe a senha atual/i)
    expect(nova).toHaveAttribute('aria-invalid', 'true')
    expect(nova).toHaveAccessibleDescription(/só números/i)
    expect(within(senha).getByLabelText('Confirmar nova senha')).not.toHaveAttribute('aria-invalid')
    expect(atual).toHaveFocus()
    expect(estado.alterarSenha).not.toHaveBeenCalled()
  })

  it('a recusa do servidor aparece no campo que ela aponta, sem apagar o que foi digitado', async () => {
    estado.alterarSenha = vi.fn().mockRejectedValue(
      Object.assign(new Error('Senha atual incorreta.'), {
        data: { senha_atual: ['Senha atual incorreta.'] },
      })
    )

    const user = userEvent.setup()
    render(<PerfilPage />)

    const senha = cartao('Senha')

    await user.type(within(senha).getByLabelText('Senha atual'), 'senha-errada')
    await user.type(within(senha).getByLabelText(/^Nova senha/), 'Bioinsumo!2026')
    await user.type(within(senha).getByLabelText('Confirmar nova senha'), 'Bioinsumo!2026')
    await user.click(within(senha).getByRole('button', { name: /alterar senha/i }))

    expect(await within(senha).findByText('Senha atual incorreta.')).toBeInTheDocument()
    expect(within(senha).getByLabelText('Senha atual')).toHaveAttribute('aria-invalid', 'true')
    expect(within(senha).getByLabelText(/^Nova senha/)).toHaveValue('Bioinsumo!2026')
  })

  it('os três campos de senha ficam numa coluna só', () => {
    render(<PerfilPage />)

    expect(cartao('Senha').querySelector('.admin-form__row')).toBeNull()
  })
})

describe('PerfilPage — para que serve cada dado do perfil profissional', () => {
  /**
   * Quem preenchia nao sabia o que Disponibilidade e Titulacao mudam. As duas
   * entram na escolha de quem a plataforma sugere para a equipe: a
   * disponibilidade pesa na nota (inteira, parcial, pouco ou nada), e a
   * titulacao desempata, aparece nos motivos da sugestao e, para quem e
   * Supervisor, da prioridade na supervisao a partir do mestrado.
   */
  it('Disponibilidade explica a opção escolhida e o efeito dela nas sugestões de equipe', async () => {
    const user = userEvent.setup()
    render(<PerfilPage />)
    await esperarPerfil()

    const disponibilidade = cartao('Disponibilidade')

    expect(within(disponibilidade).getByText(/parte de um projeto/i)).toBeInTheDocument()
    expect(within(disponibilidade).getAllByText(/sugest(ão|ões) de equipe/i).length).toBeGreaterThan(0)
    expect(within(disponibilidade).queryByText(/^hoje:/i)).not.toBeInTheDocument()

    await user.selectOptions(within(disponibilidade).getByRole('combobox'), 'indisponivel')

    expect(within(disponibilidade).getByText(/continua na rede/i)).toBeInTheDocument()
    expect(within(disponibilidade).queryByText(/parte de um projeto/i)).not.toBeInTheDocument()
  })

  it('Titulação diz para que serve, sem jargão', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    const titulacao = cartao('Titulação')

    expect(within(titulacao).getByText(/desempata/i)).toBeInTheDocument()
    expect(within(titulacao).queryByText(/vocabulário controlado/i)).not.toBeInTheDocument()
    expect(within(titulacao).queryByText(/supervisão/i)).not.toBeInTheDocument()
  })

  it('ao Supervisor, Titulação conta a prioridade na supervisão', async () => {
    estado.user = { ...PESQUISADORA, role: 'supervisor' }

    render(<PerfilPage />)
    await esperarPerfil()

    expect(within(cartao('Titulação')).getByText(/vagas de supervisão/i)).toBeInTheDocument()
  })

  it('as listas e a experiência dizem com o que são comparadas', async () => {
    render(<PerfilPage />)
    await esperarPerfil()

    for (const titulo of ['Experiência', 'Competências', 'Técnicas', 'Linhas de pesquisa']) {
      expect(
        cartao(titulo).querySelector('.perfil-card__description').textContent,
        titulo
      ).toMatch(/oportunidade/i)
    }
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

    for (const titulo of ['Senha', 'Meus dados']) {
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

  it('o Contato do Demandante fica acima da grade, e Senha e Meus dados dividem a linha', () => {
    estado.user = {
      displayName: 'Agroindústria Vale Verde',
      email: 'contato@valeverde.com.br',
      role: 'demandante',
    }

    render(<PerfilPage />)

    const grade = document.querySelector('.perfil-grid')

    expect([...grade.children].map((filho) => filho.querySelector('.perfil-card__title').textContent))
      .toEqual(['Senha', 'Meus dados'])
    expect(grade.previousElementSibling).toBe(cartao('Contato'))
  })

  it('o Contato do Demandante vira uma faixa, com o telefone e o botão na mesma linha', () => {
    /**
     * Com tres cartoes da mesma altura, o Contato - um campo e um botao -
     * sobrava quase vazio ao lado da Senha. Como faixa na largura toda, o
     * titulo fica de um lado e o campo do outro, e Senha e Meus dados dividem
     * a linha de baixo.
     */
    estado.user = {
      displayName: 'Agroindústria Vale Verde',
      email: 'contato@valeverde.com.br',
      role: 'demandante',
    }

    render(<PerfilPage />)

    const contato = cartao('Contato')
    const linha = contato.querySelector('.perfil-contato__linha')

    expect(contato).toHaveClass('perfil-card--faixa')
    expect(linha).toContainElement(screen.getByLabelText('Telefone'))
    expect(within(linha).getByRole('button', { name: 'Salvar telefone' })).toBeInTheDocument()
  })

  it('o Administrador fica com Senha e Meus dados, um ao lado do outro', () => {
    estado.user = {
      displayName: 'Administração da plataforma',
      email: 'admin@ac2.com.br',
      role: 'administrador',
    }

    render(<PerfilPage />)

    const grade = document.querySelector('.perfil-grid')

    expect([...grade.children].map((filho) => filho.querySelector('.perfil-card__title').textContent))
      .toEqual(['Senha', 'Meus dados'])
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
