import { describe, expect, it } from 'vitest'
import { lerMensagem, lerResumo, respostaDaEntrada, respostasDaEntrada } from './resumoDaEntrada'

const RESUMO = [
  'Problema: A empresa precisa estender o prazo de validade.',
  'Contexto: A validade atual foi definida sem um estudo formal.',
  'O que falta:',
  '- Qual o produto ou tipo de produto?',
  '- Qual o prazo de validade atual?',
].join('\n')

describe('lerResumo', () => {
  /**
   * O resumo chegava como um bloco corrido, com "Problema:" e "- " digitados,
   * e as perguntas do que falta não tinham onde ser respondidas.
   */
  it('separa o problema, o contexto e as perguntas do que falta', () => {
    expect(lerResumo(RESUMO)).toEqual({
      livre: '',
      problema: 'A empresa precisa estender o prazo de validade.',
      contexto: 'A validade atual foi definida sem um estudo formal.',
      faltas: ['Qual o produto ou tipo de produto?', 'Qual o prazo de validade atual?'],
    })
  })

  it('o resumo escrito à mão, sem rótulos, fica inteiro como texto livre', () => {
    expect(lerResumo('Perda de lotes na linha de envase.\nSem método de detecção.')).toEqual({
      livre: 'Perda de lotes na linha de envase.\nSem método de detecção.',
      problema: '',
      contexto: '',
      faltas: [],
    })
  })

  it('aceita a correção que muda a lista do que falta', () => {
    const corrigido = `${RESUMO}\n• Qual o prazo pedido pelo varejo?`

    expect(lerResumo(corrigido).faltas).toEqual([
      'Qual o produto ou tipo de produto?',
      'Qual o prazo de validade atual?',
      'Qual o prazo pedido pelo varejo?',
    ])
  })

  it('resumo vazio não tem nada', () => {
    expect(lerResumo('')).toEqual({ livre: '', problema: '', contexto: '', faltas: [] })
    expect(lerResumo(undefined).faltas).toEqual([])
  })
})

describe('respostas', () => {
  it('a resposta sobre a entrada leva a pergunta, como as dos elementos', () => {
    expect(respostaDaEntrada('Qual o prazo de validade atual?', '45 dias.')).toBe(
      '[Entrada] Qual o prazo de validade atual?\nResposta: 45 dias.',
    )
  })

  it('lê de volta a origem, a pergunta e a resposta', () => {
    expect(lerMensagem('[Metodologia] Que controles o método terá?\nResposta: Positivo.')).toEqual({
      origem: 'Metodologia',
      pergunta: 'Que controles o método terá?',
      resposta: 'Positivo.',
    })
    expect(lerMensagem('O lote tem 2 t.')).toEqual({ origem: '', pergunta: '', resposta: 'O lote tem 2 t.' })
  })

  it('acha a última resposta de cada pergunta sobre a entrada, só das pessoas', () => {
    const mensagens = [
      { autor: 'copiloto', conteudo: '[Entrada] Qual o produto?\nResposta: inventada.' },
      { autor: 'humano', conteudo: respostaDaEntrada('Qual o produto?', 'Iogurte.') },
      { autor: 'humano', conteudo: '[Metodologia] Qual o produto?\nResposta: outra.' },
      { autor: 'humano', conteudo: respostaDaEntrada('Qual o produto?', 'Iogurte natural.') },
    ]

    expect(respostasDaEntrada(mensagens)).toEqual(new Map([['Qual o produto?', 'Iogurte natural.']]))
  })
})
