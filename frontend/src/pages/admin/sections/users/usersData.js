/**
 * Dados e formatadores da tela de Usuários.
 *
 * A lista é um placeholder LOCAL e está sinalizada na própria interface. O
 * backend ainda modela apenas `pesquisador` e `empresa`; os quatro atores da
 * baseline v1.0 e os endpoints de administração entram na Fase 2 do
 * PLANO_IMPLEMENTACAO.md. Inventar o contrato aqui violaria "contratos
 * blindados" (AGENTS.md §1) — por isso as operações da tela mexem em estado
 * local, e não em rede.
 */

/** Os quatro atores da baseline, na ordem em que a UI os apresenta. */
export const PERFIS = Object.freeze([
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'administrador', label: 'Administrador' },
  { id: 'pesquisador', label: 'Pesquisador' },
  { id: 'demandante', label: 'Demandante Externo' },
])

export const STATUS = Object.freeze([
  { id: 'ativo', label: 'Ativo' },
  { id: 'inativo', label: 'Inativo' },
  { id: 'suspenso', label: 'Suspenso' },
])

// Iniciais, tom do avatar e leitura do último acesso são compartilhados com a
// Rede interna e com o perfil — ver `lib/people.js`.
export { formatarUltimoAcesso, iniciais, tomDoAvatar } from '../../../../lib/people'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/**
 * Carimbos relativos ao momento em que o módulo carrega.
 *
 * Datas fixas envelheceriam: "Há 3 dias" viraria "Há 400 dias" alguns meses
 * depois da entrega, e a tela de exemplo passaria a mentir sobre si mesma.
 */
const agora = Date.now()

export const USUARIOS_EXEMPLO = Object.freeze([
  {
    id: 1,
    nome: 'Núcleo de P&D — Supervisor',
    email: 'pd@ac2microbiologia.com.br',
    perfil: 'supervisor',
    status: 'ativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 3 * HORA,
  },
  {
    id: 2,
    nome: 'Maria Ferreira',
    email: 'maria.ferreira@ac2microbiologia.com.br',
    perfil: 'pesquisador',
    status: 'ativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 40 * MINUTO,
  },
  {
    id: 3,
    nome: 'João Batista',
    email: 'joao.batista@ac2microbiologia.com.br',
    perfil: 'pesquisador',
    status: 'inativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 14 * DIA,
  },
  {
    id: 4,
    nome: 'Agroindústria Vale Verde',
    email: 'contato@valeverde.com.br',
    perfil: 'demandante',
    status: 'ativo',
    instituicao: 'Vale Verde S.A.',
    ultimoAcesso: agora - 28 * HORA,
  },
  {
    id: 5,
    nome: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
    perfil: 'administrador',
    status: 'ativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 12 * MINUTO,
  },
  {
    id: 6,
    nome: 'Carla Nogueira',
    email: 'carla.nogueira@ac2microbiologia.com.br',
    perfil: 'pesquisador',
    status: 'suspenso',
    instituicao: 'UNICAMP · Rede AC2',
    ultimoAcesso: agora - 3 * DIA,
  },
  {
    id: 7,
    nome: 'Bioindústria Santa Clara',
    email: 'inovacao@santaclara.ind.br',
    perfil: 'demandante',
    status: 'ativo',
    instituicao: 'Santa Clara Indústria',
    ultimoAcesso: agora - 5 * DIA,
  },
  {
    id: 8,
    nome: 'Rafael Antunes',
    email: 'rafael.antunes@ac2microbiologia.com.br',
    perfil: 'supervisor',
    status: 'ativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 26 * HORA,
  },
  {
    id: 9,
    nome: 'Helena Torres',
    email: 'helena.torres@ac2microbiologia.com.br',
    perfil: 'pesquisador',
    status: 'ativo',
    instituicao: 'USP · Rede AC2',
    ultimoAcesso: agora - 2 * DIA,
  },
  {
    id: 10,
    nome: 'Cooperativa Terra Boa',
    email: 'pesquisa@terraboa.coop.br',
    perfil: 'demandante',
    status: 'inativo',
    instituicao: 'Terra Boa Cooperativa',
    ultimoAcesso: agora - 21 * DIA,
  },
  {
    id: 11,
    nome: 'Pedro Salgado',
    email: 'pedro.salgado@ac2microbiologia.com.br',
    perfil: 'pesquisador',
    status: 'ativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 6 * HORA,
  },
  {
    id: 12,
    nome: 'Núcleo de P&D — Bancada 2',
    email: 'bancada2@ac2microbiologia.com.br',
    perfil: 'supervisor',
    status: 'inativo',
    instituicao: 'AC2 Microbiologia',
    ultimoAcesso: agora - 45 * DIA,
  },
])

export function perfilLabel(id) {
  return PERFIS.find((perfil) => perfil.id === id)?.label || id
}

export function statusLabel(id) {
  return STATUS.find((status) => status.id === id)?.label || id
}

/** Uma linha de CSV com as aspas escapadas conforme o RFC 4180. */
function celulaCsv(valor) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`
}

export function usuariosParaCsv(usuarios) {
  const cabecalho = ['Nome', 'E-mail', 'Perfil', 'Situação', 'Instituição', 'Último acesso']

  const linhas = usuarios.map((usuario) => [
    usuario.nome,
    usuario.email,
    perfilLabel(usuario.perfil),
    statusLabel(usuario.status),
    usuario.instituicao,
    new Date(usuario.ultimoAcesso).toISOString(),
  ])

  return [cabecalho, ...linhas].map((linha) => linha.map(celulaCsv).join(';')).join('\r\n')
}
