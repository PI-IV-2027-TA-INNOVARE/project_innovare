import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, getApiAuthSession, renovarSessao, setApiAuthSession } from '../lib/api'
import { tokenDeAcesso } from '../test/tokenDeAcesso'
import {
  encerrarSessao,
  getAuthenticatedProfile,
  requestAuthToken,
} from '../services/pdConnectApi'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../services/pdConnectApi', () => ({
  encerrarSessao: vi.fn(),
  getAuthenticatedProfile: vi.fn(),
  requestAuthToken: vi.fn(),
}))

vi.mock('../lib/api', async (original) => ({
  ...(await original()),
  renovarSessao: vi.fn(),
}))

const MARCA = 'pdconnect-sessao'
const CHAVE_ANTIGA = 'pdconnect-auth-session-v2'

const PERFIL = {
  id_usuario: 7,
  email: 'supervisora@ac2microbiologia.com.br',
  nome: 'Supervisora',
  papel: 'supervisor',
  papel_rotulo: 'Supervisor',
  permissoes: [],
}

function PainelDeSessao() {
  const { isAuthenticated, isBootstrapping, logout, signInWithCredentials } = useAuth()

  if (isBootstrapping) return <p>carregando</p>

  return (
    <>
      <p>{isAuthenticated ? 'sessão ativa' : 'sessão encerrada'}</p>
      <button
        type="button"
        onClick={() => signInWithCredentials({ email: PERFIL.email, password: 'x' })}
      >
        Entrar
      </button>
      <button type="button" onClick={logout}>
        Sair
      </button>
    </>
  )
}

function renderizar() {
  render(
    <AuthProvider>
      <PainelDeSessao />
    </AuthProvider>
  )
}

function textoDoArmazenamento() {
  return Object.keys(window.localStorage)
    .map((chave) => `${chave}=${window.localStorage.getItem(chave)}`)
    .join('\n')
}

async function entrar() {
  renderizar()
  await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
  await screen.findByText('sessão ativa')
}

beforeEach(() => {
  window.localStorage.clear()
  setApiAuthSession(null)
  renovarSessao.mockReset().mockResolvedValue({ accessToken: 'acesso-retomado' })
  requestAuthToken.mockReset().mockResolvedValue({ access: 'acesso-1', papel: 'supervisor' })
  getAuthenticatedProfile.mockReset().mockResolvedValue(PERFIL)
  encerrarSessao.mockReset().mockResolvedValue(undefined)
})

describe('AuthContext — o token fica longe do alcance de scripts', () => {
  it('guarda o acesso só na memória: nenhum token vai para o localStorage', async () => {
    await entrar()

    expect(getApiAuthSession()).toEqual({ accessToken: 'acesso-1' })
    expect(textoDoArmazenamento()).not.toContain('acesso-1')
    expect(window.localStorage.getItem(MARCA)).toBe('1')
  })

  it('ao recarregar a página, retoma a sessão pelo cookie', async () => {
    window.localStorage.setItem(MARCA, '1')

    renderizar()

    expect(await screen.findByText('sessão ativa')).toBeInTheDocument()
    expect(renovarSessao).toHaveBeenCalled()
    expect(getApiAuthSession()).toEqual({ accessToken: 'acesso-retomado' })
  })

  it('sem sessão anterior, não tenta renovar', async () => {
    renderizar()

    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(renovarSessao).not.toHaveBeenCalled()
  })

  it('cookie vencido leva de volta à entrada', async () => {
    window.localStorage.setItem(MARCA, '1')
    renovarSessao.mockRejectedValue(new Error('Sua sessão expirou. Entre novamente.'))

    renderizar()

    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(window.localStorage.getItem(MARCA)).toBeNull()
  })

  it('apaga os tokens que a versão anterior deixou no localStorage', async () => {
    window.localStorage.setItem(
      CHAVE_ANTIGA,
      JSON.stringify({ accessToken: 'velho', refreshToken: 'velho' })
    )

    renderizar()

    await screen.findByText('sessão encerrada')
    expect(window.localStorage.getItem(CHAVE_ANTIGA)).toBeNull()
  })
})

describe('AuthContext — PB02: sair encerra a sessão no servidor', () => {
  it('revoga a sessão na API antes de limpar o navegador', async () => {
    await entrar()

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(encerrarSessao).toHaveBeenCalledWith())
    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(window.localStorage.getItem(MARCA)).toBeNull()
    expect(getApiAuthSession()).toBeNull()
  })

  it('desconecta no navegador mesmo com a API fora do ar', async () => {
    encerrarSessao.mockRejectedValue(new TypeError('Failed to fetch'))

    await entrar()

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(window.localStorage.getItem(MARCA)).toBeNull()
  })
})

describe('AuthContext — outra conta entrou neste navegador', () => {
  const OUTRA_CONTA = {
    id_usuario: 9,
    email: 'pesquisadora@ac2microbiologia.com.br',
    nome: 'Pesquisadora',
    papel: 'pesquisador',
    papel_rotulo: 'Pesquisador',
    permissoes: [],
  }

  function ContaDaAba() {
    const {
      contaTrocada,
      dispensarAvisoDeConta,
      isBootstrapping,
      logout,
      signInWithCredentials,
      user,
    } = useAuth()

    if (isBootstrapping) return <p>carregando</p>

    return (
      <>
        <p>conta: {user?.displayName ?? 'nenhuma'}</p>
        {contaTrocada && <p>aviso: {contaTrocada.nome}</p>}
        <button
          type="button"
          onClick={() => signInWithCredentials({ email: PERFIL.email, password: 'x' })}
        >
          Entrar
        </button>
        <button type="button" onClick={dispensarAvisoDeConta}>
          Dispensar
        </button>
        <button type="button" onClick={logout}>
          Sair
        </button>
      </>
    )
  }

  function resposta(status, corpo) {
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async function entrarEDeixarOutraContaEntrar() {
    requestAuthToken.mockResolvedValue({ access: tokenDeAcesso(7) })
    getAuthenticatedProfile.mockResolvedValueOnce(PERFIL).mockResolvedValueOnce(OUTRA_CONTA)

    render(
      <AuthProvider>
        <ContaDaAba />
      </AuthProvider>
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    await screen.findByText('conta: Supervisora')

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(resposta(401, { detail: 'token_not_valid' }))
      .mockResolvedValueOnce(resposta(200, { access: tokenDeAcesso(9) })))

    return apiRequest('/notificacoes/').catch((problema) => problema)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a aba passa para a conta que entrou e guarda o aviso', async () => {
    const erro = await entrarEDeixarOutraContaEntrar()

    expect(erro.data).toEqual({ codigo: 'conta_trocada' })
    expect(await screen.findByText('conta: Pesquisadora')).toBeInTheDocument()
    expect(screen.getByText('aviso: Pesquisadora')).toBeInTheDocument()
    expect(getApiAuthSession()).toEqual({ accessToken: tokenDeAcesso(9) })
  })

  it('o aviso sai quando a pessoa o dispensa', async () => {
    await entrarEDeixarOutraContaEntrar()
    await screen.findByText('aviso: Pesquisadora')

    await userEvent.click(screen.getByRole('button', { name: 'Dispensar' }))

    expect(screen.queryByText(/^aviso:/)).not.toBeInTheDocument()
    expect(screen.getByText('conta: Pesquisadora')).toBeInTheDocument()
  })

  it('sair apaga o aviso junto com a sessão', async () => {
    await entrarEDeixarOutraContaEntrar()
    await screen.findByText('aviso: Pesquisadora')

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByText('conta: nenhuma')).toBeInTheDocument()
    expect(screen.queryByText(/^aviso:/)).not.toBeInTheDocument()
  })
})
