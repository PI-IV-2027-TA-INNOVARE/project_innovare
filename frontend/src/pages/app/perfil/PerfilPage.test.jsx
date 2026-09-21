import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerfilPage from './PerfilPage'

const estado = vi.hoisted(() => ({
  user: null,
  alterarSenha: null,
  obterMeuPerfil: null,
  atualizarMeuPerfil: null,
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user, isMockAuth: false }),
}))

vi.mock('../../../services/pdConnectApi', () => ({
  alterarSenha: (...args) => estado.alterarSenha(...args),
  obterMeuPerfil: (...args) => estado.obterMeuPerfil(...args),
  atualizarMeuPerfil: (...args) => estado.atualizarMeuPerfil(...args),
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
  return screen.getByRole('heading', { name: titulo, level: 2 }).closest('.perfil-card')
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

    expect(within(cartao('Vínculo')).getByLabelText('Organização')).toBeDisabled()
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
