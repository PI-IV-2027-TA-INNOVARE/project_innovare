import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import RedeFormPage from './RedeFormPage'
import RedePage from './RedePage'
import { completudeDoPerfil, titulacaoLabel } from './redeData'

/**
 * Rede interna (RF02) e cadastro de pesquisador (RN-A04 / D06).
 *
 * A regra que estes testes protegem: cadastrar alguém na rede e dar-lhe acesso
 * são passos separados, e perfil sem competência declarada é invisível para o
 * matching — a tela precisa dizer isso, não escondê-lo.
 */
function renderRede(rota = '/rede') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/rede" element={<RedePage />} />
        <Route path="/rede/novo" element={<RedeFormPage />} />
        <Route path="/rede/:id" element={<RedeFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

async function esperarLista() {
  await screen.findByText('Maria Ferreira', {}, { timeout: 2000 })
}

describe('RedePage', () => {
  it('conta quantos perfis estão invisíveis para o matching', async () => {
    renderRede()
    await esperarLista()

    const alerta = screen.getByText('Sem competência declarada').closest('.stat-card')
    expect(within(alerta).getByText('1')).toBeInTheDocument()

    // E marca a linha, não só o total.
    const linha = screen.getByText('Núcleo de P&D — Bancada 2').closest('tr')
    expect(within(linha).getByText(/invisível ao matching/i)).toBeInTheDocument()
  })

  it('busca também por competência, não só por nome', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.type(screen.getByLabelText(/buscar na rede interna/i), 'bioinformática')

    expect(screen.getByText('Helena Torres')).toBeInTheDocument()
    expect(screen.queryByText('Maria Ferreira')).not.toBeInTheDocument()
  })

  it('ordena por titulação pela hierarquia, não pelo alfabeto', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    await user.click(screen.getByRole('button', { name: /ordenar por titulação/i }))

    const primeiro = document.querySelectorAll('.user-cell__name')[0].textContent
    // Graduação vem antes de Doutorado; em ordem alfabética seria o contrário.
    expect(primeiro).toBe('Pedro Salgado')
  })

  it('libera acesso de quem está cadastrado sem login', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Carla Nogueira').closest('tr')
    expect(within(linha).getByText('Sem acesso')).toBeInTheDocument()

    await user.click(within(linha).getByRole('button', { name: /ações para carla nogueira/i }))
    await user.click(screen.getByRole('menuitem', { name: /liberar acesso/i }))

    expect(await screen.findByText(/acesso liberado para carla nogueira/i)).toBeInTheDocument()
    expect(within(screen.getByText('Carla Nogueira').closest('tr')).getByText('Ativo')).toBeInTheDocument()
  })

  it('abre a ficha com o que o matching enxerga', async () => {
    const user = userEvent.setup()
    renderRede()
    await esperarLista()

    const linha = screen.getByText('Helena Torres').closest('tr')
    await user.click(within(linha).getByRole('button', { name: /ações para helena torres/i }))
    await user.click(screen.getByRole('menuitem', { name: /ver ficha/i }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Biologia molecular')
    expect(dialogo).toHaveTextContent('Sequenciamento')
  })
})

describe('RedeFormPage', () => {
  it('separa cadastrar na rede de liberar o acesso', async () => {
    renderRede('/rede/novo')

    const acesso = screen.getByRole('heading', { name: 'Acesso à plataforma', level: 2 })
      .closest('.perfil-card')

    // O interruptor nasce desligado: cadastrar não implica dar login (RN-A04).
    expect(within(acesso).getByRole('checkbox')).not.toBeChecked()
  })

  it('recusa e-mail inválido antes de gravar', async () => {
    const user = userEvent.setup()
    renderRede('/rede/novo')

    await user.type(screen.getByLabelText('Nome'), 'Ana Prado')
    await user.type(screen.getByLabelText('E-mail'), 'sem-arroba')
    await user.click(screen.getByRole('button', { name: /cadastrar na rede/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido.')
    expect(screen.queryByText(/pesquisador cadastrado/i)).not.toBeInTheDocument()
  })

  it('carrega o cadastro existente ao editar', () => {
    renderRede('/rede/1')

    expect(screen.getByLabelText('Nome')).toHaveValue('Maria Ferreira')
    expect(screen.getByRole('button', { name: /salvar cadastro/i })).toBeInTheDocument()
  })
})

describe('redeData', () => {
  it('mede a completude pelas dimensões do RF03', () => {
    const vazio = completudeDoPerfil({})
    expect(vazio.percentual).toBe(0)
    expect(vazio.faltando).toHaveLength(6)

    const completo = completudeDoPerfil({
      titulacao: 'doutorado',
      competencias: ['a'],
      tecnicas: ['b'],
      linhas: ['c'],
      experiencia: 'd',
      disponibilidade: 'parcial',
    })
    expect(completo.percentual).toBe(100)
    expect(completo.faltando).toHaveLength(0)
  })

  it('rotula a titulação pelo vocabulário controlado', () => {
    expect(titulacaoLabel('pos_doutorado')).toBe('Pós-doutorado')
    expect(titulacaoLabel('inexistente')).toBe('inexistente')
  })
})
