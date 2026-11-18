import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParametrosSection from './ParametrosSection'

const auth = { user: null, isAuthenticated: true }

const api = vi.hoisted(() => ({
  listarCriteriosPreAnalise: null,
  importarCriteriosPreAnalise: null,
  lerContatosSuporte: null,
  gravarContatosSuporte: null,
  restaurarContatosSuporte: null,
  lerSituacaoDaBasePipe: null,
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('../../../services/pdConnectApi', () => ({
  listarCriteriosPreAnalise: (...args) => api.listarCriteriosPreAnalise(...args),
  importarCriteriosPreAnalise: (...args) => api.importarCriteriosPreAnalise(...args),
  lerContatosSuporte: (...args) => api.lerContatosSuporte(...args),
  gravarContatosSuporte: (...args) => api.gravarContatosSuporte(...args),
  restaurarContatosSuporte: (...args) => api.restaurarContatosSuporte(...args),
  lerSituacaoDaBasePipe: (...args) => api.lerSituacaoDaBasePipe(...args),
}))

const CONTATOS_PADRAO = [
  { nome: 'Núcleo de P&D — AC2', email: 'pd@ac2microbiologia.com.br', papel: 'Cadastro e liberação de acesso' },
  { nome: 'Administração da plataforma', email: 'admin@ac2microbiologia.com.br', papel: 'Contas, perfis e permissões' },
]

function criterio(id, codigo, dimensao, dimensao_rotulo, descricao, versao = 'V2') {
  return { id_criterio: id, codigo, dimensao, dimensao_rotulo, descricao, versao }
}

const CRITERIOS = [
  criterio(1, 'B2', 'equipe_supervisao', 'Equipe e supervisão', 'Capacidade técnica — A equipe tem experiência para executar o projeto?'),
  criterio(2, 'A4', 'desafio_tecnologico', 'Desafio tecnológico', 'Desafio frente ao estado da arte — Os desafios estão situados frente ao estado da arte?'),
  criterio(3, 'B1', 'equipe_supervisao', 'Equipe e supervisão', 'Liderança técnica — PR ou PP possui perfil para liderar o desenvolvimento?'),
]

function situacao(mudancas = {}) {
  return {
    disponivel: true,
    versao_do_arquivo: 'V2',
    chamada: '1ª Rodada 2026 — Chamada FAPESP 33/2026',
    versao_em_uso: 'V2',
    pendente: false,
    novos: [],
    alterados: [],
    removidos: [],
    sem_dimensao: [],
    revisao_prevista: null,
    ...mudancas,
  }
}

beforeEach(() => {
  api.lerContatosSuporte = vi.fn().mockResolvedValue(CONTATOS_PADRAO)
  api.gravarContatosSuporte = vi.fn().mockImplementation(async (contatos) => contatos)
  api.restaurarContatosSuporte = vi.fn().mockResolvedValue(CONTATOS_PADRAO)
  api.listarCriteriosPreAnalise = vi.fn().mockResolvedValue(CRITERIOS)
  api.importarCriteriosPreAnalise = vi.fn()
  api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(situacao())
  auth.user = {
    role: 'administrador',
    displayName: 'Administração da plataforma',
    email: 'admin@ac2microbiologia.com.br',
  }
})

function renderParametros() {
  return render(<ParametrosSection />)
}

describe('ParametrosSection', () => {
  it('parte dos contatos que o servidor devolve', async () => {
    renderParametros()

    expect(await screen.findByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(screen.getByDisplayValue('admin@ac2microbiologia.com.br')).toBeInTheDocument()
  })

  it('recusa e-mail inválido sem chamar o servidor', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pd-arroba-ac2')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).not.toHaveBeenCalled()
  })

  it('grava no servidor, para valer na tela de acesso restrito de todos', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'pesquisa@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/contatos de suporte atualizados/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).toHaveBeenCalledWith([
      { ...CONTATOS_PADRAO[0], email: 'pesquisa@ac2microbiologia.com.br' },
      CONTATOS_PADRAO[1],
    ])
  })

  it('mostra o motivo quando o servidor recusa a gravação', async () => {
    const user = userEvent.setup()
    api.gravarContatosSuporte = vi.fn().mockRejectedValue({ message: 'Sem permissão.' })
    renderParametros()

    await user.type(await screen.findByDisplayValue('pd@ac2microbiologia.com.br'), 'x')
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/sem permissão/i)).toHaveClass('admin-toast--error')
  })

  it('adiciona e remove contato', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    await user.click(screen.getByRole('button', { name: /adicionar contato/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /remover contato administração da plataforma/i }))
    expect(screen.getAllByLabelText('E-mail')).toHaveLength(2)
  })

  it('não deixa salvar uma lista vazia — é a saída de quem foi barrado', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    for (const nome of [/remover contato núcleo/i, /remover contato administração/i]) {
      await user.click(screen.getByRole('button', { name: nome }))
    }

    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/deixe ao menos um contato/i)).toBeInTheDocument()
    expect(api.gravarContatosSuporte).not.toHaveBeenCalled()
  })

  it('pede confirmação antes de restaurar, porque restaurar vale na hora', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    await user.click(screen.getByRole('button', { name: 'Restaurar contatos padrão' }))

    const dialogo = screen.getByRole('dialog', { name: /restaurar contatos padrão/i })
    expect(dialogo).toHaveTextContent(/vale na hora, sem passar pelo salvar/i)
    expect(dialogo).not.toHaveTextContent(/privacidade/i)
    expect(api.restaurarContatosSuporte).not.toHaveBeenCalled()

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.restaurarContatosSuporte).not.toHaveBeenCalled()
  })

  it('restaura o padrão da AC2 pelo servidor depois de confirmado', async () => {
    const user = userEvent.setup()
    renderParametros()

    const campo = await screen.findByDisplayValue('pd@ac2microbiologia.com.br')
    await user.clear(campo)
    await user.type(campo, 'outro@ac2microbiologia.com.br')
    await user.click(screen.getByRole('button', { name: 'Restaurar contatos padrão' }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent(/o que você mudou e ainda não salvou também se perde/i)

    await user.click(within(dialogo).getByRole('button', { name: 'Restaurar contatos padrão' }))

    expect(await screen.findByDisplayValue('pd@ac2microbiologia.com.br')).toBeInTheDocument()
    expect(api.restaurarContatosSuporte).toHaveBeenCalled()
    expect(screen.queryByText(/há alterações não salvas/i)).not.toBeInTheDocument()
  })

  it('avisa, antes de restaurar, que o encarregado de dados sai da página de privacidade', async () => {
    const user = userEvent.setup()
    api.lerContatosSuporte = vi.fn().mockResolvedValue([
      ...CONTATOS_PADRAO,
      { nome: 'Ana Souza', email: 'dpo@ac2microbiologia.com.br', papel: 'Encarregado de dados' },
    ])
    renderParametros()
    await screen.findByDisplayValue('dpo@ac2microbiologia.com.br')

    await user.click(screen.getByRole('button', { name: 'Restaurar contatos padrão' }))

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'O contato do encarregado de dados, Ana Souza, sai da página de privacidade.'
    )
  })

  it('mostra que há alteração não salva e deixa descartar', async () => {
    const user = userEvent.setup()
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    expect(screen.queryByText(/há alterações não salvas/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar contatos/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /descartar/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /remover contato administração/i }))

    expect(screen.getByText(/há alterações não salvas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar contatos/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /descartar/i }))

    expect(screen.getAllByLabelText('E-mail')).toHaveLength(2)
    expect(screen.queryByText(/há alterações não salvas/i)).not.toBeInTheDocument()
    expect(api.gravarContatosSuporte).not.toHaveBeenCalled()
  })

  it('para de acusar alteração pendente depois de salvar', async () => {
    const user = userEvent.setup()
    renderParametros()

    await user.type(await screen.findByDisplayValue('Cadastro e liberação de acesso'), ' e senhas')
    expect(screen.getByText(/há alterações não salvas/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    expect(await screen.findByText(/contatos de suporte atualizados/i)).toBeInTheDocument()
    expect(screen.queryByText(/há alterações não salvas/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /salvar contatos/i })).toBeDisabled()
  })

  it('a lixeira diz o que faz a quem passa o mouse', async () => {
    renderParametros()

    const botao = await screen.findByRole('button', { name: /remover contato núcleo/i })

    expect(botao).toHaveAttribute('title', 'Remover contato')
  })

  it('identifica cada contato e marca o único que aparece na página de privacidade', async () => {
    api.lerContatosSuporte = vi.fn().mockResolvedValue([
      ...CONTATOS_PADRAO,
      { nome: 'Ana Souza', email: 'dpo@ac2microbiologia.com.br', papel: 'Encarregado de dados' },
      { nome: 'Bruno Lima', email: 'dpo2@ac2microbiologia.com.br', papel: 'Encarregado substituto' },
    ])
    renderParametros()
    await screen.findByDisplayValue('dpo@ac2microbiologia.com.br')

    expect(screen.getByRole('group', { name: /^contato 1$/i })).toBeInTheDocument()

    const encarregado = screen.getByRole('group', { name: /contato 3/i })
    expect(within(encarregado).getByText('Aparece na página de privacidade')).toBeInTheDocument()
    expect(screen.getAllByText('Aparece na página de privacidade')).toHaveLength(1)
  })

  it('marca como inválido só o campo que está errado', async () => {
    const user = userEvent.setup()
    renderParametros()

    await user.clear(await screen.findByDisplayValue('Núcleo de P&D — AC2'))
    await user.click(screen.getByRole('button', { name: /salvar contatos/i }))

    const contato = screen.getByRole('group', { name: /contato 1/i })
    const nome = within(contato).getByLabelText('Nome')

    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveAccessibleDescription('Informe o nome do contato.')
    expect(within(contato).getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'false')
  })

  it('mostra o nome do critério antes do código, que fica em segundo plano', async () => {
    renderParametros()

    const nome = await screen.findByText('Liderança técnica')
    const codigo = within(nome.closest('li')).getByText('B1')

    expect(nome.compareDocumentPosition(codigo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('diz, sem termo técnico, que quem atualiza os critérios é a equipe de desenvolvimento', async () => {
    renderParametros()

    const aviso = await screen.findByText(/a equipe de desenvolvimento do P&D Connect atualiza estes critérios/i)

    expect(aviso).toHaveTextContent(/quando a FAPESP muda as regras do PIPE/i)
    expect(aviso).toHaveTextContent(/a versão nova aparece aqui para você ativar/i)
    expect(screen.queryByText(/servidor|arquivo da base/i)).not.toBeInTheDocument()
  })

  it('explica, fechado até alguém abrir, o que é cada letra do código e por que ele aparece', async () => {
    renderParametros()

    const resumo = await screen.findByText('O que significam os códigos A1, B2…?')
    const legenda = resumo.closest('details')

    expect(legenda).not.toHaveAttribute('open')
    expect(within(legenda).getByText('A · Projeto')).toBeInTheDocument()
    expect(within(legenda).getByText('B · Equipe')).toBeInTheDocument()
    expect(within(legenda).queryByText(/· Mercado/)).not.toBeInTheDocument()
    expect(legenda).toHaveTextContent(/ligar cada lacuna ao critério certo/i)
    expect(legenda).toHaveTextContent(/itens a\) a f\) dos critérios de análise das normas do PIPE/i)
  })

  it('guarda a lista de critérios num bloco fechado, para a tela não ficar longa', async () => {
    renderParametros()

    const lista = (await screen.findByText('Ver os 3 critérios da V2')).closest('details')

    expect(lista).not.toHaveAttribute('open')
    expect(within(lista).getByText('Liderança técnica')).toBeInTheDocument()
    expect(within(lista).getByText('O que significam os códigos A1, B2…?')).toBeInTheDocument()
  })

  it('não mostra a explicação dos códigos quando não há critério carregado', async () => {
    api.listarCriteriosPreAnalise = vi.fn().mockResolvedValue([])
    renderParametros()

    await screen.findByText(/nenhum critério carregado/i)

    expect(screen.queryByText('O que significam os códigos A1, B2…?')).not.toBeInTheDocument()
  })

  it('mostra os critérios agrupados por dimensão, na ordem de referência', async () => {
    renderParametros()

    const grupos = await screen.findAllByRole('heading', { level: 4 })

    expect(grupos.map((grupo) => grupo.textContent)).toEqual([
      'Desafio tecnológico1',
      'Equipe e supervisão2',
    ])

    const equipe = grupos[1].closest('section')
    const codigos = within(equipe).getAllByText(/^B\d$/).map((item) => item.textContent)

    expect(codigos).toEqual(['B1', 'B2'])
  })

  it('separa o nome do critério da pergunta que ele faz', async () => {
    renderParametros()

    expect(await screen.findByText('Liderança técnica')).toBeInTheDocument()
    expect(
      screen.getByText('PR ou PP possui perfil para liderar o desenvolvimento?')
    ).toBeInTheDocument()
  })

  it('resume a versão vigente sem jargão de engenharia', async () => {
    renderParametros()

    expect(await screen.findByText('Versão V2 em uso')).toBeInTheDocument()
    expect(screen.getByText('3 critérios em 2 dimensões')).toBeInTheDocument()
    expect(screen.queryByText(/product owner|baseline|trilha|critério\(s\)/i)).not.toBeInTheDocument()
  })

  it('avisa quando ainda não há critério carregado', async () => {
    api.listarCriteriosPreAnalise = vi.fn().mockResolvedValue([])
    renderParametros()

    expect(
      await screen.findByText(/nenhum critério carregado/i)
    ).toBeInTheDocument()
  })

  it('com o arquivo em dia, não oferece botão e diz de qual chamada a base veio', async () => {
    renderParametros()

    expect(await screen.findByText(/1ª Rodada 2026 — Chamada FAPESP 33\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/em dia com o arquivo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ativar versão|atualizar critérios/i })).not.toBeInTheDocument()
  })

  it('com versão nova no arquivo, mostra o que muda e só ativa depois de confirmar', async () => {
    const user = userEvent.setup()
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({
        versao_do_arquivo: 'V3',
        pendente: true,
        novos: [{ codigo: 'G1', titulo: 'Impacto ambiental' }],
        alterados: [{ codigo: 'A3', titulo: 'Metodologia revisada' }],
        removidos: [{ codigo: 'F3', titulo: 'Histórico de financiamentos' }],
      })
    )
    api.importarCriteriosPreAnalise = vi.fn().mockResolvedValue({ versao: 'V3', criados: 23, atualizados: 0 })
    renderParametros()

    expect(await screen.findByText(/a versão V3 dos critérios está pronta para ativar/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ativar versão V3' }))

    const dialogo = screen.getByRole('dialog', { name: 'Ativar versão V3?' })
    expect(dialogo).toHaveTextContent(/as pré-análises já feitas continuam com a V2/i)
    expect(dialogo).toHaveTextContent('Entra 1: Impacto ambiental (G1)')
    expect(dialogo).toHaveTextContent('Muda de texto 1: Metodologia revisada (A3)')
    expect(dialogo).toHaveTextContent('Sai 1: Histórico de financiamentos (F3)')
    expect(api.importarCriteriosPreAnalise).not.toHaveBeenCalled()

    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(situacao({ versao_em_uso: 'V3', versao_do_arquivo: 'V3' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Ativar versão V3' }))

    expect(api.importarCriteriosPreAnalise).toHaveBeenCalled()
    expect(
      await screen.findByText('Versão V3 ativada. As próximas pré-análises passam a usá-la.')
    ).toBeInTheDocument()
    expect(api.lerSituacaoDaBasePipe).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Ativar versão V3' })).not.toBeInTheDocument()
  })

  it('não deixa ativar versão com critério que ainda não tem dimensão', async () => {
    const user = userEvent.setup()
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({ versao_do_arquivo: 'V3', pendente: true, sem_dimensao: ['G1'] })
    )
    renderParametros()

    await user.click(await screen.findByRole('button', { name: 'Ativar versão V3' }))

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent(/G1 ainda não tem dimensão na pré-análise/i)
    expect(within(dialogo).getByRole('button', { name: 'Ativar versão V3' })).toBeDisabled()
  })

  it('na mesma versão, oferece aplicar as mudanças de texto e avisa que o relatório também muda', async () => {
    const user = userEvent.setup()
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({ pendente: true, alterados: [{ codigo: 'A3', titulo: 'Metodologia revisada' }] })
    )
    renderParametros()

    await user.click(await screen.findByRole('button', { name: 'Aplicar mudanças da V2' }))

    expect(screen.getByRole('dialog', { name: 'Aplicar mudanças da V2?' })).toHaveTextContent(
      /inclusive no relatório das pré-análises já feitas com ela/i
    )
  })

  it('avisa quando a própria base prevê uma versão nova que já devia ter saído', async () => {
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({
        revisao_prevista: {
          versao: 'V3 planejada',
          data: '2026-09-15',
          descricao: 'Reavaliar novas Normas PIPE que entram em vigor em 15/09/2026; nunca sobrescrever retroativamente a baseline.',
          vencida: true,
        },
      })
    )
    renderParametros()

    const aviso = (await screen.findByText('Revisão pendente desde 15/09/2026')).closest('.admin-callout')

    expect(aviso).toHaveClass('admin-callout--alerta')
    expect(aviso).toHaveTextContent(/os critérios em uso podem não refletir as regras mais recentes do PIPE/i)
    expect(aviso).toHaveTextContent(/quem faz a revisão é a equipe de desenvolvimento do P&D Connect/i)
    expect(screen.queryByText(/motivo registrado|baseline/i)).not.toBeInTheDocument()
  })

  it('não fala da próxima revisão antes de a data chegar', async () => {
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({
        revisao_prevista: { versao: 'Próxima revisão', data: '2099-11-16', descricao: 'Nova chamada.', vencida: false },
      })
    )
    renderParametros()

    await screen.findByText(/a equipe de desenvolvimento do P&D Connect atualiza estes critérios/i)

    expect(screen.queryByText(/16\/11\/2099|revisão pendente/i)).not.toBeInTheDocument()
    expect(document.querySelector('.admin-callout--alerta')).toBeNull()
  })

  it('leva às normas do PIPE no site da FAPESP, numa aba nova', async () => {
    renderParametros()

    const link = await screen.findByRole('link', { name: /normas do PIPE/i })

    expect(link).toHaveAttribute('href', 'https://fapesp.br/pipe/normas')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('explica a seção sem jargão técnico', async () => {
    renderParametros()

    expect(
      await screen.findByText(/o que você salvar aqui passa a valer na hora para todos/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/deploy|servidor|baseline/i)).not.toBeInTheDocument()
  })

  it('não oferece restaurar quando os contatos já são os padrão da AC2', async () => {
    api.lerContatosSuporte = vi.fn().mockResolvedValue(
      CONTATOS_PADRAO.map((contato) => ({ ...contato, padrao: true }))
    )
    renderParametros()
    await screen.findByDisplayValue('pd@ac2microbiologia.com.br')

    expect(screen.getByRole('button', { name: 'Restaurar contatos padrão' })).toBeDisabled()
  })

  it('avisa quando o arquivo da base não está no servidor', async () => {
    api.lerSituacaoDaBasePipe = vi.fn().mockResolvedValue(
      situacao({ disponivel: false, versao_do_arquivo: '' })
    )
    renderParametros()

    expect(
      await screen.findByText(/os critérios não estão disponíveis no sistema. avise a equipe de desenvolvimento/i)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ativar versão/i })).not.toBeInTheDocument()
  })

  it('não oferece edição dos critérios na tela', async () => {
    renderParametros()

    const criterios = screen
      .getByRole('heading', { name: /critérios da pré-análise/i })
      .closest('.perfil-card')

    expect(await within(criterios).findByText(/não são editados nesta tela/i)).toBeInTheDocument()
    expect(within(criterios).queryByRole('textbox')).not.toBeInTheDocument()
  })
})
