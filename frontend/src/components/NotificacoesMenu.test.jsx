import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificacoesMenu from './NotificacoesMenu'

const estado = vi.hoisted(() => ({
  user: null,
  listarNotificacoes: null,
  contarNotificacoesNaoLidas: null,
  marcarNotificacaoLida: null,
  marcarTodasNotificacoesLidas: null,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: estado.user }),
}))

vi.mock('../services/pdConnectApi', () => ({
  listarNotificacoes: (...args) => estado.listarNotificacoes(...args),
  contarNotificacoesNaoLidas: (...args) => estado.contarNotificacoesNaoLidas(...args),
  marcarNotificacaoLida: (...args) => estado.marcarNotificacaoLida(...args),
  marcarTodasNotificacoesLidas: (...args) =>
    estado.marcarTodasNotificacoesLidas(...args),
}))

const DEMANDANTE = { displayName: 'Joana Alves', role: 'demandante' }
const SUPERVISOR = { displayName: 'Rafael Antunes', role: 'supervisor' }
const ADMINISTRADOR = { displayName: 'Ana Souza', role: 'administrador' }

const COMPLEMENTACAO = {
  id_notificacao: 7,
  tipo: 'oportunidade.complementacao_solicitada',
  titulo: 'OP-2026-014 precisa de complementação',
  mensagem: 'Faltam os laudos microbiológicos dos lotes afetados.',
  entidade: 'oportunidade',
  entidade_id: 'OP-2026-014',
  lida_em: null,
  criado_em: '2026-09-20T10:00:00.000Z',
}

const JA_LIDA = {
  ...COMPLEMENTACAO,
  id_notificacao: 3,
  tipo: 'oportunidade.complementacao_recebida',
  titulo: 'OP-2026-011 recebeu complementação',
  mensagem: 'Joana Alves respondeu ao pedido de revisão.',
  entidade_id: 'OP-2026-011',
  lida_em: '2026-09-18T12:00:00.000Z',
  criado_em: '2026-09-18T10:00:00.000Z',
}

const caixa = (...itens) => ({ count: itens.length, results: itens })

const renderizar = () =>
  render(
    <MemoryRouter>
      <NotificacoesMenu />
    </MemoryRouter>
  )

const sino = () => screen.getByRole('button', { name: /notifica/i })

const abrir = async () => {
  const usuario = userEvent.setup()
  await usuario.click(sino())

  return usuario
}

const painel = () => screen.getByRole('dialog', { name: /notifica/i })

beforeEach(() => {
  estado.user = DEMANDANTE
  estado.contarNotificacoesNaoLidas = vi.fn().mockResolvedValue({ total: 2 })
  estado.listarNotificacoes = vi
    .fn()
    .mockResolvedValue(caixa(COMPLEMENTACAO, JA_LIDA))
  estado.marcarNotificacaoLida = vi
    .fn()
    .mockResolvedValue({ ...COMPLEMENTACAO, lida_em: '2026-09-21T09:00:00.000Z' })
  estado.marcarTodasNotificacoesLidas = vi.fn().mockResolvedValue({ total: 2 })
})

describe('Selo do sino', () => {
  it('anuncia quantos avisos aguardam leitura', async () => {
    renderizar()

    expect(await screen.findByRole('button', { name: /2 não lidas/i })).toBeInTheDocument()
  })

  it('concorda em número com o que anuncia', async () => {
    estado.contarNotificacoesNaoLidas = vi.fn().mockResolvedValue({ total: 1 })
    renderizar()

    expect(
      await screen.findByRole('button', { name: /1 não lida$/i })
    ).toBeInTheDocument()
  })

  it('não puxa a caixa inteira só para contar', async () => {
    /**
     * O selo aparece em toda tela. Se contar exigisse a lista, cada navegação
     * pagaria uma página de notificações para desenhar um número.
     */
    renderizar()

    await waitFor(() => expect(estado.contarNotificacoesNaoLidas).toHaveBeenCalled())

    expect(estado.listarNotificacoes).not.toHaveBeenCalled()
  })

  it('não mostra selo quando a caixa está limpa', async () => {
    estado.contarNotificacoesNaoLidas = vi.fn().mockResolvedValue({ total: 0 })
    renderizar()

    await waitFor(() => expect(estado.contarNotificacoesNaoLidas).toHaveBeenCalled())

    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(sino()).toBeInTheDocument()
  })

  it('mantém a navegação de pé quando o contador falha', async () => {
    /**
     * Notificação é acessório do fluxo: uma falha aqui não pode derrubar a
     * barra que leva a pessoa ao trabalho dela.
     */
    estado.contarNotificacoesNaoLidas = vi.fn().mockRejectedValue(new Error('offline'))
    renderizar()

    await waitFor(() => expect(estado.contarNotificacoesNaoLidas).toHaveBeenCalled())

    expect(sino()).toBeInTheDocument()
  })
})

describe('Caixa de notificações', () => {
  it('lista os avisos ao abrir', async () => {
    renderizar()
    await abrir()

    const lista = within(painel())

    expect(await lista.findByText(/OP-2026-014 precisa de complementação/)).toBeInTheDocument()
    expect(lista.getByText(/Faltam os laudos microbiológicos/)).toBeInTheDocument()
  })

  it('distingue o que ainda não foi lido', async () => {
    renderizar()
    await abrir()

    const naoLida = await screen.findByRole('listitem', {
      name: /OP-2026-014 precisa de complementação/,
    })
    const lida = screen.getByRole('listitem', {
      name: /OP-2026-011 recebeu complementação/,
    })

    expect(naoLida).toHaveAttribute('data-nao-lida', 'true')
    expect(lida).toHaveAttribute('data-nao-lida', 'false')
  })

  it('avisa quando não há nada para ler', async () => {
    estado.contarNotificacoesNaoLidas = vi.fn().mockResolvedValue({ total: 0 })
    estado.listarNotificacoes = vi.fn().mockResolvedValue(caixa())

    renderizar()
    await abrir()

    expect(await within(painel()).findByText(/nenhum aviso/i)).toBeInTheDocument()
  })

  it('explica a falha em vez de mostrar caixa vazia', async () => {
    estado.listarNotificacoes = vi.fn().mockRejectedValue(new Error('offline'))

    renderizar()
    await abrir()

    expect(await within(painel()).findByRole('alert')).toHaveTextContent(
      /não foi possível carregar/i
    )
  })
})

describe('Destino do clique', () => {
  it('leva o Demandante ao próprio problema', async () => {
    renderizar()
    await abrir()

    const link = await screen.findByRole('link', {
      name: /OP-2026-014 precisa de complementação/,
    })

    expect(link).toHaveAttribute('href', '/problemas/OP-2026-014')
  })

  it('leva o Supervisor à condução da oportunidade', async () => {
    estado.user = SUPERVISOR

    renderizar()
    await abrir()

    const link = await screen.findByRole('link', {
      name: /OP-2026-014 precisa de complementação/,
    })

    expect(link).toHaveAttribute('href', '/oportunidades/OP-2026-014')
  })

  it('não vira link para quem não tem a tela do registro', async () => {
    /**
     * O Administrador não acompanha oportunidade. Um link levaria ao
     * /sem-acesso — pior que texto sem link, porque promete e nega.
     */
    estado.user = ADMINISTRADOR

    renderizar()
    await abrir()

    await screen.findByText(/OP-2026-014 precisa de complementação/)

    expect(
      screen.queryByRole('link', { name: /OP-2026-014/ })
    ).not.toBeInTheDocument()
  })

  it('dá baixa no aviso ao abri-lo', async () => {
    renderizar()
    const usuario = await abrir()

    const link = await screen.findByRole('link', {
      name: /OP-2026-014 precisa de complementação/,
    })
    await usuario.click(link)

    expect(estado.marcarNotificacaoLida).toHaveBeenCalledWith(7)
  })

  it('não repete a baixa de um aviso já lido', async () => {
    renderizar()
    const usuario = await abrir()

    const link = await screen.findByRole('link', {
      name: /OP-2026-011 recebeu complementação/,
    })
    await usuario.click(link)

    expect(estado.marcarNotificacaoLida).not.toHaveBeenCalled()
  })
})

describe('Marcar todas como lidas', () => {
  it('limpa o selo de uma vez', async () => {
    renderizar()
    const usuario = await abrir()

    await usuario.click(
      await within(painel()).findByRole('button', { name: /marcar todas/i })
    )

    expect(estado.marcarTodasNotificacoesLidas).toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByText('2')).not.toBeInTheDocument()
    )
  })

  it('não oferece a ação quando não há o que marcar', async () => {
    estado.contarNotificacoesNaoLidas = vi.fn().mockResolvedValue({ total: 0 })
    estado.listarNotificacoes = vi.fn().mockResolvedValue(caixa(JA_LIDA))

    renderizar()
    await abrir()

    await within(painel()).findByText(/OP-2026-011/)

    expect(
      within(painel()).queryByRole('button', { name: /marcar todas/i })
    ).not.toBeInTheDocument()
  })
})
