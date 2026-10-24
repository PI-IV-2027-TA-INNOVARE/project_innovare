import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowActionsMenu } from './ConsoleTable'

const ALTURA_DO_MENU = 180

function retangulo({ top, height = 44, right = 1000 }) {
  return { top, bottom: top + height, left: right - 44, right, width: 44, height, x: right - 44, y: top }
}

function posicionarGatilho(top) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function medir() {
    return this.classList.contains('row-menu__trigger') ? retangulo({ top }) : retangulo({ top: 0, height: 0 })
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function altura() {
    return this.classList.contains('row-menu__list') ? ALTURA_DO_MENU : 0
  })
}

function renderNaTabela() {
  const itens = [
    { label: 'Visualizar perfil', icon: undefined, onSelect: vi.fn() },
    { label: 'Inativar acesso', icon: undefined, onSelect: vi.fn() },
  ]

  return render(
    <div className="admin-page">
      <div className="admin-table-wrap">
        <table>
          <tbody>
            <tr>
              <td>
                <RowActionsMenu label="Maria Ferreira" items={itens} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RowActionsMenu', () => {
  it('desenha o menu fora da tabela, para a rolagem dela não cortar as opções', async () => {
    const user = userEvent.setup()
    posicionarGatilho(100)
    const { container } = renderNaTabela()

    await user.click(screen.getByRole('button', { name: /ações para maria ferreira/i }))

    const menu = screen.getByRole('menu')

    expect(container.querySelector('.admin-table-wrap').contains(menu)).toBe(false)
    expect(container.querySelector('.admin-page').contains(menu)).toBe(true)
  })

  it('abre para baixo quando há espaço', async () => {
    const user = userEvent.setup()
    posicionarGatilho(100)
    renderNaTabela()

    await user.click(screen.getByRole('button', { name: /ações para maria ferreira/i }))

    const menu = screen.getByRole('menu')

    expect(menu).not.toHaveClass('row-menu__list--acima')
    expect(menu.style.top).toBe('148px')
  })

  it('abre para cima na última linha, quando não cabe abaixo do botão', async () => {
    const user = userEvent.setup()
    posicionarGatilho(window.innerHeight - 60)
    renderNaTabela()

    await user.click(screen.getByRole('button', { name: /ações para maria ferreira/i }))

    const menu = screen.getByRole('menu')

    expect(menu).toHaveClass('row-menu__list--acima')
    expect(menu.style.bottom).toBe('64px')
  })

  it('fecha ao clicar fora e mantém o clique nas opções', async () => {
    const user = userEvent.setup()
    posicionarGatilho(100)
    renderNaTabela()

    await user.click(screen.getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(screen.getByRole('menuitem', { name: /visualizar perfil/i }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ações para maria ferreira/i }))
    await user.click(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
