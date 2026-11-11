import { describe, expect, it, vi } from 'vitest'
import { todasAsPaginas } from './paginas'

describe('todasAsPaginas', () => {
  /**
   * A API entrega no máximo 100 itens por página. Uma tela que lê só a
   * primeira perde, sem aviso, tudo o que vem depois: foi o que acontecia em
   * Usuários, em Oportunidades e no Painel.
   */
  it('segue as páginas até a última e junta os itens', async () => {
    const listar = vi
      .fn()
      .mockResolvedValueOnce({ count: 3, next: '/?page=2', results: [1, 2] })
      .mockResolvedValueOnce({ count: 3, next: null, results: [3] })

    expect(await todasAsPaginas(listar, { ordenar: 'prioridade' })).toEqual([1, 2, 3])
    expect(listar).toHaveBeenNthCalledWith(1, { ordenar: 'prioridade', page: '1' })
    expect(listar).toHaveBeenNthCalledWith(2, { ordenar: 'prioridade', page: '2' })
  })

  it('uma página só faz uma chamada só', async () => {
    const listar = vi.fn().mockResolvedValue({ count: 2, next: null, results: [1, 2] })

    expect(await todasAsPaginas(listar)).toEqual([1, 2])
    expect(listar).toHaveBeenCalledTimes(1)
  })

  it('resposta sem paginação volta como veio', async () => {
    const listar = vi.fn().mockResolvedValue([1, 2])

    expect(await todasAsPaginas(listar)).toEqual([1, 2])
  })
})
