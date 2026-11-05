import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandingProvider } from '../../../context/BrandingContext'
import { ThemeProvider } from '../../../context/ThemeContext'
import AppearanceSection from './AppearanceSection'

const estado = vi.hoisted(() => ({ salvarTema: null, carregarTema: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  carregarTema: (...args) => estado.carregarTema(...args),
  salvarTema: (...args) => estado.salvarTema(...args),
}))

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')

  estado.carregarTema = vi.fn(() => new Promise(() => {}))

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
  it('mostra os quatro grupos e as treze cores da paleta', () => {
    renderAppearance()

    for (const grupo of ['Marca', 'Superfícies', 'Texto e bordas', 'Estados']) {
      expect(screen.getByRole('button', { name: new RegExp(grupo, 'i') })).toBeInTheDocument()
    }

    expect(document.querySelectorAll('.token-card')).toHaveLength(13)
    expect(screen.getByText('13 cores · 0 personalizadas')).toBeInTheDocument()
  })

  it('abre apenas o primeiro grupo, para a tela não nascer com treze cartões', () => {
    renderAppearance()

    expect(screen.getByRole('button', { name: /marca/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Laranja institucional')).toBeVisible()

    for (const grupo of [/superfícies/i, /texto e bordas/i, /estados/i]) {
      expect(screen.getByRole('button', { name: grupo })).toHaveAttribute('aria-expanded', 'false')
    }

    expect(screen.getByText('Sucesso')).not.toBeVisible()
  })

  it('o grupo recolhido diz no cabeçalho o que guarda, com descrição e amostras', () => {
    renderAppearance()

    const toggle = screen.getByRole('button', { name: /superfícies/i })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Superfícies 3 cores')
    expect(toggle).toHaveAccessibleDescription('Fundo da aplicação e dos cartões.')
    expect(within(toggle).getByText('Fundo da aplicação e dos cartões.')).toBeVisible()
    expect(toggle.querySelectorAll('.tokens-group__amostra')).toHaveLength(3)
  })

  it('a amostra do cabeçalho acompanha a cor editada', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    const [amostra] = screen.getByRole('button', { name: /marca/i })
      .querySelectorAll('.tokens-group__amostra')

    expect(amostra).toHaveStyle({ backgroundColor: '#123456' })
  })

  it('a busca deixa no cabeçalho só as amostras das cores encontradas', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'navy')

    const toggle = screen.getByRole('button', { name: /marca/i })

    expect(toggle).toHaveAccessibleName('Marca 1 cor')
    expect(toggle.querySelectorAll('.tokens-group__amostra')).toHaveLength(1)
  })

  it('o grupo Estados traz a cor de Alerta, com exemplo de onde ela aparece', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const toggle = screen.getByRole('button', { name: /estados/i })

    expect(toggle).toHaveAccessibleName('Estados 3 cores')

    await user.click(toggle)

    expect(screen.getByRole('heading', { name: 'Alerta', level: 4 })).toBeVisible()
    expect(screen.getByText('Proposta aguardando revisão do Supervisor.')).toBeVisible()
  })

  it('a busca revela o que casa mesmo em grupo recolhido', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'sucesso')

    expect(screen.getByText('Sucesso')).toBeVisible()
  })

  it('a linha da cor mostra so o que o admin edita, sem bloco Avancado', () => {
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')

    expect(within(cartao).queryByRole('button', { name: /avançado/i })).not.toBeInTheDocument()
    expect(within(cartao).queryByText('--accent-primary')).not.toBeInTheDocument()
    expect(within(cartao).getByLabelText('Valor de Laranja institucional')).toBeInTheDocument()
  })

  it('filtra as cores pela busca, ignorando acentos', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.type(screen.getByLabelText(/buscar configuração/i), 'superficie')

    expect(screen.getByRole('heading', { name: 'Fundo da página', level: 4 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sucesso', level: 4 })).not.toBeInTheDocument()
    expect(screen.getByText('3 de 13 cores')).toBeInTheDocument()
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

    expect(within(cartao).getByText('personalizada')).toBeInTheDocument()
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

  it('descarta uma alteracao so sem perguntar e volta para a paleta publicada', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')

    await user.click(screen.getByRole('button', { name: /descartar/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(estado.salvarTema).not.toHaveBeenCalled()
    expect(screen.getByText('13 cores · 0 personalizadas')).toBeInTheDocument()
  })

  it('pede confirmacao antes de descartar mais de uma alteracao', async () => {
    const user = userEvent.setup()
    renderAppearance()

    for (const [nome, valor] of [['Laranja institucional', '#123456'], ['Navy institucional', '#654321']]) {
      const campo = within(cartaoDaCor(nome)).getByLabelText(`Valor de ${nome}`)
      await user.clear(campo)
      await user.type(campo, valor)
    }

    await user.click(screen.getByRole('button', { name: /^descartar$/i }))

    const dialogo = screen.getByRole('dialog', { name: /descartar alterações/i })
    expect(dialogo).toHaveTextContent(/2 alterações/i)
    expect(screen.getByText(/2 alterações não salvas/i)).toBeInTheDocument()

    await user.click(within(dialogo).getByRole('button', { name: /descartar alterações/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/alterações não salvas/i)).not.toBeInTheDocument()
    expect(screen.getByText('13 cores · 0 personalizadas')).toBeInTheDocument()
  })

  it('continuar editando fecha a confirmacao e mantem o rascunho', async () => {
    const user = userEvent.setup()
    renderAppearance()

    for (const [nome, valor] of [['Laranja institucional', '#123456'], ['Navy institucional', '#654321']]) {
      const campo = within(cartaoDaCor(nome)).getByLabelText(`Valor de ${nome}`)
      await user.clear(campo)
      await user.type(campo, valor)
    }

    await user.click(screen.getByRole('button', { name: /^descartar$/i }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /continuar editando/i })
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Valor de Navy institucional')).toHaveValue('#654321')
    expect(screen.getByText(/2 alterações não salvas/i)).toBeInTheDocument()
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

describe('AppearanceSection — exemplo das cores de estado', () => {
  it('nao tem previa lateral com campos que nao fazem nada', () => {
    renderAppearance()

    expect(screen.queryByRole('region', { name: /prévia/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('o grupo Estados mostra onde as cores aparecem, sem nenhum controle', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.click(screen.getByRole('button', { name: /estados/i }))

    const exemplo = screen.getByRole('figure', { name: /onde essas cores aparecem/i })

    expect(within(exemplo).getByText('Continuar')).toBeInTheDocument()
    expect(within(exemplo).getByText('Arquivada')).toBeInTheDocument()

    for (const papel of ['button', 'textbox', 'checkbox', 'combobox']) {
      expect(within(exemplo).queryAllByRole(papel)).toHaveLength(0)
    }
  })

  it('so o grupo Estados traz exemplo', async () => {
    const user = userEvent.setup()
    renderAppearance()

    for (const grupo of [/superfícies/i, /texto e bordas/i, /estados/i]) {
      await user.click(screen.getByRole('button', { name: grupo }))
    }

    expect(screen.getAllByRole('figure')).toHaveLength(1)
  })
})

describe('AppearanceSection — cor invalida', () => {
  it('marca o campo e nao deixa publicar o que nao e cor', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    const campo = within(cartao).getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, 'banana')

    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeDisabled()
  })

  it('nomeia a cor recusada, para o admin saber qual consertar', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, 'banana')

    expect(screen.getByRole('alert')).toHaveTextContent(/laranja institucional/i)
  })

  it('o aviso cita os dois formatos que a plataforma aceita', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, 'banana')

    expect(screen.getByRole('alert')).toHaveTextContent(/#1B5E20/)
    expect(screen.getByRole('alert')).toHaveTextContent(/rgba\(/)
  })

  it('explica o erro ao lado do campo recusado, para quem nao ve o aviso do topo', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const cartao = cartaoDaCor('Laranja institucional')
    const campo = within(cartao).getByLabelText('Valor de Laranja institucional')

    expect(campo).not.toHaveAccessibleDescription()

    await user.clear(campo)
    await user.type(campo, 'banana')

    expect(campo).toHaveAccessibleDescription(/não é uma cor/i)
    expect(within(cartao).getByText(/não é uma cor/i)).toBeVisible()

    await user.clear(campo)
    await user.type(campo, '#1B5E20')

    expect(campo).not.toHaveAccessibleDescription()
  })

  it('nao apaga a cor da tela enquanto o hex esta pela metade', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const anterior = document.documentElement.style.getPropertyValue('--accent-primary')
    expect(anterior).not.toBe('')

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#1B5E')

    expect(document.documentElement.style.getPropertyValue('--accent-primary'))
      .toBe(anterior)
  })

  it('volta a permitir publicar quando a cor fica valida', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')
    const salvar = screen.getByRole('button', { name: /salvar alterações/i })

    await user.clear(campo)
    await user.type(campo, 'banana')
    expect(salvar).toBeDisabled()

    await user.clear(campo)
    await user.type(campo, '#1B5E20')

    expect(campo).not.toHaveAttribute('aria-invalid', 'true')
    expect(salvar).toBeEnabled()

    await user.click(salvar)
    expect(estado.salvarTema).toHaveBeenCalledTimes(1)
  })
})

describe('AppearanceSection — a paleta publicada vem do banco', () => {
  it('pinta a tela com a paleta que a API devolveu, e nao com o padrao', async () => {
    estado.carregarTema = vi.fn().mockResolvedValue({
      secao: 'tema',
      payload: { light: { accentPrimary: '#1B5E20' }, dark: {} },
      revisao: 7,
      atualizado_por_nome: 'Administração da plataforma',
    })

    renderAppearance()

    expect(await screen.findByText(/revisão 7/i)).toBeInTheDocument()

    expect(document.documentElement.style.getPropertyValue('--accent-primary'))
      .toBe('#1B5E20')

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')
    expect(campo).toHaveValue('#1B5E20')
  })

  it('credita quem publicou a revisao em vigor', async () => {
    estado.carregarTema = vi.fn().mockResolvedValue({
      secao: 'tema',
      payload: { light: { accentPrimary: '#1B5E20' }, dark: {} },
      revisao: 3,
      atualizado_por_nome: 'Administração da plataforma',
    })

    renderAppearance()

    expect(await screen.findByText(/última alteração por Administração da plataforma/i))
      .toBeInTheDocument()
  })

  it('conta a cor publicada fora do padrao como personalizada, sem dizer que ha algo por salvar', async () => {
    estado.carregarTema = vi.fn().mockResolvedValue({
      secao: 'tema',
      payload: { light: { accentPrimary: '#1B5E20' }, dark: {} },
      revisao: 2,
      atualizado_por_nome: 'Administração da plataforma',
    })

    renderAppearance()

    expect(await screen.findByText('13 cores · 1 personalizada')).toBeInTheDocument()
    expect(within(cartaoDaCor('Laranja institucional')).getByText('personalizada')).toBeInTheDocument()
    expect(screen.queryByText(/não salvas?/i)).not.toBeInTheDocument()
  })

  it('sem servidor, a tela abre na paleta padrao em vez de ficar sem cor', async () => {
    estado.carregarTema = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

    renderAppearance()

    await screen.findByText('13 cores · 0 personalizadas')

    expect(document.documentElement.style.getPropertyValue('--accent-primary'))
      .toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('AppearanceSection — cada tema guarda a propria paleta', () => {
  it('a cor escolhida no claro nao vaza para o escuro', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = () => within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo())
    await user.type(campo(), '#1B5E20')
    expect(campo()).toHaveValue('#1B5E20')

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    expect(campo()).not.toHaveValue('#1B5E20')
  })

  it('publica os dois temas no mesmo patch quando os dois foram mexidos', async () => {
    const user = userEvent.setup()
    renderAppearance()

    const campo = () => within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo())
    await user.type(campo(), '#1B5E20')

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    await user.clear(campo())
    await user.type(campo(), '#81C784')

    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    const patch = estado.salvarTema.mock.calls[0][0]

    expect(patch.light.accentPrimary).toBe('#1B5E20')
    expect(patch.dark.accentPrimary).toBe('#81C784')
  })

  it('a cor translúcida abre o seletor na própria cor, não na do tema claro', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    const seletor = within(cartaoDaCor('Laranja claro (fundo de destaque)'))
      .getByLabelText('Escolher Laranja claro (fundo de destaque)')

    expect(seletor).toHaveValue('#e07b1a')
  })

  it('escolher no seletor mantém a transparência da cor translúcida', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    const cartao = cartaoDaCor('Laranja claro (fundo de destaque)')

    fireEvent.change(within(cartao).getByLabelText('Escolher Laranja claro (fundo de destaque)'), {
      target: { value: '#1b5e20' },
    })

    expect(within(cartao).getByLabelText('Valor de Laranja claro (fundo de destaque)'))
      .toHaveValue('rgba(27, 94, 32, 0.16)')
  })

  it('a cor translúcida diz a opacidade embaixo do valor', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    const cartao = cartaoDaCor('Laranja claro (fundo de destaque)')

    expect(within(cartao).getByText('Translúcida, com 16% de opacidade.')).toBeVisible()
    expect(within(cartao).getByLabelText('Valor de Laranja claro (fundo de destaque)'))
      .toHaveAccessibleDescription('Translúcida, com 16% de opacidade.')
    expect(within(cartaoDaCor('Laranja institucional')).queryByText(/opacidade/)).not.toBeInTheDocument()
  })

  it('a amostra da cor translúcida é uma cor só, sem metade cheia', async () => {
    const user = userEvent.setup()
    renderAppearance()

    await user.click(screen.getByRole('button', { name: /tema: claro/i }))

    const preenchimento = cartaoDaCor('Laranja claro (fundo de destaque)')
      .querySelector('.token-card__swatch-fill')

    expect(preenchimento).toHaveStyle({ backgroundColor: 'rgba(224, 123, 26, 0.16)' })
    expect(preenchimento.style.getPropertyValue('--amostra-opaca')).toBe('')
  })
})

describe('AppearanceSection — a recusa do servidor chega ao admin', () => {
  it('mostra o motivo que a API devolveu e nao diz que publicou', async () => {
    const user = userEvent.setup()

    estado.salvarTema = vi.fn().mockRejectedValue(
      new Error('Informe uma cor: hexadecimal como #1B5E20 ou #f80.')
    )

    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/informe uma cor/i)
    expect(screen.queryByText(/aparência publicada/i)).not.toBeInTheDocument()
  })

  it('o rascunho sobrevive a recusa, para o admin tentar de novo', async () => {
    const user = userEvent.setup()

    estado.salvarTema = vi.fn().mockRejectedValue(new Error('Falha de rede'))

    renderAppearance()

    const campo = within(cartaoDaCor('Laranja institucional'))
      .getByLabelText('Valor de Laranja institucional')

    await user.clear(campo)
    await user.type(campo, '#123456')
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await screen.findByRole('alert')

    expect(campo).toHaveValue('#123456')
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeEnabled()
  })
})
