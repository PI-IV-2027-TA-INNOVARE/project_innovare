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
  erros: 1,
  fallbacks: 2,
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

function comVelocidade(extra) {
  return { ...SAUDE, desempenho: { ...SAUDE.desempenho, ...extra } }
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

  it('mostra o preço que produziu o custo, não só o total', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({
        estado: 'normal',
        custo_apurado: true,
        custo_estimado_brl: 12.5,
        percentual_do_teto: 25,
        saldo_brl: 37.5,
        preco_entrada_brl_por_milhao: 1.62,
        preco_saida_brl_por_milhao: 13.5,
      }),
    )

    render(<SaudeSection />)

    expect(await screen.findByText(/R\$\s*1,62/)).toBeInTheDocument()
    expect(screen.getByText(/R\$\s*13,50/)).toBeInTheDocument()
  })

  it('não mostra régua de preço quando não há tabela', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ preco_entrada_brl_por_milhao: 0, preco_saida_brl_por_milhao: 0 }),
    )

    render(<SaudeSection />)

    await screen.findByText(/custo não calculado/i)
    expect(screen.queryByText(/por milhão de tokens/i)).not.toBeInTheDocument()
  })

  it('avisa que sem tabela de preço os limites de gasto não bloqueiam nada', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ preco_entrada_brl_por_milhao: 0, preco_saida_brl_por_milhao: 0 }),
    )

    render(<SaudeSection />)

    expect(
      await screen.findByText(/a tabela de preço da ia está vazia/i),
    ).toBeInTheDocument()
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

  it('sem custo calculado, não inventa a lista de gasto por operação', async () => {
    render(<SaudeSection />)

    await screen.findByText(/custo não calculado/i)
    expect(
      screen.queryByRole('list', { name: /gasto por operação/i }),
    ).not.toBeInTheDocument()
  })

  it('o último uso aparece com a situação em palavras', async () => {
    render(<SaudeSection />)

    expect(await screen.findByText(/copiloto · concluído/i)).toBeInTheDocument()
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
    expect(velocidade).toHaveTextContent(/9 em cada 10 ações responderam em até 0,9 s/i)
    expect(velocidade).toHaveTextContent(/o aceitável é até 3 s/i)
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

    expect(velocidade).toHaveTextContent(/medido em 42 ações desde o último reinício/i)
  })

  it('lentidão vira resposta, consequência e o que fazer', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comVelocidade({ acima_do_limite: 3, p90_ms: 3400 }),
    )

    render(<SaudeSection />)

    const velocidade = await cartao(/a plataforma está respondendo rápido/i)

    expect(within(velocidade).getByRole('status')).toHaveTextContent(/lenta/i)
    expect(velocidade).toHaveTextContent(/3 ações demoraram mais de 3 s/i)
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

  it('IA sem falha responde que está funcionando', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ erros: 0, fallbacks: 0 }),
    )

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(within(ia).getByRole('status')).toHaveTextContent(/sim/i)
    expect(ia).toHaveTextContent(/7 usos neste mês, todos concluídos/i)
  })

  it('sem chave do provedor, explica que as telas seguem sem sugestão', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(
      comConsumo({ provedor_configurado: false, chamadas: 0, erros: 0, fallbacks: 0 }),
    )

    render(<SaudeSection />)

    const ia = await cartao(/a ia está disponível/i)

    expect(within(ia).getByRole('status')).toHaveTextContent(/desligada/i)
    expect(ia).toHaveTextContent(/funcionam normalmente, só que sem as sugestões/i)
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
      comVelocidade({ acima_do_limite: 3 }),
    )

    render(<SaudeSection />)

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent(/3 ações demoraram mais de 3 s/i)
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
      name: /as sugestões da ia estão passando por pessoas/i,
    })

    expect(revisao).toHaveTextContent(/a ia só sugere — quem decide é a equipe/i)
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
      await screen.findByText(/a ia ainda não gerou nada para revisar/i),
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

    expect(screen.getByText(/sem uso de ia neste mês: não há erro nem token/i)).toBeInTheDocument()
    expect(screen.queryByText(/tokens enviados/i)).not.toBeInTheDocument()
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

  it('o motivo fica nos detalhes, como informação', async () => {
    api.obterSaudeDaPlataforma = vi.fn().mockResolvedValue(SAUDE)

    render(<SaudeSection />)

    await verificacoes()
    expect(screen.getByText(SAUDE.jobs.motivo)).not.toBeVisible()

    await abrirDetalhes()

    expect(screen.getByText(SAUDE.jobs.motivo)).toBeVisible()
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
