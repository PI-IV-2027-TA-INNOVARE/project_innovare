/**
 * Rede interna da AC2 — dados e vocabulários.
 *
 * Placeholder LOCAL, sinalizado na interface. O backend ainda não modela os
 * quatro atores nem o perfil profissional do RF03; inventar o contrato aqui
 * violaria "contratos blindados" (AGENTS.md §1). O que já é definitivo é o
 * VOCABULÁRIO: ele vem da baseline, não de mim.
 *
 * O matching opera **somente** sobre esta rede (CONTEXT.md §4, "Rede Interna").
 * Não há busca externa em Lattes, ResearchGate ou Scholar (§7, OUT).
 */

/**
 * Titulação é vocabulário CONTROLADO, não texto livre.
 *
 * RF07 pede matching de supervisores "com qualificação compatível, especialmente
 * mestres e doutores" — isso não é filtrável sobre string digitada à mão. A
 * ordem da lista é a hierarquia usada na comparação. Ver P12 no plano.
 */
export const TITULACOES = Object.freeze([
  { id: 'graduacao', label: 'Graduação', nivel: 1 },
  { id: 'especializacao', label: 'Especialização', nivel: 2 },
  { id: 'mestrado', label: 'Mestrado', nivel: 3 },
  { id: 'doutorado', label: 'Doutorado', nivel: 4 },
  { id: 'pos_doutorado', label: 'Pós-doutorado', nivel: 5 },
])

/** Papel na rede — distinto do papel de acesso (`lib/roles.js`). */
export const PAPEIS_REDE = Object.freeze([
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'pesquisador', label: 'Pesquisador' },
  { id: 'colaborador', label: 'Colaborador' },
  { id: 'graduando', label: 'Graduando / bolsista' },
])

export const SITUACOES = Object.freeze([
  { id: 'ativo', label: 'Ativo' },
  { id: 'sem_acesso', label: 'Sem acesso' },
  { id: 'inativo', label: 'Inativo' },
])

/**
 * Disponibilidade declarada.
 *
 * É o que torna a sugestão do matching realista: competência sem
 * disponibilidade produz equipe potencial que não se sustenta na prática.
 */
export const DISPONIBILIDADES = Object.freeze([
  { id: 'integral', label: 'Integral' },
  { id: 'parcial', label: 'Parcial' },
  { id: 'pontual', label: 'Pontual / consultiva' },
  { id: 'indisponivel', label: 'Indisponível no momento' },
])

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA
const agora = Date.now()

export const REDE_EXEMPLO = Object.freeze([
  {
    id: 1,
    nome: 'Maria Ferreira',
    email: 'maria.ferreira@ac2microbiologia.com.br',
    papel: 'pesquisador',
    titulacao: 'doutorado',
    situacao: 'ativo',
    instituicao: 'AC2 Microbiologia',
    disponibilidade: 'parcial',
    competencias: ['Microbiologia de alimentos', 'Fermentação', 'Controle de qualidade'],
    tecnicas: ['PCR em tempo real', 'Cromatografia líquida'],
    linhas: ['Bioinsumos agrícolas'],
    experiencia: '11 anos em pesquisa aplicada de bioinsumos.',
    ultimoAcesso: agora - 40 * MINUTO,
  },
  {
    id: 2,
    nome: 'Rafael Antunes',
    email: 'rafael.antunes@ac2microbiologia.com.br',
    papel: 'supervisor',
    titulacao: 'doutorado',
    situacao: 'ativo',
    instituicao: 'AC2 Microbiologia',
    disponibilidade: 'integral',
    competencias: ['Gestão de P&D', 'Microbiologia industrial'],
    tecnicas: ['Escalonamento de processo'],
    linhas: ['Processos fermentativos'],
    experiencia: 'Coordena o Núcleo de P&D desde 2021.',
    ultimoAcesso: agora - 26 * HORA,
  },
  {
    id: 3,
    nome: 'Helena Torres',
    email: 'helena.torres@ac2microbiologia.com.br',
    papel: 'pesquisador',
    titulacao: 'mestrado',
    situacao: 'ativo',
    instituicao: 'USP · Rede AC2',
    disponibilidade: 'parcial',
    competencias: ['Biologia molecular', 'Bioinformática'],
    tecnicas: ['Sequenciamento', 'Análise de metagenoma'],
    linhas: ['Microbiota de solo'],
    experiencia: '6 anos em genômica microbiana.',
    ultimoAcesso: agora - 2 * DIA,
  },
  {
    id: 4,
    nome: 'João Batista',
    email: 'joao.batista@ac2microbiologia.com.br',
    papel: 'pesquisador',
    titulacao: 'especializacao',
    situacao: 'inativo',
    instituicao: 'AC2 Microbiologia',
    disponibilidade: 'indisponivel',
    competencias: ['Análise sensorial'],
    tecnicas: [],
    linhas: [],
    experiencia: '',
    ultimoAcesso: agora - 14 * DIA,
  },
  {
    id: 5,
    nome: 'Carla Nogueira',
    email: 'carla.nogueira@ac2microbiologia.com.br',
    papel: 'colaborador',
    titulacao: 'doutorado',
    situacao: 'sem_acesso',
    instituicao: 'UNICAMP · Rede AC2',
    disponibilidade: 'pontual',
    competencias: ['Química analítica', 'Validação de método'],
    tecnicas: ['Espectrometria de massas'],
    linhas: ['Resíduos e contaminantes'],
    experiencia: '14 anos em laboratório de análise.',
    ultimoAcesso: null,
  },
  {
    id: 6,
    nome: 'Pedro Salgado',
    email: 'pedro.salgado@ac2microbiologia.com.br',
    papel: 'graduando',
    titulacao: 'graduacao',
    situacao: 'ativo',
    instituicao: 'FHO · Rede AC2',
    disponibilidade: 'parcial',
    competencias: ['Cultivo microbiano'],
    tecnicas: ['Contagem em placa'],
    linhas: ['Bioinsumos agrícolas'],
    experiencia: 'Iniciação científica em curso.',
    ultimoAcesso: agora - 6 * HORA,
  },
  {
    id: 7,
    nome: 'Núcleo de P&D — Bancada 2',
    email: 'bancada2@ac2microbiologia.com.br',
    papel: 'colaborador',
    titulacao: 'graduacao',
    situacao: 'inativo',
    instituicao: 'AC2 Microbiologia',
    disponibilidade: 'indisponivel',
    competencias: [],
    tecnicas: [],
    linhas: [],
    experiencia: '',
    ultimoAcesso: agora - 45 * DIA,
  },
])

const rotulo = (lista, id) => lista.find((item) => item.id === id)?.label || id

export const papelLabel = (id) => rotulo(PAPEIS_REDE, id)
export const titulacaoLabel = (id) => rotulo(TITULACOES, id)
export const situacaoLabel = (id) => rotulo(SITUACOES, id)
export const disponibilidadeLabel = (id) => rotulo(DISPONIBILIDADES, id)

/**
 * As sete dimensões do RF03, na ordem em que o perfil as apresenta.
 *
 * A completude não é enfeite: cada dimensão vazia é uma feature a menos para o
 * matching comparar (RF06 / RF07), e é por isso que a tela mostra o número.
 */
export const DIMENSOES_PERFIL = Object.freeze([
  { id: 'titulacao', label: 'Titulação', preenchida: (p) => Boolean(p.titulacao) },
  { id: 'competencias', label: 'Competências', preenchida: (p) => p.competencias?.length > 0 },
  { id: 'tecnicas', label: 'Técnicas', preenchida: (p) => p.tecnicas?.length > 0 },
  { id: 'linhas', label: 'Linhas de pesquisa', preenchida: (p) => p.linhas?.length > 0 },
  { id: 'experiencia', label: 'Experiência', preenchida: (p) => Boolean(p.experiencia?.trim()) },
  { id: 'disponibilidade', label: 'Disponibilidade', preenchida: (p) => Boolean(p.disponibilidade) },
])

/** Quantas das dimensões do RF03 estão preenchidas. */
export function completudeDoPerfil(perfil) {
  const preenchidas = DIMENSOES_PERFIL.filter((dimensao) => dimensao.preenchida(perfil))

  return {
    preenchidas: preenchidas.length,
    total: DIMENSOES_PERFIL.length,
    percentual: Math.round((preenchidas.length / DIMENSOES_PERFIL.length) * 100),
    faltando: DIMENSOES_PERFIL.filter((dimensao) => !dimensao.preenchida(perfil)),
  }
}
