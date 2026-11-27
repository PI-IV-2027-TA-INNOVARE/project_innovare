import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AbaHistorico from './AbaHistorico'

const CADASTRO = {
  id: 'e1',
  em: Date.parse('2026-09-01T13:00:00.000Z'),
  categoria: 'oportunidade',
  ator: 'Agroindústria Vale Verde',
  texto: 'Problema externo cadastrado.',
}

const OBSERVACAO = {
  id: 'e2',
  em: Date.parse('2026-09-02T13:00:00.000Z'),
  categoria: 'observacao',
  ator: 'Rafael Antunes',
  texto: 'Conversa com o demandante esclareceu o lote.',
}

function renderizar(props = {}) {
  return render(<AbaHistorico historico={[CADASTRO]} {...props} />)
}

describe('AbaHistorico — observação do Supervisor (PB65)', () => {
  /**
   * A observação se registra na etapa Decisão, onde o Supervisor avalia. Dois
   * campos para a mesma nota deixavam a dúvida de qual usar, e a nota escrita
   * aqui sumia ao trocar de aba. A trilha segue mostrando todas.
   */
  it('a trilha mostra as observações, mas não oferece outro campo para elas', () => {
    renderizar()

    expect(screen.queryByLabelText(/observação/i)).not.toBeInTheDocument()
  })

  it('a observação tem filtro próprio, separado do resto', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar({ historico: [CADASTRO, OBSERVACAO] })

    await usuario.click(screen.getByRole('button', { name: /^Observações/ }))

    expect(screen.getByText('Conversa com o demandante esclareceu o lote.')).toBeInTheDocument()
    expect(screen.queryByText('Problema externo cadastrado.')).not.toBeInTheDocument()
  })
})

describe('AbaHistorico — registro só de leitura', () => {
  /**
   * O pedido de complementação ficava no topo, logo abaixo de "nada aqui é
   * editado ou apagado". Foi para a aba Contexto, onde está a entrada.
   */
  it('não tem formulário: o pedido de complementação fica em Contexto', () => {
    renderizar()

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /solicitar|pedir/i })).toBeNull()
  })
})

describe('AbaHistorico — filtros', () => {
  /**
   * Eram oito filtros para três eventos, quase todos levando a "Nenhum
   * evento". Agora só aparecem as categorias que têm eventos, com a conta.
   */
  it('mostra só as categorias que têm eventos, com a conta de cada uma', () => {
    renderizar({ historico: [CADASTRO, { ...CADASTRO, id: 'e3' }, OBSERVACAO] })

    const filtros = screen.getByRole('group', { name: /filtrar o histórico/i })
    const nomes = within(filtros).getAllByRole('button').map((botao) => botao.getAttribute('aria-label'))

    expect(nomes).toEqual(['Tudo, 3 eventos', 'Oportunidade, 2 eventos', 'Observações, 1 evento'])
  })

  it('com uma categoria só, não mostra filtro', () => {
    renderizar()

    expect(screen.queryByRole('group', { name: /filtrar o histórico/i })).toBeNull()
  })

  /**
   * "Matching" e "Copiloto IA" não são os nomes que a pessoa vê nas etapas.
   */
  it('usa os nomes das etapas, sem jargão', () => {
    renderizar({
      historico: [
        { ...CADASTRO, id: 'e4', categoria: 'matching', texto: 'Equipe potencial gerada.' },
        { ...CADASTRO, id: 'e5', categoria: 'copiloto', texto: 'O Copiloto leu a entrada.' },
      ],
    })

    const filtros = screen.getByRole('group', { name: /filtrar o histórico/i })

    expect(within(filtros).getByRole('button', { name: /^Equipe potencial/ })).toBeInTheDocument()
    expect(within(filtros).getByRole('button', { name: /^Copiloto, / })).toBeInTheDocument()
    expect(screen.queryByText(/matching/i)).toBeNull()
    expect(screen.queryByText(/copiloto ia/i)).toBeNull()
  })
})

describe('AbaHistorico — datas', () => {
  /**
   * Num registro permanente, "Há 28 dias" sozinho não basta para conferir
   * quando algo aconteceu. Os eventos vêm agrupados pelo dia, com a data, e
   * cada um traz a hora.
   */
  it('agrupa os eventos por dia, do mais recente, com data e hora', () => {
    renderizar({ historico: [CADASTRO, OBSERVACAO, { ...OBSERVACAO, id: 'e6', em: OBSERVACAO.em + 60_000 }] })

    const dias = screen.getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent)

    expect(dias).toEqual(['02/09/2026', '01/09/2026'])

    const primeiroDia = screen.getByRole('list', { name: '02/09/2026' })
    expect(within(primeiroDia).getAllByRole('listitem')).toHaveLength(2)
    expect(within(primeiroDia).getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(2)
  })

  it('chama de hoje e ontem os dias mais próximos', () => {
    const agora = Date.now()

    renderizar({
      historico: [
        { ...CADASTRO, id: 'h', em: agora },
        { ...OBSERVACAO, id: 'o', em: agora - 24 * 60 * 60 * 1000 },
      ],
    })

    const dias = screen.getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent)

    expect(dias[0]).toMatch(/^Hoje, \d{2}\/\d{2}\/\d{4}$/)
    expect(dias[1]).toMatch(/^Ontem, \d{2}\/\d{2}\/\d{4}$/)
  })
})

describe('AbaHistorico — versão anterior da proposta (PB88)', () => {
  it('deixa consultar o texto que o elemento tinha antes', async () => {
    const usuario = userEvent.setup({ delay: null })
    renderizar({
      historico: [
        {
          id: 'e2',
          em: Date.parse('2026-11-12T10:00:00.000Z'),
          categoria: 'copiloto',
          ator: 'Rafael Antunes',
          texto: 'Sugestão do Copiloto aceita na proposta.',
          anterior: [{ elemento: 'metodologia', rotulo: 'Metodologia', texto: 'PCR em tempo real.' }],
        },
      ],
    })

    expect(screen.getByText('PCR em tempo real.')).not.toBeVisible()

    await usuario.click(screen.getByRole('button', { name: /ver a versão anterior/i }))

    expect(screen.getByText('PCR em tempo real.')).toBeVisible()
    expect(screen.getByText('Metodologia')).toBeVisible()
  })

  it('evento sem versão anterior não oferece consulta', () => {
    renderizar()

    expect(screen.queryByRole('button', { name: /ver a versão anterior/i })).not.toBeInTheDocument()
  })
})
