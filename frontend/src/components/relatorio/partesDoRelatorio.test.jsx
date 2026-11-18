import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeloDeMaturidade, TextoFormatado, porGravidade } from './partesDoRelatorio'

describe('TextoFormatado', () => {
  /**
   * A síntese da pré-análise vinha com uma lista em linhas iniciadas por
   * hífen, e o relatório a mostrava num parágrafo corrido, com os hífens no
   * meio do texto.
   */
  it('transforma as linhas com hífen numa lista', () => {
    const { container } = render(
      <TextoFormatado
        texto={'Pontos para validação humana:\n- Ineditismo da abordagem\n- Estado da arte'}
      />,
    )

    expect(screen.getByText('Pontos para validação humana:').tagName).toBe('P')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Ineditismo da abordagem',
      'Estado da arte',
    ])
    expect(container.textContent).not.toMatch(/- Ineditismo/)
  })

  it('mantém cada linha comum como parágrafo próprio', () => {
    render(<TextoFormatado texto={'Primeira linha.\n\nSegunda linha.'} />)

    expect(screen.getByText('Primeira linha.').tagName).toBe('P')
    expect(screen.getByText('Segunda linha.').tagName).toBe('P')
  })

  /**
   * Itens juntados por "; " a partir de frases com ponto final saíam como
   * "similaridade.; Mapear".
   */
  it('tira o ponto e vírgula que sobra depois de um ponto final', () => {
    render(<TextoFormatado texto="Comparar por similaridade.; Mapear os pontos." />)

    expect(screen.getByText('Comparar por similaridade. Mapear os pontos.')).toBeInTheDocument()
  })
})

describe('SeloDeMaturidade', () => {
  /**
   * O nível ia junto do nome da dimensão, no rótulo pequeno, cinza e em
   * maiúsculas: "DESAFIO TECNOLÓGICO · EM DESENVOLVIMENTO" parecia nome de
   * campo. Agora é um selo no valor, com ícone além da cor.
   */
  it('mostra o nível com texto e ícone', () => {
    const { container } = render(<SeloDeMaturidade nivel="fragil" rotulo="Frágil" />)

    expect(screen.getByText('Frágil')).toBeInTheDocument()
    expect(container.querySelector('.relatorio-selo--fragil svg')).not.toBeNull()
  })
})

describe('porGravidade', () => {
  it('ordena da dimensão mais frágil para a mais consolidada', () => {
    const ordenadas = porGravidade([
      { nome: 'a', nivel: 'consolidada' },
      { nome: 'b', nivel: 'fragil' },
      { nome: 'c', nivel: 'em_desenvolvimento' },
      { nome: 'd', nivel: 'fragil' },
    ])

    expect(ordenadas.map((item) => item.nome)).toEqual(['b', 'd', 'c', 'a'])
  })
})
