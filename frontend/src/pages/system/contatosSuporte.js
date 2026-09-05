/**
 * Contatos de suporte exibidos nas telas de acesso restrito e de rota
 * inexistente.
 *
 * Constante local por enquanto: a lista passa a ser configurável no
 * Console → Parâmetros (PLANO_IMPLEMENTACAO.md §6.5), e a tela consome de lá
 * sem mudar de forma. Não há dado pessoal aqui além do e-mail funcional — a
 * tela é vista por quem ainda não tem permissão nenhuma.
 */
export const CONTATOS_SUPORTE = Object.freeze([
  {
    nome: 'Núcleo de P&D — AC2',
    email: 'pd@ac2microbiologia.com.br',
    papel: 'Cadastro e liberação de acesso',
  },
  {
    nome: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
    papel: 'Contas, perfis e permissões',
  },
])
