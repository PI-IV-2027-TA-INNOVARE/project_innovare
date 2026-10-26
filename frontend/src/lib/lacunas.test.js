import { describe, expect, it } from 'vitest'
import { agruparPorLacuna, rotuloDoCriterio } from './lacunas'

describe('lacunas', () => {
  it('põe cada recomendação sob a lacuna que ela resolve', () => {
    const { grupos, soltas } = agruparPorLacuna(
      [
        { id_lacuna: 1, descricao: 'Falta o controle negativo.' },
        { id_lacuna: 2, descricao: 'Não há prazo.' },
      ],
      [
        { id_recomendacao: 10, id_lacuna: 2, texto: 'Monte um cronograma.' },
        { id_recomendacao: 11, id_lacuna: 1, texto: 'Defina o controle negativo.' },
        { id_recomendacao: 12, id_lacuna: null, texto: 'Revise o resumo.' },
      ],
    )

    expect(grupos.map((grupo) => grupo.lacuna.id_lacuna)).toEqual([1, 2])
    expect(grupos[0].recomendacoes.map((item) => item.id_recomendacao)).toEqual([11])
    expect(grupos[1].recomendacoes.map((item) => item.id_recomendacao)).toEqual([10])
    expect(soltas.map((item) => item.id_recomendacao)).toEqual([12])
  })

  it('recomendação que aponta para lacuna fora da lista fica com as soltas', () => {
    const { soltas } = agruparPorLacuna([], [{ id_recomendacao: 1, id_lacuna: 9 }])

    expect(soltas).toHaveLength(1)
  })

  it('cita o critério pelo código e pelo nome, ou diz que não há evidência', () => {
    expect(rotuloDoCriterio({ criterio_codigo: 'A3', criterio_rotulo: 'Metodologia adequada' }))
      .toBe('A3 · Metodologia adequada')
    expect(rotuloDoCriterio({ criterio_codigo: 'A3', criterio_rotulo: null })).toBe('A3')
    expect(rotuloDoCriterio({ criterio_codigo: null })).toBe('Sem evidência na proposta')
  })
})
