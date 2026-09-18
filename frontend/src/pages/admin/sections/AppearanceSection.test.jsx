import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandingProvider } from '../../../context/BrandingContext'
import { ThemeProvider } from '../../../context/ThemeContext'
import AppearanceSection from './AppearanceSection'

const estado = vi.hoisted(() => ({ salvarTema: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  carregarTema: () => new Promise(() => {}),
  salvarTema: (...args) => estado.salvarTema(...args),
}))

beforeEach(() => {
  window.localStorage.clear()

  estado.salvarTema = vi.fn().mockResolvedValue({
    secao: 'tema',
    payload: { light: { accentPrimary: '#123456' }, dark: {} },
    revisao: 1,
    atualizado_por_nome: 'Administração da plataforma',
  })
})

function renderAppearance() {
  return render(
    <ThemeProvider>
      <BrandingProvider>
        <AppearanceSection />
      </BrandingProvider>
    </ThemeProvider>
  )
}

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

    expect(screen.getByText('Sucesso')).toBeVisible()
  })

  it('esconde o nome da custom property ate abrir o bloco Avancado', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    expect(within(cartao).getByText('--accent-primary')).not.toBeVisible()

    await user.click(within(cartao).getByRole('button', { name: /avançado/i }))

    expect(within(cartao).getByText('--accent-primary')).toBeVisible()
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

  it('nao publica a troca de cor sozinha: marca como nao salva', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    const campo = within(cartao).getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    expect(within(cartao).getByText('alterado')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/não salvas?/i)
    expect(estado.salvarTema).not.toHaveBeenCalled()
  })

  it('publica a paleta so quando o admin aperta Salvar', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const salvar = screen.getByRole('button', { name: /salvar alterações/i })
    expect(salvar).toBeDisabled()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    expect(salvar).toBeEnabled()

    await user.click(salvar)

    expect(estado.salvarTema).toHaveBeenCalledTimes(1)
    expect(Object.values(estado.salvarTema.mock.calls[0][0].light)).toContain('#123456')

    expect(await screen.findByText(/aparência publicada/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeDisabled()
  })

  it('descarta o rascunho e volta para a paleta publicada', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    await user.click(screen.getByRole('button', { name: /descartar/i }))

    expect(estado.salvarTema).not.toHaveBeenCalled()
    expect(screen.getByText('12 cores · 0 alteradas')).toBeInTheDocument()
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
    expect(screen.getByText('Identidade oficial da AC2 pronta para salvar.')).toBeInTheDocument()
  })

  it('copia o valor da cor para a area de transferencia', async () => {
    const user = userEvent.setup()

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
