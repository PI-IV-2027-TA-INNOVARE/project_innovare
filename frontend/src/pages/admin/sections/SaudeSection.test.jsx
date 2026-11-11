import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SaudeSection from './SaudeSection'

const api = vi.hoisted(() => ({ obterSaudeDaPlataforma: null }))

vi.mock('../../../services/pdConnectApi', () => ({
  obterSaudeDaPlataforma: (...args) => api.obterSaudeDaPlataforma(...args),
}))

const IA = {
  janela_desde: '2026-10-01T00:00:00Z',
  houve_execucao: true,
  custo_apurado: false,
  estado: 'sem_apuracao',
  percentual_de_alerta: 80,
  chamadas: 7,
  por_tipo: { copiloto: 5, matching: 2 },
  por_status: { ok: 6, erro: 1 },
  falhas: 2,
  erros: 1,
  fallbacks: 1,
  tokens_entrada: 1000,
  tokens_saida: 500,
  contexto_medio_tokens: 500,
  revisao_humana: {
    propostas_de_ia: 4,
    propostas_revisadas: 3,
    indicacoes: 9,
    indicacoes_validadas: 5,
    equipes_geradas: 2,
    recomendacoes: 6,
    recomendacoes_acatadas: 2,
  },
  custo_estimado_brl: 0,
  teto_mensal_brl: 50,
  percentual_do_teto: 0,
  saldo_brl: 50,
  p50_ms: 800,
  p90_ms: 1500,
  provedor_configurado: true,
  rerank_habilitado: false,
  modelo: 'gemini-2.5-flash',
  provedores: [
    {
      nome: 'google',
      rotulo: 'Google Gemini',
      papel: 'principal',
      configurado: true,
      modelo: 'gemini-2.5-flash',
      chamadas: 7,
      falhas: 2,
      erros: 1,
      fallbacks: 1,
      custo_estimado_brl: 0,
      custo_apurado: false,
      latencia_media_ms: 900,
      preco_entrada_brl_por_milhao: 0,
      preco_saida_brl_por_milhao: 0,
    },
  ],
  ultima_execucao: {
    id: 'run-1',
    tipo: 'copiloto',
    status: 'ok',
    versao_prompt: 'copiloto_v1',
    criado_em: '2026-10-14T10:00:00Z',
    fallback_usado: true,
    erro: '',
  },
}

const SAUDE = {
  desempenho: {
    amostras: 42,
    p50_ms: 120.5,
    p90_ms: 880,
    limite_ms: 3000,
    acima_do_limite: 0,
  },
  desempenho_erro: '',
  ia: IA,
  ia_erro: '',
  comparacao: {
    ligada: true,
    modelo: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    peso_na_nota: 0.45,
    rodadas_no_mes: 3,
    rodadas_sem_afinidade: 0,
    ultimo_calculo: '2026-10-25T17:25:36Z',
  },
  comparacao_erro: '',
  jobs: {
    configurado: false,
    esperada: false,
    motivo: 'Fila assíncrona não configurada neste ambiente.',
  },
  jobs_erro: '',
  banco: { responde: true, erro: '' },
  banco_erro: '',
}

function comConsumo(extra) {
  return { ...SAUDE, ia: { ...IA, ...extra } }
}

const PRINCIPAL = IA.provedores[0]

const RESERVA = {
  ...PRINCIPAL,
  papel: 'reserva',
  modelo: 'gemini-2.5-pro',
  chamadas: 0,
  falhas: 0,
  erros: 0,
  fallbacks: 0,
  latencia_media_ms: null,
}

function comProvedores(...provedores) {
  return comConsumo({ provedores })
}

async function provedores() {
  return screen.findByRole('list', { name: /consumo do mês por provedor de ia/i })
}

function comVelocidade(extra) {
  return { ...SAUDE, desempenho: { ...SAUDE.desempenho, ...extra } }
}

function comComparacao(extra) {
  return { ...SAUDE, comparacao: { ...SAUDE.comparacao, ...extra } }
}

async function verificacoes() {
  return screen.findByRole('group', { name: /como a plataforma está/i })
}

async function cartao(pergunta) {
  const grupo = await verificacoes()

  return within(grupo).getByRole('article', { name: pergunta })
}

async function abrirDetalhes() {
  await userEvent.click(
    await screen.findByRole('button', { name: /detalhes para o suporte técnico/i }),
  )
}

describe('SaudeSection — consumo de IA', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('põe o consumo do mês como informação principal', async () => {
    render(<SaudeSection />)

    const consumo = await screen.findByRole('region', { name: /consumo de ia/i })

    expect(within(consumo).getByText(/7 usos da IA/i)).toBeInTheDocument()
    expect(within(consumo).getByText(/1\.500 tokens/i)).toBeInTheDocument()
  })

  it('explica o que é token na própria linha, sem exigir conhecimento técnico', async () => {
    render(<SaudeSection />)

    const consumo = await screen.findByRole('region', { name: /consumo de ia/i })

    expect(
      within(consumo).getByText(/unidade de texto que o provedor de IA cobra/i),
    ).toBeInTheDocument()
  })

  it('cada provedor vira um cartão, sem tabela que role para o lado', async () => {
    /**
     * A tabela tinha sete colunas e pedia "deslize para o lado" no celular. Com
     * mais de um provedor, cada um ganha o próprio cartão, que se lê inteiro em
     * qualquer largura.
     */
    render(<SaudeSection />)

    const lista = await provedores()

    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/deslize a tabela/i)).not.toBeInTheDocument()
  })

  it('um uso no singular, sem o "(s)" de formulário', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comConsumo({ chamadas: 1 }))

    render(<SaudeSection />)

    expect(await screen.findByText(/1 uso da IA/i)).toBeInTheDocument()
    expect(screen.queryByText(/\(s\)/)).not.toBeInTheDocument()
  })

  it('não apresenta ausência de cálculo como gasto confirmado', async () => {
    render(<SaudeSection />)

    expect(await screen.findByText(/custo não calculado/i)).toBeInTheDocument()
    expect(
      screen.getByText(/falta configurar no servidor o preço cobrado pelo provedor/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument()
  })

  it('diz qual é o limite de gasto e de onde ele vem', async () => {
    render(<SaudeSection />)

    expect(
      await screen.findByText(/limite de gasto de R\$ 50,00 por mês/i),
    ).toBeInTheDocument()
  })

  it('sem uso no mês, diz isso em vez de mostrar consumo zero', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ estado: 'sem_execucao', houve_execucao: false, chamadas: 0 }),
    )

    render(<SaudeSection />)

    expect(await screen.findByText(/nenhum uso neste mês/i)).toBeInTheDocument()
  })

  it('mostra valor, saldo e percentual quando o custo é calculado', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'normal',
        custo_apurado: true,
        custo_estimado_brl: 12.5,
        percentual_do_teto: 25,
        saldo_brl: 37.5,
      }),
    )

    render(<SaudeSection />)

    expect(await screen.findByText('R$ 12,50')).toBeInTheDocument()
    expect(screen.getByText(/25% do limite/i)).toBeInTheDocument()
    expect(screen.getByText(/R\$ 37,50 disponíveis/i)).toBeInTheDocument()
  })

  it('a barra reflete o consumo e não passa de 100%', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'excedido',
        custo_apurado: true,
        custo_estimado_brl: 60,
        percentual_do_teto: 120,
        saldo_brl: 0,
      }),
    )

    render(<SaudeSection />)

    const barra = await screen.findByRole('progressbar')

    expect(barra).toHaveAttribute('aria-valuenow', '100')
  })

  it('limite excedido explica a consequência para quem usa', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'excedido',
        custo_apurado: true,
        custo_estimado_brl: 60,
        percentual_do_teto: 120,
        saldo_brl: 0,
      }),
    )

    render(<SaudeSection />)

    expect(
      await screen.findByText(/as telas seguem funcionando sem as sugestões da IA/i),
    ).toBeInTheDocument()
  })

  it('o preço de cada provedor fica nos detalhes para o suporte técnico', async () => {
    /**
     * A régua de preço do bloco principal mostrava só o preço do provedor
     * principal, mas o custo do mês soma todos, cada um com o próprio preço.
     * O preço sai do bloco principal e aparece por provedor nos detalhes.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comProvedores(
        { ...PRINCIPAL, preco_entrada_brl_por_milhao: 1.62, preco_saida_brl_por_milhao: 13.5 },
        { ...RESERVA, preco_entrada_brl_por_milhao: 7, preco_saida_brl_por_milhao: 28 },
      ),
    )

    render(<SaudeSection />)

    const consumo = await screen.findByRole('region', { name: /consumo de ia/i })

    expect(within(consumo).queryByText(/por milhão/i)).not.toBeInTheDocument()

    await abrirDetalhes()

    const precos = screen.getByRole('region', { name: /preço de cada provedor/i })

    expect(precos).toHaveTextContent(/gemini-2\.5-flash.*R\$\s*1,62.*R\$\s*13,50/)
    expect(precos).toHaveTextContent(/gemini-2\.5-pro.*R\$\s*7,00.*R\$\s*28,00/)
  })

  it('provedor sem preço aparece assim nos detalhes, sem R$ 0,00', async () => {
    render(<SaudeSection />)

    await abrirDetalhes()

    const precos = screen.getByRole('region', { name: /preço de cada provedor/i })

    expect(precos).toHaveTextContent(/sem preço/i)
    expect(precos).not.toHaveTextContent(/R\$\s*0,00/)
  })

  it('avisa que sem tabela de preço os limites de gasto não bloqueiam nada', async () => {
    render(<SaudeSection />)

    expect(
      await screen.findByText(/a tabela de preço da ia está vazia/i),
    ).toBeInTheDocument()
  })

  it('com o principal com preço, nomeia o provedor que ficou sem', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comProvedores(
        { ...PRINCIPAL, preco_entrada_brl_por_milhao: 1.62, preco_saida_brl_por_milhao: 13.5 },
        RESERVA,
      ),
    )

    render(<SaudeSection />)

    expect(
      await screen.findByText(/falta o preço de google gemini · gemini-2\.5-pro/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/a tabela de preço da ia está vazia/i)).not.toBeInTheDocument()
  })

  it('mostra onde o gasto do mês foi, não só o total', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'normal',
        custo_apurado: true,
        custo_estimado_brl: 4.75,
        percentual_do_teto: 10,
        saldo_brl: 45.25,
        custo_por_tipo: { copiloto: 4.5, matching: 0.25 },
      }),
    )

    render(<SaudeSection />)

    const gasto = await screen.findByRole('list', { name: /gasto por operação/i })

    expect(gasto).toHaveTextContent(/Copiloto/)
    expect(gasto).toHaveTextContent(/R\$\s*4,50/)
    expect(gasto).toHaveTextContent(/Matching/)
  })

  it('mostra o consumo de cada provedor, não só o total do mês', async () => {
    render(<SaudeSection />)

    const [gemini] = within(await provedores()).getAllByRole('listitem')

    expect(gemini).toHaveTextContent(/Google Gemini/)
    expect(gemini).toHaveTextContent(/gemini-2\.5-flash/)
    expect(gemini).toHaveTextContent(/Usos\s*7/)
    expect(gemini).toHaveTextContent(/Falhas\s*2/)
    expect(gemini).toHaveTextContent(/Custo\s*não calculado/)
  })

  it('o tempo médio do provedor vem em segundos, como o resto da tela', async () => {
    render(<SaudeSection />)

    const [gemini] = within(await provedores()).getAllByRole('listitem')

    expect(gemini).toHaveTextContent(/Tempo médio\s*0,9 s/)
    expect(gemini).not.toHaveTextContent(/ms/)
  })

  it('o papel vem em palavras, e não no código do sistema', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comProvedores(PRINCIPAL, RESERVA, {
        ...PRINCIPAL,
        papel: 'fora_de_uso',
        modelo: 'gemini-1.5-flash',
        chamadas: 2,
      }),
    )

    render(<SaudeSection />)

    const [principal, reserva, antigo] = within(await provedores()).getAllByRole('listitem')

    expect(principal).toHaveTextContent('Principal')
    expect(reserva).toHaveTextContent('Reserva')
    expect(antigo).toHaveTextContent('Fora de uso')
    expect(screen.queryByText(/fora_de_uso|registrado/)).not.toBeInTheDocument()
  })

  it('o modelo de reserva tem cartão próprio, e a tela diz quando ele responde', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comProvedores(PRINCIPAL, RESERVA))

    render(<SaudeSection />)

    const lista = await provedores()
    const [principal, reserva] = within(lista).getAllByRole('listitem')

    expect(principal).toHaveTextContent(/gemini-2\.5-flash/)
    expect(reserva).toHaveTextContent(/gemini-2\.5-pro/)
    expect(
      screen.getByText(/a reserva só responde quando o principal falha/i),
    ).toBeInTheDocument()
  })

  it('reserva sem uso no mês diz isso em vez de uma fileira de zeros', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comProvedores(PRINCIPAL, RESERVA))

    render(<SaudeSection />)

    const [, reserva] = within(await provedores()).getAllByRole('listitem')

    expect(reserva).toHaveTextContent(/sem uso neste mês/i)
    expect(within(reserva).queryByText('Usos')).not.toBeInTheDocument()
  })

  it('cada operação do gasto diz o que faz', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'normal',
        custo_apurado: true,
        custo_estimado_brl: 4.75,
        percentual_do_teto: 10,
        saldo_brl: 45.25,
        custo_por_tipo: { copiloto: 4.5, preanalise: 0.25 },
      }),
    )

    render(<SaudeSection />)

    const gasto = await screen.findByRole('list', { name: /gasto por operação/i })

    expect(gasto).toHaveTextContent(/organiza a proposta/i)
    expect(gasto).toHaveTextContent(/avalia a maturidade da proposta para o PIPE/i)
  })

  it('provedor em uso sem configuração ganha aviso em palavras', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comProvedores({ ...PRINCIPAL, configurado: false }),
    )

    render(<SaudeSection />)

    const [gemini] = within(await provedores()).getAllByRole('listitem')

    expect(gemini).toHaveTextContent(/não configurado/i)
    expect(screen.queryByText(/sem chave/i)).not.toBeInTheDocument()
  })

  it('provedores sem papel nem uso ficam recolhidos', async () => {
    /**
     * Com vários provedores registrados, os que não respondem nem são reserva
     * não ajudam a ler o mês. Eles ficam a um clique, contados no botão.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comProvedores(PRINCIPAL, {
        ...RESERVA,
        nome: 'outro',
        rotulo: 'Outro provedor',
        papel: 'sem_uso',
        modelo: 'outro-modelo',
      }),
    )

    render(<SaudeSection />)

    expect(within(await provedores()).getAllByRole('listitem')).toHaveLength(1)

    const botao = screen.getByRole('button', { name: /1 outro provedor sem uso neste mês/i })

    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Outro provedor')).not.toBeVisible()

    await userEvent.click(botao)

    expect(screen.getByText('Outro provedor')).toBeVisible()
    expect(screen.getByText('Disponível')).toBeVisible()
  })

  it('sem custo calculado, não inventa a lista de gasto por operação', async () => {
    render(<SaudeSection />)

    await screen.findByText(/custo não calculado/i)
    expect(
      screen.queryByRole('list', { name: /gasto por operação/i }),
    ).not.toBeInTheDocument()
  })

  it('o bloco de consumo não traz o último uso', async () => {
    /**
     * "Último uso: Afinidade com o tema · concluído" não dizia quando nem para
     * que servia, e não ajuda a ler o consumo do mês. Foi para os detalhes.
     */
    render(<SaudeSection />)

    const consumo = await screen.findByRole('region', { name: /consumo de ia/i })

    expect(within(consumo).queryByText(/último uso/i)).not.toBeInTheDocument()
  })

  it('o último uso fica nos detalhes, com a situação em palavras e a data', async () => {
    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText(/copiloto · concluído · 14\/10/i)).toBeVisible()
  })
})

describe('SaudeSection — cada verificação responde uma pergunta', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('pergunta pela velocidade, pelos dados e pela IA', async () => {
    render(<SaudeSection />)

    const grupo = await verificacoes()

    for (const pergunta of [
      /a plataforma está respondendo rápido/i,
      /os dados estão acessíveis/i,
      /a ia está disponível/i,
      /a comparação com a rede está funcionando/i,
    ]) {
      expect(within(grupo).getByRole('article', { name: pergunta })).toBeInTheDocument()
    }
  })

  it('cada resposta vem escrita, nunca só a cor', async () => {
    render(<SaudeSection />)

    const grupo = await verificacoes()

    for (const resposta of within(grupo).getAllByRole('status')) {
      expect(resposta.textContent.trim().length).toBeGreaterThan(0)
    }
  })

  it('a tela principal não usa jargão de engenharia', async () => {
    /**
     * "Latência", "p90" e "amostras" descrevem como o servidor mede, não o
     * que a pessoa quer saber. O número continua disponível nos detalhes
     * para o suporte técnico.
     */
    render(<SaudeSection />)

    await verificacoes()

    expect(screen.queryByText(/latência/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bp90\b/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bp50\b/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/amostras/i)).not.toBeInTheDocument()
  })
})

describe('SaudeSection — velocidade em segundos, contra o aceitável', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('responde que está rápida e diz contra o quê', async () => {
    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(within(velocidade).getByRole('status')).toHaveTextContent(/sim/i)
    expect(velocidade).toHaveTextContent(/9 em cada 10 ações responderam em até\s*0,9 s/i)
    expect(velocidade).toHaveTextContent(/o aceitável é até 3 s/i)
  })

  it('o medidor diz o que o número é, e não só "tempo de resposta"', async () => {
    /**
     * "Tempo de resposta: 1,9 s de 3 s" deixava a dúvida: é a média, a última
     * ação, o pior caso? O número é o tempo em que 9 de cada 10 ações
     * responderam, e o rótulo do medidor agora diz isso.
     */
    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(
      within(velocidade).getByRole('meter', { name: /9 em cada 10 ações responderam em até/i }),
    ).toBeInTheDocument()
    expect(velocidade).not.toHaveTextContent(/tempo de resposta/i)
    expect(velocidade).not.toHaveTextContent(/tempo médio/i)
  })

  it('uma ação lenta isolada não pinta a plataforma de lenta', async () => {
    /**
     * Uma ação acima de 3 s bastava para o cartão ficar amarelo e o alerta
     * subir no topo, mesmo com 9 de cada 10 ações em menos de 1 s. A régua é a
     * do medidor: só é lenta quando mais de 1 em cada 10 ações passa do limite.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comVelocidade({ acima_do_limite: 1 }),
    )

    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(within(velocidade).getByRole('status')).toHaveTextContent(/sim, está rápida/i)
    expect(velocidade).toHaveTextContent(/1 das últimas 42 ações passou de 3 s/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('desenha a velocidade como medidor contra o aceitável', async () => {
    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)
    const medidor = within(velocidade).getByRole('meter')

    expect(medidor).toHaveAttribute('aria-valuenow', '29')
    expect(medidor).toHaveAttribute('aria-valuemax', '100')
  })

  it('diz de onde vem a medida, em palavras', async () => {
    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(velocidade).toHaveTextContent(/medido nas últimas 42 ações, sem contar a espera pela ia/i)
  })

  it('lentidão vira resposta, consequência e o que fazer', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comVelocidade({ acima_do_limite: 6, p90_ms: 3400 }),
    )

    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(within(velocidade).getByRole('status')).toHaveTextContent(/não, está lenta/i)
    expect(velocidade).toHaveTextContent(/6 das últimas 42 ações passaram de 3 s/i)
    expect(velocidade).toHaveTextContent(/avise o suporte técnico/i)
  })

  it('sem medida ainda, diz isso em vez de inventar número', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comVelocidade({ amostras: 0, p50_ms: null, p90_ms: null }),
    )

    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(within(velocidade).getByRole('status')).toHaveTextContent(/ainda sem medida/i)
    expect(within(velocidade).queryByRole('meter')).not.toBeInTheDocument()
  })

  it('mantém o resto da tela quando a medida falha na leitura', async () => {
    api.obterSaudeDaPlataforma = vi
      .fn()
      .mockResolvedValue({ ...SAUDE, desempenho: null, desempenho_erro: 'indisponível' })

    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(velocidade).toHaveTextContent(/indisponível/)
    expect(screen.getByRole('region', { name: /consumo de ia/i })).toBeInTheDocument()
  })
})

describe('SaudeSection — dados e IA', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('banco no ar responde que os dados estão acessíveis', async () => {
    render(<SaudeSection />)

    const dados = await cartao(/os dados estão acessíveis/i)

    expect(within(dados).getByRole('status')).toHaveTextContent(/sim/i)
  })

  it('banco fora do ar diz a consequência para quem usa', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      banco: { responde: false, erro: 'conexão recusada' },
    })

    render(<SaudeSection />)

    const dados = await cartao(/os dados estão acessíveis/i)

    expect(within(dados).getByRole('status')).toHaveTextContent(/não/i)
    expect(dados).toHaveTextContent(/ninguém consegue entrar nem salvar/i)
  })

  it('IA com falhas no mês diz quantas e o que aconteceu com a tela', async () => {
    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(within(ia).getByRole('status')).toHaveTextContent(/com falhas/i)
    expect(ia).toHaveTextContent(/2 dos 7 usos deste mês falharam/i)
    expect(ia).toHaveTextContent(/seguiu sem a sugestão/i)
  })

  it('uma falha só leva o verbo no singular', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comConsumo({ falhas: 1 }))

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(ia).toHaveTextContent(/1 dos 7 usos deste mês falhou, e a tela/i)
  })

  it('com reserva, a falha do principal não é dada como tela sem sugestão', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comProvedores(PRINCIPAL, RESERVA))

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(ia).toHaveTextContent(/2 dos 7 usos deste mês falharam/i)
    expect(ia).toHaveTextContent(/a reserva tenta responder/i)
    expect(ia).not.toHaveTextContent(/seguiu sem a sugestão/i)
  })

  it('o cartão e os provedores contam as falhas do mesmo jeito', async () => {
    /**
     * O cartão pegava o maior entre erros e usos sem IA, e a tabela somava os
     * dois: os números divergiam. Agora os dois leem o mesmo campo.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ falhas: 3, erros: 2, fallbacks: 2, provedores: [{ ...PRINCIPAL, falhas: 3 }] }),
    )

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)
    const [gemini] = within(await provedores()).getAllByRole('listitem')

    expect(ia).toHaveTextContent(/3 dos 7 usos/i)
    expect(gemini).toHaveTextContent(/Falhas\s*3/)
  })

  it('IA sem falha responde que está funcionando', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ falhas: 0, erros: 0, fallbacks: 0 }),
    )

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(within(ia).getByRole('status')).toHaveTextContent(/sim/i)
    expect(ia).toHaveTextContent(/7 usos neste mês, todos concluídos/i)
  })

  it('sem chave do provedor, explica que as telas seguem sem sugestão', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ provedor_configurado: false, chamadas: 0, falhas: 0, erros: 0, fallbacks: 0 }),
    )

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(within(ia).getByRole('status')).toHaveTextContent(/desligada/i)
    expect(ia).toHaveTextContent(/funcionam normalmente, só que sem as sugestões/i)
  })
})

describe('SaudeSection — comparação com a rede', () => {
  /**
   * O MiniLM roda na própria plataforma, sem provedor e sem custo, e dá a
   * afinidade com o tema, que pesa na nota do matching. Ele saiu do consumo e
   * da lista de provedores e ganhou o próprio cartão: a pergunta de quem
   * administra é se as rodadas de matching estão recebendo a afinidade.
   */
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('funcionando, diz quantas rodadas tiveram a afinidade e o que ela é', async () => {
    render(<SaudeSection />)

    const comparacao = await cartao(/a comparação com a rede está funcionando/i)

    expect(within(comparacao).getByRole('status')).toHaveTextContent(/sim, funcionando/i)
    expect(comparacao).toHaveTextContent(/3 rodadas de matching neste mês, todas com a afinidade com o tema/i)
    expect(comparacao).toHaveTextContent(/roda na própria plataforma, sem custo/i)
    expect(comparacao).toHaveTextContent(/último cálculo: 25\/10/i)
  })

  it('rodada sem a afinidade vira falha, com o peso que se perdeu', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comComparacao({ rodadas_sem_afinidade: 1 }),
    )

    render(<SaudeSection />)

    const comparacao = await cartao(/a comparação com a rede está funcionando/i)

    expect(within(comparacao).getByRole('status')).toHaveTextContent(/com falhas/i)
    expect(comparacao).toHaveTextContent(
      /1 das 3 rodadas de matching deste mês saiu sem a afinidade com o tema, que vale 45% da nota/i,
    )
    expect(comparacao).toHaveTextContent(/avise o suporte técnico/i)
  })

  it('desligada diz o que o matching perde', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(comComparacao({ ligada: false }))

    render(<SaudeSection />)

    const comparacao = await cartao(/a comparação com a rede está funcionando/i)

    expect(within(comparacao).getByRole('status')).toHaveTextContent(/desligada/i)
    expect(comparacao).toHaveTextContent(/sem a afinidade com o tema, que vale 45% da nota/i)
  })

  it('sem rodada no mês, diz isso em vez de inventar número', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comComparacao({ rodadas_no_mes: 0 }),
    )

    render(<SaudeSection />)

    const comparacao = await cartao(/a comparação com a rede está funcionando/i)

    expect(within(comparacao).getByRole('status')).toHaveTextContent(/sim, ligada/i)
    expect(comparacao).toHaveTextContent(/nenhuma rodada de matching neste mês/i)
  })

  it('falha de leitura do bloco não derruba o resto', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      comparacao: null,
      comparacao_erro: 'indisponível',
    })

    render(<SaudeSection />)

    const comparacao = await cartao(/a comparação com a rede está funcionando/i)

    expect(within(comparacao).getByRole('status')).toHaveTextContent(/não foi possível verificar/i)
    expect(screen.getByRole('region', { name: /consumo de ia/i })).toBeInTheDocument()
  })
})

describe('SaudeSection — alerta no topo nomeia o problema', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('avisa quando o banco não responde, com o motivo', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      banco: { responde: false, erro: 'conexão recusada' },
    })

    render(<SaudeSection />)

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent(/banco de dados não está respondendo/i)
    expect(alerta).toHaveTextContent(/conexão recusada/i)
  })

  it('avisa a lentidão em segundos, não em milissegundos', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comVelocidade({ acima_do_limite: 6, p90_ms: 3400 }),
    )

    render(<SaudeSection />)

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent(/6 das últimas 42 ações passaram de 3 s/i)
    expect(alerta).not.toHaveTextContent(/ms/)
  })

  it('sem problema nenhum, não inventa alerta', async () => {
    render(<SaudeSection />)

    await verificacoes()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SaudeSection — revisão humana à vista, com o porquê', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('aparece sem precisar abrir nada e explica para que serve', async () => {
    render(<SaudeSection />)

    const revisao = await screen.findByRole('region', {
      name: /as sugestões da plataforma estão passando por pessoas/i,
    })

    expect(revisao).toHaveTextContent(/a plataforma só sugere — quem decide é a equipe/i)
  })

  it('diz o período: tudo o que a IA já gerou, e não só este mês', async () => {
    /**
     * O consumo acima é do mês, e estas barras contam desde o começo. Sem
     * dizer isso, a tela misturava as duas janelas.
     */
    render(<SaudeSection />)

    const revisao = await screen.findByRole('region', {
      name: /as sugestões da plataforma estão passando por pessoas/i,
    })

    expect(revisao).toHaveTextContent(/desde o começo do uso da plataforma, e não só neste mês/i)
  })

  it('cada razão ganha medidor com a proporção', async () => {
    render(<SaudeSection />)

    const propostas = await screen.findByRole('meter', { name: /propostas revisadas/i })

    expect(propostas).toHaveAttribute('aria-valuenow', '3')
    expect(propostas).toHaveAttribute('aria-valuemax', '4')
    expect(screen.getByText(/3 de 4 · 75%/)).toBeInTheDocument()
  })

  it('sem nada gerado, diz que não há o que revisar em vez de 0 de 0', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        revisao_humana: {
          propostas_de_ia: 0,
          propostas_revisadas: 0,
          indicacoes: 0,
          indicacoes_validadas: 0,
          equipes_geradas: 0,
          recomendacoes: 0,
          recomendacoes_acatadas: 0,
        },
      }),
    )

    render(<SaudeSection />)

    expect(
      await screen.findByText(/a plataforma ainda não sugeriu nada para revisar/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('0 de 0')).not.toBeInTheDocument()
  })
})

describe('SaudeSection — detalhes para o suporte técnico', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('ficam recolhidos e dizem a quem servem', async () => {
    render(<SaudeSection />)

    const botao = await screen.findByRole('button', {
      name: /detalhes para o suporte técnico/i,
    })

    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/tokens enviados/i)).not.toBeVisible()

    await abrirDetalhes()

    expect(screen.getByText(/para quem investiga um problema/i)).toBeInTheDocument()
  })

  it('trazem os tempos exatos, arredondados ao milissegundo', async () => {
    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText('121 ms')).toBeInTheDocument()
    expect(screen.getByText('880 ms')).toBeInTheDocument()
    expect(screen.queryByText('120.5 ms')).not.toBeInTheDocument()
  })

  it('trazem os contadores da IA com separador de milhar', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ tokens_entrada: 120000, tokens_saida: 45000 }),
    )

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText('120.000')).toBeInTheDocument()
    expect(screen.getByText('45.000')).toBeInTheDocument()
    expect(screen.getByText('500 tokens')).toBeInTheDocument()
    expect(screen.getByText('copiloto_v1')).toBeInTheDocument()
  })

  it('sem uso de IA no mês, resumem numa linha em vez de uma parede de zeros', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        houve_execucao: false,
        estado: 'sem_execucao',
        chamadas: 0,
        falhas: 0,
        erros: 0,
        fallbacks: 0,
        tokens_entrada: 0,
        tokens_saida: 0,
        contexto_medio_tokens: null,
        ultima_execucao: null,
      }),
    )

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText(/a ia não foi usada neste mês, então não há falhas nem consumo/i)).toBeInTheDocument()
    expect(screen.queryByText(/tokens enviados/i)).not.toBeInTheDocument()
  })

  it('explicam erro, token e versão das instruções para quem não é técnico', async () => {
    /**
     * Quem administra perguntou, diante dos detalhes: "o que causa um erro?",
     * "esse token é de quê?". Cada número agora traz a resposta embaixo.
     */
    render(<SaudeSection />)

    await abrirDetalhes()

    expect(
      screen.getByText(/o provedor estava fora do ar, recusou o pedido, demorou demais/i),
    ).toBeVisible()
    expect(screen.getByText(/token é um pedaço de palavra, e é por ele que o provedor cobra/i)).toBeVisible()
    expect(screen.getByText('Versão das instruções da IA')).toBeVisible()
    expect(screen.queryByText(/prompt/i)).not.toBeInTheDocument()
  })

  it('o último uso diz o que a operação faz', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ ultima_execucao: { ...IA.ultima_execucao, tipo: 'preanalise' } }),
    )

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText(/pré-análise · concluído/i)).toBeVisible()
    expect(
      screen.getByText(/avalia a maturidade da proposta para o PIPE\/FAPESP/i),
    ).toBeVisible()
  })

  it('sem uso de IA no mês, dizem quando foi o último uso', async () => {
    /**
     * Num mês sem uso, o consumo zera, mas a IA pode ter sido usada no mês
     * anterior. A data do último uso responde "a IA está parada há quanto
     * tempo?" sem a pessoa precisar adivinhar.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ estado: 'sem_execucao', houve_execucao: false, chamadas: 0, falhas: 0 }),
    )

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText(/último uso: copiloto · concluído · 14\/10/i)).toBeVisible()
    expect(screen.getByText(/organiza a proposta/i)).toBeVisible()
  })

  it('não trazem métrica que documento nenhum pede', async () => {
    render(<SaudeSection />)

    await abrirDetalhes()

    for (const rotulo of [
      'Em pé há',
      'Processo em pé há',
      'Ambiente',
      'Motor',
      'Conexão reaproveitada',
      'Requisições medidas',
      'Erros de servidor',
    ]) {
      expect(screen.queryByText(rotulo)).not.toBeInTheDocument()
    }
  })

  it('trazem o modelo da comparação com a rede e dizem que o texto não sai da plataforma', async () => {
    /**
     * Se o modelo mudar na configuração, os números guardados dos perfis foram
     * gerados pelo anterior. O nome à vista diz a quem investiga qual vale, e a
     * linha de ajuda responde de onde o texto não sai.
     */
    render(<SaudeSection />)

    await verificacoes()
    expect(screen.getByText(SAUDE.comparacao.modelo)).not.toBeVisible()

    await abrirDetalhes()

    const bloco = screen.getByRole('region', { name: 'Comparação com a rede' })

    expect(bloco).toHaveTextContent(SAUDE.comparacao.modelo)
    expect(bloco).toHaveTextContent(
      /o texto dos perfis e das competências não sai para nenhum provedor/i,
    )
  })

  it('explicam que os tempos recomeçam a cada reinício', async () => {
    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText(/recomeçam do zero quando o servidor reinicia/i)).toBeInTheDocument()
  })
})

describe('SaudeSection — tarefas em segundo plano', () => {
  it('ambiente sem fila nem expectativa de fila não ganha cartão', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)

    render(<SaudeSection />)

    const grupo = await verificacoes()

    expect(
      within(grupo).queryByRole('article', { name: /segundo plano/i }),
    ).not.toBeInTheDocument()
  })

  it('sem fila esperada, os detalhes também não falam dela', async () => {
    /**
     * A plataforma funciona sem a fila: a pré-análise roda na hora. O bloco
     * "Fila assíncrona não configurada... nenhum worker publica execução"
     * aparecia sempre, em jargão, sobre algo que não é problema.
     */
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.queryByText(SAUDE.jobs.motivo)).not.toBeInTheDocument()
    expect(screen.queryByText(/tarefas em segundo plano/i)).not.toBeInTheDocument()
  })

  it('fila esperada e fora do ar leva o motivo aos detalhes', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      jobs: { configurado: false, esperada: true, motivo: 'Broker fora do ar.' },
    })

    render(<SaudeSection />)

    await abrirDetalhes()

    expect(screen.getByText('Broker fora do ar.')).toBeVisible()
  })

  it('ambiente que espera fila e está sem ela ganha cartão e alerta', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      jobs: { configurado: false, esperada: true, motivo: 'Broker fora do ar.' },
    })

    render(<SaudeSection />)

    const tarefas = await cartao(/as tarefas em segundo plano estão rodando/i)

    expect(within(tarefas).getByRole('status')).toHaveTextContent(/não/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/tarefas em segundo plano/i)
  })

  it('fila configurada aparece como funcionando, sem alerta', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue({
      ...SAUDE,
      jobs: { configurado: true, esperada: true, motivo: '' },
    })

    render(<SaudeSection />)

    const tarefas = await cartao(/as tarefas em segundo plano estão rodando/i)

    expect(within(tarefas).getByRole('status')).toHaveTextContent(/sim/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SaudeSection — leitura da tela', () => {
  beforeEach(() => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)
  })

  it('o cabeçalho diz para que a tela serve', async () => {
    render(<SaudeSection />)

    expect(
      await screen.findByText(/veja se a plataforma está funcionando bem/i),
    ).toBeInTheDocument()
  })

  it('explica a falha total sem derrubar a tela', async () => {
    api.obterSaudeDaPlataforma = vi
      .fn()
      .mockRejectedValue(new Error('Sem resposta do servidor.'))

    render(<SaudeSection />)

    expect(await screen.findByText('Sem resposta do servidor.')).toBeInTheDocument()
  })

  it('relê sob demanda', async () => {
    render(<SaudeSection />)

    await screen.findByRole('region', { name: /consumo de ia/i })
    await userEvent.click(screen.getByRole('button', { name: /atualizar agora/i }))

    await waitFor(() =>
      expect(api.obterSaudeDaPlataforma).toHaveBeenCalledTimes(2),
    )
  })
})
