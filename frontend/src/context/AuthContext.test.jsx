import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setApiAuthSession } from '../lib/api'
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

const STORAGE_KEY = 'pdconnect-auth-session-v2'

const PERFIL = {
  id_usuario: 7,
  email: 'supervisora@ac2microbiologia.com.br',
  nome: 'Supervisora',
  papel: 'supervisor',
  papel_rotulo: 'Supervisor',
  permissoes: [],
}

function PainelDeSessao() {
  const { isAuthenticated, logout } = useAuth()

  return (
    <>
      <p>{isAuthenticated ? 'sessão ativa' : 'sessão encerrada'}</p>
      <button type="button" onClick={logout}>
        Sair
      </button>
    </>
  )
}

async function renderizarSessaoAtiva() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ accessToken: 'acesso-1', refreshToken: 'renovacao-1' })
  )

  render(
    <AuthProvider>
      <PainelDeSessao />
    </AuthProvider>
  )

  await screen.findByText('sessão ativa')
}

const botaoSair = () => screen.getByRole('button', { name: 'Sair' })

beforeEach(() => {
  setApiAuthSession(null)
  requestAuthToken.mockReset()
  getAuthenticatedProfile.mockReset().mockResolvedValue(PERFIL)
  encerrarSessao.mockReset().mockResolvedValue(undefined)
})

describe('AuthContext — PB02: sair encerra a sessão no servidor', () => {
  it('revoga o refresh na API antes de limpar o navegador', async () => {
    await renderizarSessaoAtiva()

    await userEvent.click(botaoSair())

    await waitFor(() => expect(encerrarSessao).toHaveBeenCalledWith('renovacao-1'))
    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('reenvia o refresh rotacionado quando a renovação acontece durante o logout', async () => {
    encerrarSessao.mockReset()
    encerrarSessao.mockImplementationOnce(() => {
      setApiAuthSession({ accessToken: 'acesso-2', refreshToken: 'renovacao-2' })
      return Promise.reject(new ApiError('Sessão inválida ou já encerrada.', { status: 400 }))
    })
    encerrarSessao.mockResolvedValueOnce(undefined)

    await renderizarSessaoAtiva()

    await userEvent.click(botaoSair())

    await waitFor(() => expect(encerrarSessao).toHaveBeenCalledTimes(2))
    expect(encerrarSessao).toHaveBeenNthCalledWith(1, 'renovacao-1')
    expect(encerrarSessao).toHaveBeenNthCalledWith(2, 'renovacao-2')
    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
  })

  it('desconecta no navegador mesmo com a API fora do ar', async () => {
    encerrarSessao.mockReset().mockRejectedValue(new TypeError('Failed to fetch'))

    await renderizarSessaoAtiva()

    await userEvent.click(botaoSair())

    expect(await screen.findByText('sessão encerrada')).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
