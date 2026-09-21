export const ORIGENS = Object.freeze([
  { id: 'externo', label: 'Problema externo', descricao: 'Trazido por um Demandante Externo.' },
  { id: 'interna', label: 'Ideia interna', descricao: 'Cadastrada por um Supervisor.' },
])

export const SITUACOES = Object.freeze([
  { id: 'entrada', label: 'Entrada', etapa: 1 },
  { id: 'estruturacao', label: 'Em estruturação', etapa: 2 },
  { id: 'competencias', label: 'Competências', etapa: 3 },
  { id: 'matching', label: 'Matching', etapa: 4 },
  { id: 'pre_analise', label: 'Pré-análise', etapa: 5 },
  { id: 'aguardando_decisao', label: 'Aguardando decisão', etapa: 6 },
  { id: 'continuar', label: 'Continuar', etapa: 7, desfecho: true },
  { id: 'revisar', label: 'Revisar', etapa: 7, desfecho: true },
  { id: 'arquivada', label: 'Arquivada', etapa: 7, desfecho: true },
])

export const DECISOES = Object.freeze([
  {
    id: 'continuar',
    label: 'Continuar',
    descricao: 'A oportunidade está apta a avançar.',
    tom: 'ok',
  },
  {
    id: 'revisar',
    label: 'Revisar',
    descricao: 'Volta para complementação ou correção antes de seguir.',
    tom: 'warn',
  },
  {
    id: 'arquivar',
    label: 'Arquivar',
    descricao: 'Sai do fluxo ativo. O histórico é preservado.',
    tom: 'danger',
  },
])

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA
const agora = Date.now()

export const OPORTUNIDADES_EXEMPLO = Object.freeze([
  {
    id: 'OP-2026-014',
    titulo: 'Bioinsumo para cana-de-açúcar',
    origem: 'externo',
    demandante: 'Agroindústria Vale Verde',
    responsavel: 'Rafael Antunes',
    situacao: 'aguardando_decisao',
    resumo:
      'Redução de perdas por contaminação microbiana na moagem, com bioinsumo aplicado em campo.',
    competencias: ['Microbiologia de alimentos', 'Fermentação', 'Análise sensorial'],
    lacunas: ['Escalonamento industrial'],
    equipe: ['Rafael Antunes', 'Maria Ferreira', 'Pedro Salgado'],
    criadaEm: agora - 22 * DIA,
    atualizadaEm: agora - 6 * HORA,
    decisao: null,
    equipePara: ['Maria Ferreira', 'Pedro Salgado'],
    historico: [
      { id: 1, em: agora - 22 * DIA, categoria: 'oportunidade', ator: 'Agroindústria Vale Verde', texto: 'Problema externo cadastrado.' },
      { id: 2, em: agora - 20 * DIA, categoria: 'copiloto', ator: 'Copiloto IA', texto: 'Proposta estruturada em rascunho, com 3 lacunas de informação.' },
      { id: 3, em: agora - 18 * DIA, categoria: 'oportunidade', ator: 'Rafael Antunes', texto: 'Proposta revisada e complementada por humano.' },
      { id: 4, em: agora - 12 * DIA, categoria: 'competencia', ator: 'Copiloto IA', texto: '3 competências necessárias derivadas da proposta.' },
      { id: 5, em: agora - 9 * DIA, categoria: 'matching', ator: 'Sistema', texto: 'Equipe potencial sugerida: 3 pessoas. 1 lacuna de competência.' },
      { id: 6, em: agora - 4 * DIA, categoria: 'preanalise', ator: 'Sistema', texto: 'Pré-análise PIPE/FAPESP executada — caráter orientativo.' },
      { id: 7, em: agora - 6 * HORA, categoria: 'oportunidade', ator: 'Rafael Antunes', texto: 'Equipe potencial validada. Encaminhada para decisão.' },
    ],
  },
  {
    id: 'OP-2026-013',
    titulo: 'Controle de Listeria em linha de laticínios',
    origem: 'externo',
    demandante: 'Bioindústria Santa Clara',
    responsavel: 'Rafael Antunes',
    situacao: 'pre_analise',
    resumo: 'Protocolo de detecção rápida em pontos críticos da linha de envase.',
    competencias: ['Microbiologia de alimentos', 'Biologia molecular'],
    lacunas: [],
    equipe: ['Maria Ferreira', 'Helena Torres'],
    criadaEm: agora - 15 * DIA,
    atualizadaEm: agora - 2 * DIA,
    decisao: null,
    equipePara: ['Maria Ferreira', 'Helena Torres'],
    historico: [
      { id: 1, em: agora - 15 * DIA, categoria: 'oportunidade', ator: 'Bioindústria Santa Clara', texto: 'Problema externo cadastrado.' },
      { id: 2, em: agora - 13 * DIA, categoria: 'copiloto', ator: 'Copiloto IA', texto: 'Proposta estruturada em rascunho.' },
      { id: 3, em: agora - 5 * DIA, categoria: 'matching', ator: 'Sistema', texto: 'Equipe potencial sugerida: 2 pessoas.' },
      { id: 4, em: agora - 2 * DIA, categoria: 'preanalise', ator: 'Sistema', texto: 'Pré-análise executada. 2 recomendações registradas.' },
    ],
  },
  {
    id: 'OP-2026-012',
    titulo: 'Vida de prateleira de suco integral',
    origem: 'externo',
    demandante: 'Agroindústria Vale Verde',
    responsavel: 'Rafael Antunes',
    situacao: 'revisar',
    resumo: 'Perda de qualidade sensorial antes do prazo declarado no rótulo.',
    contexto: 'Ocorre no lote de verão, sem alteração de processo conhecida.',
    competencias: [],
    lacunas: [],
    equipe: [],
    criadaEm: agora - 30 * DIA,
    atualizadaEm: agora - 3 * DIA,
    decisao: {
      tipo: 'revisar',
      justificativa:
        'Faltam os laudos microbiológicos dos lotes afetados e a curva de temperatura do transporte. Sem isso não dá para separar falha de processo de falha de cadeia fria.',
      autor: 'Rafael Antunes',
      em: agora - 3 * DIA,
    },
    equipePara: [],
    historico: [
      { id: 1, em: agora - 30 * DIA, categoria: 'oportunidade', ator: 'Agroindústria Vale Verde', texto: 'Problema externo cadastrado.' },
      { id: 2, em: agora - 25 * DIA, categoria: 'copiloto', ator: 'Copiloto IA', texto: 'Perguntas orientadoras geradas a partir do relato.' },
      { id: 3, em: agora - 3 * DIA, categoria: 'decisao', ator: 'Rafael Antunes', texto: 'Decisão registrada: Revisar.' },
    ],
  },
  {
    id: 'OP-2026-011',
    titulo: 'Cultura starter para queijo artesanal',
    origem: 'interna',
    demandante: 'Núcleo de P&D — AC2',
    responsavel: 'Rafael Antunes',
    situacao: 'estruturacao',
    resumo: 'Ideia interna: isolar cultura nativa da região para padronizar o produto.',
    competencias: [],
    lacunas: [],
    equipe: [],
    criadaEm: agora - 6 * DIA,
    atualizadaEm: agora - 30 * HORA,
    decisao: null,
    equipePara: [],
    historico: [
      { id: 1, em: agora - 6 * DIA, categoria: 'oportunidade', ator: 'Rafael Antunes', texto: 'Ideia interna cadastrada.' },
      { id: 2, em: agora - 30 * HORA, categoria: 'copiloto', ator: 'Copiloto IA', texto: 'Perguntas orientadoras respondidas parcialmente.' },
    ],
  },
  {
    id: 'OP-2026-009',
    titulo: 'Redução de nitrito em embutidos',
    origem: 'externo',
    demandante: 'Cooperativa Terra Boa',
    responsavel: 'Rafael Antunes',
    situacao: 'continuar',
    resumo: 'Substituição parcial de conservante por cultura protetora.',
    competencias: ['Microbiologia de alimentos', 'Química analítica'],
    lacunas: [],
    equipe: ['Maria Ferreira', 'Carla Nogueira'],
    criadaEm: agora - 48 * DIA,
    atualizadaEm: agora - 11 * DIA,
    decisao: {
      tipo: 'continuar',
      justificativa: 'Maturidade suficiente e equipe coberta. Segue para preparação de submissão.',
      autor: 'Rafael Antunes',
      em: agora - 11 * DIA,
    },
    equipePara: ['Maria Ferreira', 'Carla Nogueira'],
    historico: [
      { id: 1, em: agora - 48 * DIA, categoria: 'oportunidade', ator: 'Cooperativa Terra Boa', texto: 'Problema externo cadastrado.' },
      { id: 2, em: agora - 20 * DIA, categoria: 'matching', ator: 'Sistema', texto: 'Equipe potencial sugerida: 2 pessoas.' },
      { id: 3, em: agora - 11 * DIA, categoria: 'decisao', ator: 'Rafael Antunes', texto: 'Decisão registrada: Continuar.' },
    ],
  },
  {
    id: 'OP-2026-006',
    titulo: 'Biofilme em trocador de calor',
    origem: 'interna',
    demandante: 'Núcleo de P&D — AC2',
    responsavel: 'Rafael Antunes',
    situacao: 'arquivada',
    resumo: 'Ideia interna arquivada por sobreposição com projeto em curso.',
    competencias: ['Microbiologia industrial'],
    lacunas: ['Engenharia de processo'],
    equipe: [],
    criadaEm: agora - 90 * DIA,
    atualizadaEm: agora - 60 * DIA,
    decisao: {
      tipo: 'arquivar',
      justificativa: 'Escopo já coberto pelo projeto de sanitização em andamento.',
      autor: 'Rafael Antunes',
      em: agora - 60 * DIA,
    },
    equipePara: [],
    historico: [
      { id: 1, em: agora - 90 * DIA, categoria: 'oportunidade', ator: 'Rafael Antunes', texto: 'Ideia interna cadastrada.' },
      { id: 2, em: agora - 60 * DIA, categoria: 'decisao', ator: 'Rafael Antunes', texto: 'Decisão registrada: Arquivar.' },
    ],
  },
])

export const NUCLEO_INTERNO = 'Núcleo de P&D — AC2'

const TEXTO_DO_EVENTO = Object.freeze({
  oportunidade_cadastrada: 'Oportunidade cadastrada.',
  contexto_atualizado: 'Contexto atualizado pelo Núcleo de P&D.',
  complementacao_enviada: 'Complementação enviada pelo demandante.',
  anexo_enviado: 'Documento anexado ao registro.',
  decisao_continuar: 'Decisão registrada: Continuar.',
  decisao_revisar: 'Decisão registrada: Revisar.',
  decisao_arquivar: 'Decisão registrada: Arquivar.',
})

export function decisaoDaApi(ultima) {
  if (!ultima) return null

  return {
    tipo: ultima.tipo,
    justificativa: ultima.justificativa || '',
    autor: ultima.autor_nome || '',
    em: Date.parse(ultima.registrada_em),
  }
}

export function eventoDaApi(evento, indice) {
  return {
    id: `${evento.ocorrido_em}-${indice}`,
    em: Date.parse(evento.ocorrido_em),
    categoria: evento.categoria,
    ator: evento.ator || 'Sistema',
    texto:
      TEXTO_DO_EVENTO[evento.tipo] ||
      String(evento.tipo || '').replace(/[._]/g, ' '),
  }
}

export function daApi(registro) {
  return {
    id: registro.codigo,
    titulo: registro.titulo,
    origem: registro.origem,
    demandante: registro.demandante_nome || NUCLEO_INTERNO,
    responsavel: registro.responsavel_nome || '',
    situacao: registro.situacao,
    resumo: registro.resumo || '',
    contexto: registro.contexto || '',
    totalAnexos: registro.total_anexos || 0,
    criadaEm: Date.parse(registro.criada_em),
    atualizadaEm: Date.parse(registro.atualizada_em),
    decisao: decisaoDaApi(registro.ultima_decisao),
    competencias: [],
    equipe: [],
    lacunas: [],
  }
}

const rotulo = (lista, id) => lista.find((item) => item.id === id)?.label || id

export const origemLabel = (id) => rotulo(ORIGENS, id)
export const situacaoLabel = (id) => rotulo(SITUACOES, id)
export const decisaoLabel = (id) => rotulo(DECISOES, id)

export function emAndamento(oportunidade) {
  return !SITUACOES.find((situacao) => situacao.id === oportunidade.situacao)?.desfecho
}

export function disponibilizadasPara(nome, oportunidades = OPORTUNIDADES_EXEMPLO) {
  return oportunidades.filter((oportunidade) => oportunidade.equipePara.includes(nome))
}

export function resumoPorSituacao(oportunidades) {
  return {
    total: oportunidades.length,
    emAndamento: oportunidades.filter(emAndamento).length,
    aguardandoDecisao: oportunidades.filter((item) => item.situacao === 'aguardando_decisao').length,
    comLacuna: oportunidades.filter((item) => item.lacunas.length > 0).length,
  }
}

export function agruparPorSituacao(oportunidades) {
  return SITUACOES.map((situacao) => ({
    ...situacao,
    total: oportunidades.filter((item) => item.situacao === situacao.id).length,
  })).filter((situacao) => situacao.total > 0)
}
