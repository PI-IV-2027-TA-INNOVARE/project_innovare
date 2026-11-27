import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const estilos = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'LayoutDoRelatorio.scss'),
  'utf8',
)

/**
 * Em tela larga o painel ficava preso a 24 px do topo, e a barra do menu, que
 * tambem fica presa, cobre os primeiros 68 px: ao rolar, o sumario escorregava
 * para baixo da barra e parecia descer. Ele fica logo abaixo da barra, como o
 * menu lateral da Administracao, e rola por dentro quando nao cabe na tela.
 */
describe('LayoutDoRelatorio — painel preso na tela larga', () => {
  it('o painel fica abaixo da barra do menu e rola por dentro', () => {
    const inicio = estilos.indexOf('@media (min-width: 1200px)')
    const largo = estilos.slice(inicio, estilos.indexOf('\n}\n', inicio))
    const painel = largo.slice(largo.indexOf('.relatorio-painel {'))
    const bloco = painel.slice(0, painel.indexOf('}'))

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/position:\s*sticky;/)
    expect(bloco).toMatch(/top:\s*var\(--admin-nav-offset\);/)
    expect(bloco).toMatch(/max-height:\s*calc\(100vh - var\(--admin-nav-offset\) - 24px\);/)
    expect(bloco).toMatch(/overflow-y:\s*auto;/)
  })
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

  it('imprime pelo painel', async () => {
    const user = userEvent.setup()
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderizar()

    const painel = screen.getByRole('complementary', { name: 'Sumário e ações do relatório' })
    await user.click(within(painel).getByRole('button', { name: 'Imprimir' }))

    expect(imprimir).toHaveBeenCalledTimes(1)
  })

  /**
   * A volta era um link pequeno e cinza no fim do painel, abaixo do Imprimir:
   * quem só consultava o relatório não achava por onde voltar. Agora é botão,
   * acima do documento e fora do painel.
   */
  it('a volta para a oportunidade é um botão acima do documento', () => {
    renderizar()

    const voltar = screen.getByRole('link', { name: /voltar para a oportunidade/i })
    const painel = screen.getByRole('complementary', { name: 'Sumário e ações do relatório' })

    expect(voltar).toHaveAttribute('href', '/oportunidades/OP-2026-001')
    expect(voltar).toHaveClass('admin-btn', 'admin-btn--outline')
    expect(painel).not.toContainElement(voltar)
    expect(voltar.compareDocumentPosition(painel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('gera ids de seção sem acento nem espaço', () => {
    expect(idDaSecao('Como ler esta pré-análise')).toBe('relatorio-secao-como-ler-esta-pre-analise')
  })
})
