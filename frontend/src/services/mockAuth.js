import { ROLES, roleLabel } from '../lib/roles'

/**
 * MODO DEMONSTRACAO — autenticacao ficticia, sem backend.
 *
 * Existe para permitir navegar pelo front (login e painel do admin) sem subir o
 * Django nem o PostgreSQL. Ativado por `VITE_AUTH_MOCK=true` no `.env`.
 *
 * ATENCAO
 * - Sao credenciais de vitrine, publicas e sem valor de seguranca. Nunca use
 *   este modo em ambiente exposto e nunca reaproveite estas senhas.
 * - Quando `VITE_AUTH_MOCK` nao for `true`, nada aqui roda: o login vai para a
 *   API real, como em producao.
 */

/** true somente com o opt-in explicito no .env. */
export const IS_MOCK_AUTH_ENABLED = import.meta.env.VITE_AUTH_MOCK === 'true'

/** Latencia artificial para exercitar os estados de carregamento da UI. */
const FAKE_LATENCY_MS = 420

const MOCK_ACCOUNTS = [
  {
    email: 'admin@ac2microbiologia.com.br',
    password: 'admin123',
    role: ROLES.ADMINISTRADOR,
    displayName: 'Administração da plataforma',
  },
  {
    email: 'supervisor@ac2microbiologia.com.br',
    password: 'supervisor123',
    role: ROLES.SUPERVISOR,
    displayName: 'Núcleo de P&D — Supervisor',
  },
  {
    email: 'pesquisador@ac2microbiologia.com.br',
    password: 'pesquisador123',
    role: ROLES.PESQUISADOR,
    displayName: 'Maria Ferreira',
  },
  {
    email: 'demandante@valeverde.com.br',
    password: 'demandante123',
    role: ROLES.DEMANDANTE,
    displayName: 'Agroindústria Vale Verde',
  },
]

/** Contas exibidas na tela de login enquanto o modo demonstracao esta ligado. */
export const MOCK_CREDENTIAL_HINTS = MOCK_ACCOUNTS.map(({ email, password, role }) => ({
  email,
  password,
  role,
  roleLabel: roleLabel(role),
}))

const STORAGE_KEY = 'pdconnect.mock-session'

function buildUser(account) {
  return {
    idUser: MOCK_ACCOUNTS.indexOf(account) + 1,
    email: account.email,
    role: account.role,
    roleLabel: roleLabel(account.role),
    displayName: account.displayName,
    isMock: true,
  }
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** Valida as credenciais ficticias e devolve o usuario correspondente. */
export async function mockSignIn({ email, password }) {
  await delay(FAKE_LATENCY_MS)

  const normalizedEmail = String(email || '').trim().toLowerCase()
  const account = MOCK_ACCOUNTS.find(
    (candidate) => candidate.email === normalizedEmail && candidate.password === password
  )

  if (!account) {
    return { ok: false, message: 'E-mail ou senha inválidos.' }
  }

  const user = buildUser(account)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: account.email }))
  } catch {
    // Sessao continua valida em memoria mesmo sem storage.
  }

  return { ok: true, user }
}

/** Restaura a sessao ficticia salva, para sobreviver a um refresh da pagina. */
export async function mockRestoreSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) return null

    const { email } = JSON.parse(raw)
    const account = MOCK_ACCOUNTS.find((candidate) => candidate.email === email)

    return account ? buildUser(account) : null
  } catch {
    return null
  }
}

export function mockSignOut() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nada a fazer: a sessao em memoria ja foi descartada pelo AuthContext.
  }
}
