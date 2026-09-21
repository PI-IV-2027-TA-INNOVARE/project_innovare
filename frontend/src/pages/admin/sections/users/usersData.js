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

export { formatarUltimoAcesso, iniciais, tomDoAvatar } from '../../../../lib/people'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

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

export const PERFIS_PROVISIONAVEIS = Object.freeze(
  PERFIS.filter((perfil) => perfil.id !== 'pesquisador')
)

export function daApi(registro) {
  return {
    id: registro.id_usuario,
    nome: registro.nome,
    email: registro.email,
    perfil: registro.papel,
    status: registro.situacao,
    instituicao: registro.instituicao || '',
    ultimoAcesso: registro.ultimo_acesso ? Date.parse(registro.ultimo_acesso) : null,
    aguardandoPrimeiroAcesso: Boolean(registro.aguardando_primeiro_acesso),
  }
}

export function paraApi(valores) {
  return {
    nome: valores.nome,
    email: valores.email,
    papel: valores.perfil,
  }
}

export function perfilLabel(id) {
  return PERFIS.find((perfil) => perfil.id === id)?.label || id
}

export function statusLabel(id) {
  return STATUS.find((status) => status.id === id)?.label || id
}

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
