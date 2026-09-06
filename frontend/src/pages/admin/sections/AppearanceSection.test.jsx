import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BrandingProvider } from '../../../context/BrandingContext'
import { ThemeProvider } from '../../../context/ThemeContext'
import AppearanceSection from './AppearanceSection'

/**
 * Testes do painel de Aparência.
 *
 * O que importa aqui é o comportamento da tela: quem enxerga o quê, o que a
 * busca filtra, o que o bloco Avançado esconde e qual retorno a pessoa recebe
 * depois de mexer numa cor. As cores em si são contrato de `brandTokens.js`.
 */
function renderAppearance() {
  return render(
    <ThemeProvider>
      <BrandingProvider>
        <AppearanceSection />
      </BrandingProvider>
    </ThemeProvider>
  )
}

/** O cartão de um token, localizado pelo nome visível da cor. */
function cartaoDaCor(nome) {
  return screen.getByRole('heading', { name: nome, level: 4 }).closest('.token-card')
}

describe('AppearanceSection', () => {
  it('mostra os quatro grupos e as doze cores da paleta', () => {
    renderAppearance()

    for (const grupo of ['Marca', 'Superfícies', 'Texto e bordas', 'Estados']) {
      expect(screen.getByRole('button', { name: new RegExp(grupo, 'i') })).toBeInTheDocument()
    }

    expect(document.querySelectorAll('.token-card')).toHaveLength(12)
    expect(screen.getByText('12 cores · 0 alteradas')).toBeInTheDocument()
  })

  it('abre apenas o primeiro grupo, para a tela não nascer com doze cartões', () => {
    renderAppearance()

    expect(screen.getByRole('button', { name: /marca/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Laranja institucional')).toBeVisible()

    for (const grupo of [/superfícies/i, /texto e bordas/i, /estados/i]) {
      expect(screen.getByRole('button', { name: grupo })).toHaveAttribute('aria-expanded', 'false')
    }

    expect(screen.getByText('Sucesso')).not.toBeVisible()
  })

  it('a busca revela o que casa mesmo em grupo recolhido', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'sucesso')

    // Match escondido atrás de um grupo fechado é match perdido.
    expect(screen.getByText('Sucesso')).toBeVisible()
  })

  it('esconde o nome da custom property ate abrir o bloco Avancado', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    expect(within(cartao).getByText('--accent-primary')).not.toBeVisible()

    await user.click(within(cartao).getByRole('button', { name: /avançado/i }))

    expect(within(cartao).getByText('--accent-primary')).toBeVisible()
    // O laranja recalcula outras cinco variaveis; o bloco precisa dizer isso.
    expect(within(cartao).getByText('--shadow-focus')).toBeVisible()
  })

  it('filtra as cores pela busca, ignorando acentos', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'superficie')

    expect(screen.getByRole('heading', { name: 'Fundo da página', level: 4 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sucesso', level: 4 })).not.toBeInTheDocument()
    expect(screen.getByText('3 de 12 cores')).toBeInTheDocument()
  })

  it('avisa quando a busca nao encontra nada', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'roxo')

    expect(screen.getByRole('status')).toHaveTextContent(/nenhuma configuração encontrada/i)
    expect(document.querySelectorAll('.token-card')).toHaveLength(0)
  })

  it('recolhe e reabre um grupo', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const toggle = screen.getByRole('button', { name: /marca/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Laranja institucional')).not.toBeVisible()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Laranja institucional')).toBeVisible()
  })

  it('confirma a gravacao automatica depois de trocar uma cor', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    const campo = within(cartao).getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    expect(await screen.findByText('Aparência salva automaticamente.')).toBeInTheDocument()
    expect(within(cartao).getByText('alterado')).toBeInTheDocument()
  })

  it('so habilita "Restaurar padroes" quando ha algo alterado', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const restaurar = screen.getByRole('button', { name: /restaurar padrões/i })
    expect(restaurar).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /estados/i }))

    const cartao = cartaoDaCor('Sucesso')
    await user.clear(within(cartao).getByLabelText('Valor de Sucesso'))

    expect(restaurar).toBeEnabled()

    await user.click(restaurar)

    expect(restaurar).toBeDisabled()
    expect(screen.getByText('Identidade oficial da AC2 restaurada.')).toBeInTheDocument()
  })

  it('copia o valor da cor para a area de transferencia', async () => {
    const user = userEvent.setup()

    // O `setup()` do user-event instala a propria area de transferencia; o
    // dublê precisa entrar depois dele, ou e sobrescrito.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    renderAppearance()

    const cartao = cartaoDaCor('Navy institucional')
    await user.click(within(cartao).getByRole('button', { name: /^copiar #/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toMatch(/^#[0-9a-f]{6}$/i)
    expect(await screen.findByRole('status')).toHaveTextContent(/copiado/i)
  })
})
