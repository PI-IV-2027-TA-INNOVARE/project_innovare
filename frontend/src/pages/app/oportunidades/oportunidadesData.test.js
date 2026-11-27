import { describe, expect, it } from 'vitest'
import { eventoDaApi } from './oportunidadesData'

describe('eventoDaApi — observação do Supervisor (PB65)', () => {
  /**
   * Nos demais eventos o texto e fixo e o `tipo` basta. Na observacao o texto
   * E o conteudo: cair no rotulo generico apagaria o que foi escrito.
   */
  it('usa o texto escrito, não um rótulo fixo do tipo', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-22T10:00:00.000Z',
        categoria: 'observacao',
        tipo: 'observacao_registrada',
        ator: 'supervisor@ac2microbiologia.com.br',
        detalhe: {
          texto: 'Laudo do lote de verão confirma a contaminação.',
          autor_nome: 'Rafael Antunes',
        },
      },
      0
    )

    expect(evento.texto).toBe('Laudo do lote de verão confirma a contaminação.')
    expect(evento.categoria).toBe('observacao')
  })

  it('assina com o nome de quem escreveu, não com o e-mail', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-22T10:00:00.000Z',
        categoria: 'observacao',
        tipo: 'observacao_registrada',
        ator: 'supervisor@ac2microbiologia.com.br',
        detalhe: { texto: 'Nota.', autor_nome: 'Rafael Antunes' },
      },
      0
    )

    expect(evento.ator).toBe('Rafael Antunes')
  })

  it('prefere o nome lido da conta ao que um evento antigo gravou', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-22T10:00:00.000Z',
        categoria: 'observacao',
        tipo: 'observacao_registrada',
        ator: 'supervisor@ac2.example',
        ator_nome: 'Pessoa removida',
        detalhe: { texto: 'Nota.', autor_nome: 'Rafael Antunes' },
      },
      0
    )

    expect(evento.ator).toBe('Pessoa removida')
  })

  it('não mexe no texto dos eventos que já tinham rótulo', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-09-01T10:00:00.000Z',
        categoria: 'oportunidade',
        tipo: 'anexo_enviado',
        ator: 'Agroindústria Vale Verde',
        detalhe: { nome: 'laudo.pdf', bytes: 2048 },
      },
      0
    )

    expect(evento.texto).toBe('Documento anexado ao registro.')
  })
})

describe('eventoDaApi — situação e prioridade', () => {
  /**
   * "Situação: Em estruturação." usava um nome que não aparece em lugar
   * nenhum da barra de etapas. Agora o evento diz a etapa, como a barra.
   */
  it.each([
    ['estruturacao', 'A oportunidade passou para a etapa 2, Copiloto.'],
    ['matching', 'A oportunidade passou para a etapa 5, Equipe potencial.'],
    ['aguardando_decisao', 'A oportunidade passou para a etapa 7, Decisão.'],
    ['revisar', 'A oportunidade voltou para revisão da proposta.'],
    ['arquivada', 'Situação: Arquivada.'],
  ])('diz para qual etapa a oportunidade foi: %s', (para, texto) => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-10-26T12:00:00Z',
      categoria: 'oportunidade',
      tipo: 'situacao_atualizada',
      detalhe: { de: 'entrada', para },
    }, 0)

    expect(evento.texto).toBe(texto)
  })

  it.each([
    ['sessao_iniciada', 'O Copiloto leu a entrada.'],
    ['sessao_concluida', 'Conversa com o Copiloto encerrada.'],
    ['sintese_revisada', 'Resumo da entrada conferido.'],
  ])('o evento do Copiloto diz o que aconteceu, sem jargão: %s', (tipo, texto) => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-10-26T12:00:00Z',
      categoria: 'copiloto',
      tipo,
      tipo_rotulo: 'Sessão do Copiloto iniciada',
      detalhe: {},
    }, 0)

    expect(evento.texto).toBe(texto)
  })

  it('diz a prioridade nova, com acento', () => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-10-26T12:00:00Z',
      categoria: 'oportunidade',
      tipo: 'prioridade_definida',
      detalhe: { de: 'alta', para: 'media' },
    }, 0)

    expect(evento.texto).toBe('Prioridade: Média.')
  })
})

describe('eventoDaApi — versão anterior da proposta (PB88)', () => {
  it('traz o texto que cada elemento tinha antes de mudar', () => {
    const evento = eventoDaApi(
      {
        ocorrido_em: '2026-11-12T10:00:00.000Z',
        categoria: 'copiloto',
        tipo: 'sugestao_aceita',
        ator_nome: 'Rafael Antunes',
        detalhe: {
          elemento: 'metodologia',
          anterior: {
            metodologia: 'PCR em tempo real.',
            objetivos_especificos: ['Isolar cepas', 'Validar o método'],
          },
        },
      },
      0,
    )

    expect(evento.texto).toBe('Sugestão do Copiloto aceita na proposta.')
    expect(evento.anterior).toEqual([
      { elemento: 'metodologia', rotulo: 'Metodologia', texto: 'PCR em tempo real.' },
      { elemento: 'objetivos_especificos', rotulo: 'Objetivos específicos', texto: 'Isolar cepas; Validar o método' },
    ])
  })

  it('evento sem versão anterior não traz nada a consultar', () => {
    const evento = eventoDaApi(
      { ocorrido_em: '2026-11-12T10:00:00.000Z', categoria: 'copiloto', tipo: 'proposta_atualizada', detalhe: { campos: ['metodologia'], anterior: {} } },
      0,
    )

    expect(evento.texto).toBe('Proposta estruturada atualizada.')
    expect(evento.anterior).toEqual([])
  })
})

/**
 * O histórico mostrava o `tipo` gravado (`competencia_adicionada`) para os
 * eventos sem texto próprio na tela. A API passou a mandar o mesmo nome que a
 * Auditoria usa, e é ele que aparece.
 */
describe('eventoDaApi — nome legível do evento', () => {
  it('usa o nome que a API manda quando a tela não tem texto próprio', () => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-11-10T12:00:00Z',
      categoria: 'competencias',
      tipo: 'competencia_adicionada',
      tipo_rotulo: 'Competência adicionada',
      ator_nome: 'Rafael Antunes',
      detalhe: { descricao: 'Microbiologia de alimentos' },
    }, 0)

    expect(evento.texto).toBe('Competência adicionada.')
  })

  it('sem nome legível, não repete o código como se fosse texto', () => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-11-10T12:00:00Z',
      categoria: 'ia',
      tipo: 'evento_novo',
      tipo_rotulo: 'evento_novo',
      detalhe: {},
    }, 0)

    expect(evento.texto).toBe('evento novo')
  })

  it('o que rodou sem pessoa sai como Sistema', () => {
    const evento = eventoDaApi({
      ocorrido_em: '2026-11-10T12:00:00Z',
      categoria: 'oportunidade',
      tipo: 'situacao_atualizada',
      ator: '__sistema__',
      ator_nome: 'Sistema',
      detalhe: { de: 'entrada', para: 'estruturacao', conferencia: true },
    }, 0)

    expect(evento.ator).toBe('Sistema')
  })
})
