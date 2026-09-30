import { appIcons } from '../../lib/icons'
import { PERMISSOES } from '../../lib/permissoes'

export const SECOES_ADMIN = Object.freeze([
  {
    id: 'aparencia',
    rota: '/admin/aparencia',
    label: 'Aparência',
    description: 'Cores e identidade visual',
    icon: appIcons.appearance,
    permissao: PERMISSOES.CONFIGURACAO,
  },
  {
    id: 'usuarios',
    rota: '/admin/usuarios',
    label: 'Usuários',
    description: 'Contas, perfis e acessos',
    icon: appIcons.users,
    permissao: PERMISSOES.CONTAS,
  },
  {
    id: 'auditoria',
    rota: '/admin/auditoria',
    label: 'Auditoria',
    description: 'Trilha do que aconteceu na plataforma',
    icon: appIcons.history,
    permissao: PERMISSOES.AUDITORIA,
  },
  {
    id: 'parametros',
    rota: '/admin/parametros',
    label: 'Parâmetros',
    description: 'Contatos de suporte e critérios',
    icon: appIcons.settings,
    permissao: PERMISSOES.CONFIGURACAO,
  },
])

export const SECAO_INICIAL = SECOES_ADMIN[0]
