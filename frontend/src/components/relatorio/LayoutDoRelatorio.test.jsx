import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LayoutDoRelatorio, { SecaoDoRelatorio, idDaSecao } from './LayoutDoRelatorio'

function renderizar() {
  return render(
    <MemoryRouter>
      <LayoutDoRelatorio
        voltarPara="/oportunidades/OP-2026-001"
        identificacao={[
          { rotulo: 'Código', valor: 'OP-2026-001' },
          { rotulo: 'Situação', valor: 'Aguardando decisão' },
          { rotulo: 'Gerado em', valor: '24/10/2026 10:00' },
        ]}
      >
        <article>
          <SecaoDoRelatorio titulo="Como foi calculado"><p>Texto</p></SecaoDoRelatorio>
          <SecaoDoRelatorio titulo="Composição sugerida"><p>Texto</p></SecaoDoRelatorio>
        </article>
      </LayoutDoRelatorio>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LayoutDoRelatorio', () => {
  it('monta o sumário com as seções do documento, na ordem', () => {
    renderizar()

    const sumario = screen.getByRole('navigation', { name: 'Sumário do relatório' })
    const itens = within(sumario).getAllByRole('link').map((link) => link.textContent)

    expect(itens).toEqual(['Como foi calculado', 'Composição sugerida'])
  })

  it('o sumário leva à seção também pelo teclado', async () => {
    const user = userEvent.setup()
    renderizar()

    const link = screen.getByRole('link', { name: 'Composição sugerida' })
    link.focus()
    await user.keyboard('{Enter}')

    expect(document.activeElement).toBe(document.getElementById(idDaSecao('Composição sugerida')))
  })

  it('mostra a identificação no painel', () => {
    renderizar()

    const painel = screen.getByRole('complementary', { name: 'Sumário e ações do relatório' })

    expect(within(painel).getByText('OP-2026-001')).toBeInTheDocument()
    expect(within(painel).getByText('Aguardando decisão')).toBeInTheDocument()
  })

  it('imprime e volta para a oportunidade pelo painel', async () => {
    const user = userEvent.setup()
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderizar()

    await user.click(screen.getByRole('button', { name: 'Imprimir' }))

    expect(imprimir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: /voltar para a oportunidade/i })).toHaveAttribute(
      'href',
      '/oportunidades/OP-2026-001'
    )
  })

  it('gera ids de seção sem acento nem espaço', () => {
    expect(idDaSecao('Como ler esta pré-análise')).toBe('relatorio-secao-como-ler-esta-pre-analise')
  })
})
