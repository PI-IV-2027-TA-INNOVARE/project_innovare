import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrivacidadePage from './PrivacidadePage'

const estilos = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PrivacidadePage.scss'),
  'utf8',
)

function posicionarTitulos(topos) {
  screen.getAllByRole('heading', { level: 2 }).forEach((titulo) => {
    const topo = topos[titulo.textContent] ?? 2000
    titulo.getBoundingClientRect = () => ({ top: topo, bottom: topo + 24 })
  })
}

const indice = () => within(screen.getByRole('navigation', { name: 'Nesta página' }))

const estado = vi.hoisted(() => ({ autenticado: false, lerPrivacidade: null }))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: estado.autenticado }),
}))

vi.mock('../../services/pdConnectApi', () => ({
  lerPrivacidade: (...args) => estado.lerPrivacidade(...args),
}))

function renderizar() {
  return render(
    <MemoryRouter>
      <PrivacidadePage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  estado.autenticado = false
  estado.lerPrivacidade = vi.fn().mockResolvedValue({
    encarregado: { nome: 'Joana Lima', email: 'dpo@ac2microbiologia.com.br' },
    contatos: [],
  })
})

describe('PrivacidadePage', () => {
  it('abre com o resumo: o que guarda, onde fica, quem recebe e o que a pessoa controla', () => {
    renderizar()

    const resumo = within(screen.getByRole('region', { name: 'Em resumo' }))

    expect(resumo.getByText('Onde fica')).toBeInTheDocument()
    expect(resumo.getByText(/no Brasil/)).toBeInTheDocument()
    expect(resumo.getByText(/sem nome, e-mail ou telefone/)).toBeInTheDocument()
    expect(resumo.getByText(/provedor de e-mail/)).toBeInTheDocument()
    expect(resumo.getByText(/baixar uma cópia/i)).toBeInTheDocument()
  })

  it('diz que as decisões sobre o problema saem por e-mail, e o que vai junto', () => {
    renderizar()

    expect(
      screen.getByText(/decisões Revisar, Continuar e Arquivar sobre o problema dela/),
    ).toBeInTheDocument()
  })

  it('o índice leva a cada seção, sem precisar rolar até ela', () => {
    renderizar()

    const indice = within(screen.getByRole('navigation', { name: 'Nesta página' }))
    const secoes = screen
      .getAllByRole('heading', { level: 2 })
      .filter((titulo) => titulo.id !== 'privacidade-resumo')

    expect(indice.getAllByRole('link')).toHaveLength(secoes.length)
    secoes.forEach((titulo) => {
      expect(indice.getByRole('link', { name: titulo.textContent })).toHaveAttribute(
        'href',
        `#${titulo.id}`
      )
    })
  })

  it('informa finalidade, base legal, compartilhamento e direitos (LGPD, art. 9)', () => {
    renderizar()

    const bases = screen.getByRole('table', { name: 'Para que usamos e com que base' })

    expect(within(bases).getByRole('columnheader', { name: 'Base legal' })).toBeInTheDocument()
    expect(within(bases).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Com quem compartilhamos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Seus direitos' })).toBeInTheDocument()
  })

  /**
   * O texto dizia "hoje, o Gemini, do Google", e desde a fila de reservas
   * outros serviços também recebem os textos. Quem recebe muda com a
   * configuração de cada ambiente, então o nome vem da API, e não da tela.
   */
  it('diz quais serviços de IA recebem os textos, na ordem em que respondem', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [],
      servicos_de_ia: [
        { nome: 'Google Gemini', papel: 'principal' },
        { nome: 'Groq', papel: 'reserva' },
        { nome: 'OpenRouter', papel: 'reserva' },
      ],
    })

    renderizar()

    const compartilhamento = within(screen.getByRole('region', { name: 'Com quem compartilhamos' }))

    expect(compartilhamento.getByText('Serviços de IA')).toBeInTheDocument()
    expect(
      await compartilhamento.findByText(
        /Hoje, o serviço principal é o Google Gemini; quando ele não responde, entram Groq e OpenRouter\./,
      ),
    ).toBeInTheDocument()
    expect(compartilhamento.getByText(/transferência internacional/)).toBeInTheDocument()
  })

  it('com uma reserva só, fala dela no singular', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [],
      servicos_de_ia: [
        { nome: 'Google Gemini', papel: 'principal' },
        { nome: 'Groq', papel: 'reserva' },
      ],
    })

    renderizar()

    expect(
      await screen.findByText(/quando ele não responde, entra o Groq\./),
    ).toBeInTheDocument()
  })

  it('sem reserva, não fala de reserva', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [],
      servicos_de_ia: [{ nome: 'Google Gemini', papel: 'principal' }],
    })

    renderizar()

    expect(await screen.findByText(/Hoje, o serviço usado é o Google Gemini\./)).toBeInTheDocument()
    expect(screen.queryByText(/quando ele não responde/)).not.toBeInTheDocument()
  })

  it('sem a lista, fala dos serviços de IA em geral, sem nomear nenhum', async () => {
    renderizar()

    const compartilhamento = within(screen.getByRole('region', { name: 'Com quem compartilhamos' }))

    expect(await screen.findByText('Joana Lima')).toBeInTheDocument()
    expect(compartilhamento.getByText(/sem nome, e-mail ou telefone/)).toBeInTheDocument()
    expect(compartilhamento.queryByText(/Hoje,/)).not.toBeInTheDocument()
  })

  it('diz que os dados e os documentos ficam no Brasil, sem amarrar a uma cidade', () => {
    renderizar()

    const compartilhamento = within(screen.getByRole('region', { name: 'Com quem compartilhamos' }))

    expect(compartilhamento.getByText(/ficam guardados no Brasil/)).toBeInTheDocument()
    expect(screen.queryByText(/São Paulo/)).not.toBeInTheDocument()
  })

  it('não usa jargão técnico', () => {
    renderizar()

    expect(screen.queryByText(/servidor|deploy|banco de dados/i)).not.toBeInTheDocument()
  })

  it('diz por quanto tempo guarda os registros de acesso e os anexos', async () => {
    renderizar()

    const tempo = within(screen.getByRole('region', { name: 'Por quanto tempo' }))

    expect(await tempo.findByText('12 meses')).toBeInTheDocument()
    expect(tempo.getByText('24 meses')).toBeInTheDocument()
    expect(tempo.getByText(/anonimizados/)).toBeInTheDocument()
    expect(tempo.getByText(/descartados/)).toBeInTheDocument()
  })

  it('usa os prazos publicados pela API', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [],
      retencao: {
        eventos_conta_meses: 6,
        anexos_apos_arquivamento_meses: 18,
      },
    })

    renderizar()

    const tempo = within(screen.getByRole('region', { name: 'Por quanto tempo' }))

    expect(await tempo.findByText('6 meses')).toBeInTheDocument()
    expect(tempo.getByText('18 meses')).toBeInTheDocument()
  })

  it('mostra o contato do encarregado de dados, que é um Administrador da AC2 (LGPD, art. 41)', async () => {
    renderizar()

    expect(await screen.findByText('Joana Lima')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'dpo@ac2microbiologia.com.br' })).toHaveAttribute(
      'href',
      'mailto:dpo@ac2microbiologia.com.br'
    )
    expect(screen.getByText(/Administrador da AC2/)).toBeInTheDocument()
  })

  it('sem o nome publicado, diz quem é o encarregado e aponta a administração', async () => {
    estado.lerPrivacidade = vi.fn().mockResolvedValue({
      encarregado: null,
      contatos: [{ nome: 'Suporte', email: 'suporte@ac2.example', papel: '' }],
    })

    renderizar()

    expect(await screen.findByRole('link', { name: 'suporte@ac2.example' })).toBeInTheDocument()
    expect(screen.getByText(/Administrador da AC2/)).toBeInTheDocument()
  })

  it('quem entrou vai direto para Meus dados', () => {
    estado.autenticado = true

    renderizar()

    expect(screen.getByRole('link', { name: 'Abrir Meus dados' })).toHaveAttribute('href', '/perfil')
    expect(screen.getByRole('link', { name: 'Voltar para a plataforma' })).toHaveAttribute('href', '/painel')
  })

  it('quem não entrou volta para a entrada', () => {
    renderizar()

    expect(screen.queryByRole('link', { name: 'Abrir Meus dados' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para a entrada' })).toHaveAttribute('href', '/login')
  })

  it('os direitos aparecem um por item, com o mesmo conteúdo do texto corrido', () => {
    renderizar()

    const direitos = within(screen.getByRole('region', { name: 'Seus direitos' }))
    const itens = direitos.getAllByRole('listitem').map((item) => item.textContent)

    expect(itens).toEqual([
      'Confirmar se tratamos seus dados',
      'Acessar seus dados',
      'Corrigir seus dados',
      'Levar seus dados a outro serviço',
      'Pedir anonimização ou exclusão',
      'Saber com quem seus dados foram compartilhados',
    ])
  })
})

describe('PrivacidadePage — resumo leva a Meus dados', () => {
  it('quem entrou vai de "O que você controla" direto para Meus dados', () => {
    estado.autenticado = true

    renderizar()

    const resumo = within(screen.getByRole('region', { name: 'Em resumo' }))

    expect(resumo.getByRole('link', { name: 'Ir para Meus dados' })).toHaveAttribute('href', '/perfil')
  })

  it('quem não entrou vai para a seção que explica como fazer', () => {
    renderizar()

    const resumo = within(screen.getByRole('region', { name: 'Em resumo' }))

    expect(resumo.queryByRole('link', { name: 'Ir para Meus dados' })).not.toBeInTheDocument()
    expect(resumo.getByRole('link', { name: 'Como fazer' })).toHaveAttribute(
      'href',
      '#privacidade-direitos',
    )
  })
})

/**
 * O índice só dizia onde estavam as seções, não em qual delas a pessoa
 * estava. Ele passa a marcar a seção que chegou ao topo da tela, e a última
 * quando a página termina, porque a última seção é curta e nunca sobe até o
 * topo.
 */
describe('PrivacidadePage — índice acompanha a leitura', () => {
  it('marca a seção que chegou ao topo da tela', () => {
    renderizar()
    posicionarTitulos({
      'Quem é responsável': -900,
      'O que guardamos': -700,
      'Para que usamos e com que base': -400,
      'Com quem compartilhamos': -100,
      'Por quanto tempo': 60,
      'Seus direitos': 500,
    })

    fireEvent.scroll(window)

    expect(indice().getByRole('link', { name: 'Por quanto tempo' })).toHaveAttribute(
      'aria-current',
      'location',
    )
    expect(indice().getByRole('link', { name: 'Seus direitos' })).not.toHaveAttribute('aria-current')
  })

  it('no fim da página marca a última seção', () => {
    const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
    const altura = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight')

    try {
      renderizar()
      posicionarTitulos({ 'Seus direitos': 260, 'Encarregado de dados': 440 })
      Object.defineProperty(window, 'scrollY', { value: 2000, configurable: true })
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        value: 2000 + window.innerHeight,
        configurable: true,
      })

      fireEvent.scroll(window)

      expect(indice().getByRole('link', { name: 'Encarregado de dados' })).toHaveAttribute(
        'aria-current',
        'location',
      )
    } finally {
      if (scrollY) Object.defineProperty(window, 'scrollY', scrollY)
      else delete window.scrollY
      if (altura) Object.defineProperty(document.documentElement, 'scrollHeight', altura)
      else delete document.documentElement.scrollHeight
    }
  })

  it('o item clicado fica marcado na hora, sem esperar a rolagem', async () => {
    const user = userEvent.setup()
    renderizar()

    await user.click(indice().getByRole('link', { name: 'Seus direitos' }))

    expect(indice().getByRole('link', { name: 'Seus direitos' })).toHaveAttribute(
      'aria-current',
      'location',
    )
  })
})

/**
 * Abaixo de 960 px o índice sumia e não havia outro jeito de saltar entre as
 * seções. Agora ele vira uma lista recolhível. A suíte roda sem CSS, então a
 * regra que esconde a lista fechada é conferida na folha de estilo.
 */
describe('PrivacidadePage — índice recolhível em tela menor', () => {
  it('abre e fecha por um botão, e fecha ao escolher uma seção', async () => {
    const user = userEvent.setup()
    renderizar()

    const alternar = indice().getByRole('button', { name: 'Nesta página' })

    expect(alternar).toHaveAttribute('aria-expanded', 'false')

    await user.click(alternar)
    expect(alternar).toHaveAttribute('aria-expanded', 'true')

    await user.click(indice().getByRole('link', { name: 'Por quanto tempo' }))
    expect(alternar).toHaveAttribute('aria-expanded', 'false')
  })

  it('em tela menor só a lista fechada some; o índice continua na página', () => {
    const inicio = estilos.indexOf('@media (max-width: 960px)')
    const bloco = estilos.slice(inicio, estilos.indexOf('\n}', inicio))

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(
      /\.privacidade__indice:not\(\.is-aberto\) \.privacidade__indice-lista \{\s*display: none;/,
    )
    expect(bloco).toMatch(/\.privacidade__indice-alternar \{\s*display: flex;/)
    expect(bloco).not.toMatch(/\.privacidade__indice \{\s*display: none;/)
  })
})
