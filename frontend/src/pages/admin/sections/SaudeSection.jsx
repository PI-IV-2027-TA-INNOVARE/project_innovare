import { useCallback, useEffect, useState } from 'react'
import { Icone, appIcons } from '../../../lib/icons'
import { obterSaudeDaPlataforma } from '../../../services/pdConnectApi'

const INTERVALO_DE_RELEITURA_MS = 30000

const ESTADOS = {
  sem_execucao: {
    rotulo: 'Nenhum uso neste mês',
    tom: 'neutro',
    explicacao: 'A IA não foi usada neste mês, então não há consumo a mostrar.',
  },
  sem_apuracao: {
    rotulo: 'Custo não calculado',
    tom: 'neutro',
    explicacao:
      'A IA foi usada, mas o custo não pôde ser calculado: falta configurar no servidor o preço cobrado pelo provedor. O limite de gasto continua valendo.',
  },
  normal: { rotulo: 'Dentro do limite', tom: 'ok', explicacao: '' },
  atencao: {
    rotulo: 'Perto do limite',
    tom: 'atencao',
    explicacao: 'O gasto estimado do mês já está perto do limite.',
  },
  excedido: {
    rotulo: 'Limite excedido',
    tom: 'critico',
    explicacao:
      'O gasto estimado passou do limite do mês. A plataforma parou de chamar a IA: as telas seguem funcionando sem as sugestões da IA até o mês virar ou o limite ser aumentado.',
  },
}

const ROTULOS_DAS_OPERACOES = {
  copiloto: 'Copiloto',
  competencias: 'Competências',
  matching: 'Matching',
  preanalise: 'Pré-análise',
  embedding: 'Embedding',
}

const SITUACOES_DA_EXECUCAO = {
  ok: 'concluído',
  erro: 'com erro',
  pendente: 'aguardando',
  executando: 'em andamento',
}

const MILHAR = new Intl.NumberFormat('pt-BR')
const SEGUNDOS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function contagem(valor) {
  if (valor === null || valor === undefined) return '—'

  return MILHAR.format(valor)
}

function milissegundos(valor) {
  if (valor === null || valor === undefined) return '—'

  return `${Math.round(valor)} ms`
}

/**
 * Tempo em segundos, que e a unidade em que gente percebe espera.
 *
 * "1875 ms" pede conta de cabeca; "1,9 s" se le direto. O milissegundo exato
 * continua nos detalhes para o suporte tecnico.
 */
function segundos(valor) {
  if (valor === null || valor === undefined) return '—'

  return `${SEGUNDOS.format(valor / 1000)} s`
}

function proporcao(parte, total) {
  if (!total) return 0

  return Math.min(Math.round((parte / total) * 100), 100)
}

function plural(quantidade, singular, varios) {
  return `${contagem(quantidade)} ${quantidade === 1 ? singular : varios}`
}

function reais(valor) {
  if (valor === null || valor === undefined) return '—'

  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`
}

/**
 * Razao contra um limite, que e o que a razao pede: um medidor.
 *
 * O numero sem a regua nao se le ("1,9 s" e bom ou ruim?), e a regua sem o
 * numero nao se audita. `role="meter"` porque e exatamente isto: valor atual
 * num intervalo conhecido, e nao uma tarefa em progresso.
 */
function Medidor({ rotulo, valor, maximo, legenda, tom = 'ok', children }) {
  const preenchido = maximo ? Math.min((valor / maximo) * 100, 100) : 0

  return (
    <div className="saude__medidor">
      <div className="saude__medidor-cabeca">
        <span className="saude__medidor-rotulo">{rotulo}</span>
        <span className="saude__medidor-valor">{children}</span>
      </div>

      <div
        className={`saude__barra saude__barra--${tom}`}
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={maximo}
        aria-valuenow={valor}
      >
        <span
          className="saude__barra-preenchida"
          style={{ width: `${preenchido}%` }}
        />
      </div>

      {legenda ? <p className="saude__medidor-legenda">{legenda}</p> : null}
    </div>
  )
}

const ICONE_DO_TOM = {
  ok: appIcons.done,
  atencao: appIcons.warning,
  critico: appIcons.warning,
  neutro: appIcons.info,
}

/**
 * Uma verificacao: a pergunta que a pessoa faz, a resposta e o porque.
 *
 * O titulo e a pergunta ("Os dados estao acessiveis?") e nao o nome do
 * componente ("Banco"), porque quem administra a plataforma nao precisa saber
 * como ela e montada para saber se ela funciona. A resposta vem com cor,
 * icone **e** texto: o estado nunca depende so da cor.
 */
function Verificacao({ id, pergunta, resposta, tom = 'neutro', children }) {
  return (
    <article
      className={`saude__verificacao saude__verificacao--${tom}`}
      aria-labelledby={id}
    >
      <h4 className="saude__verificacao-pergunta" id={id}>
        {pergunta}
      </h4>

      <p className="saude__verificacao-resposta" role="status">
        <Icone icon={ICONE_DO_TOM[tom]} aria-hidden="true" />
        {resposta}
      </p>

      <div className="saude__verificacao-corpo">{children}</div>
    </article>
  )
}

function Velocidade({ desempenho, erro }) {
  const pergunta = 'A plataforma está respondendo rápido?'
  const id = 'saude-velocidade'

  if (erro || !desempenho) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Não foi possível medir">
        <p className="saude__erro">{erro || 'Medida indisponível.'}</p>
      </Verificacao>
    )
  }

  if (!desempenho.amostras) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Ainda sem medida">
        <p className="saude__nota">
          A medida começa com o uso da plataforma e recomeça sempre que o
          servidor é reiniciado.
        </p>
      </Verificacao>
    )
  }

  const acima = desempenho.acima_do_limite || 0
  const lenta = acima > 0

  return (
    <Verificacao
      id={id}
      pergunta={pergunta}
      resposta={lenta ? 'Lenta em alguns momentos' : 'Sim, está rápida'}
      tom={lenta ? 'atencao' : 'ok'}
    >
      <Medidor
        rotulo="Tempo de resposta"
        valor={proporcao(desempenho.p90_ms, desempenho.limite_ms)}
        maximo={100}
        tom={lenta ? 'atencao' : 'ok'}
      >
        {segundos(desempenho.p90_ms)} de {segundos(desempenho.limite_ms)}
      </Medidor>

      <p className="saude__nota">
        9 em cada 10 ações responderam em até {segundos(desempenho.p90_ms)} — o
        aceitável é até {segundos(desempenho.limite_ms)}.
      </p>

      {lenta ? (
        <p className="saude__nota">
          {plural(acima, 'ação demorou', 'ações demoraram')} mais de{' '}
          {segundos(desempenho.limite_ms)}. Se a lentidão continuar, avise o
          suporte técnico.
        </p>
      ) : null}

      <p className="saude__fonte">
        Medido em {plural(desempenho.amostras, 'ação', 'ações')} desde o último
        reinício do servidor.
      </p>
    </Verificacao>
  )
}

function Dados({ banco, erro }) {
  const responde = banco?.responde && !erro

  return (
    <Verificacao
      id="saude-dados"
      pergunta="Os dados estão acessíveis?"
      resposta={responde ? 'Sim' : 'Não'}
      tom={responde ? 'ok' : 'critico'}
    >
      {responde ? (
        <p className="saude__nota">
          O banco de dados respondeu na última verificação.
        </p>
      ) : (
        <>
          <p className="saude__nota">
            Ninguém consegue entrar nem salvar até isso ser resolvido. Acione o
            suporte técnico.
          </p>
          {banco?.erro || erro ? (
            <p className="saude__fonte">Motivo informado: {banco?.erro || erro}</p>
          ) : null}
        </>
      )}
    </Verificacao>
  )
}

function InteligenciaArtificial({ ia, erro }) {
  const pergunta = 'A IA está disponível?'
  const id = 'saude-ia'

  if (erro || !ia) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Não foi possível verificar">
        <p className="saude__erro">{erro || 'Informação indisponível.'}</p>
      </Verificacao>
    )
  }

  if (!ia.provedor_configurado) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Desligada">
        <p className="saude__nota">
          Falta a chave do provedor de IA no servidor. As telas funcionam
          normalmente, só que sem as sugestões da IA.
        </p>
      </Verificacao>
    )
  }

  if (!ia.chamadas) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Sim, disponível" tom="ok">
        <p className="saude__nota">Ainda não foi usada neste mês.</p>
      </Verificacao>
    )
  }

  const falhas = Math.max(ia.erros || 0, ia.fallbacks || 0)

  if (falhas > 0) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Com falhas" tom="atencao">
        <p className="saude__nota">
          {contagem(falhas)} dos {contagem(ia.chamadas)} usos deste mês
          falharam, e a tela seguiu sem a sugestão da IA. Se isso se repetir,
          avise o suporte técnico.
        </p>
      </Verificacao>
    )
  }

  return (
    <Verificacao id={id} pergunta={pergunta} resposta="Sim, funcionando" tom="ok">
      <p className="saude__nota">
        {plural(ia.chamadas, 'uso', 'usos')} neste mês,{' '}
        {ia.chamadas === 1 ? 'concluído' : 'todos concluídos'}.
      </p>
    </Verificacao>
  )
}

function TarefasEmSegundoPlano({ jobs }) {
  return (
    <Verificacao
      id="saude-tarefas"
      pergunta="As tarefas em segundo plano estão rodando?"
      resposta={jobs.configurado ? 'Sim' : 'Não'}
      tom={jobs.configurado ? 'ok' : 'critico'}
    >
      <p className="saude__nota">
        {jobs.configurado
          ? 'Tarefas demoradas rodam sem travar as telas.'
          : 'Este ambiente deveria ter as tarefas em segundo plano ligadas, e elas não estão.'}
      </p>
    </Verificacao>
  )
}

/**
 * As verificacoes que a plataforma realmente tem, e so elas.
 *
 * As tarefas em segundo plano so entram quando existem ou quando o ambiente as
 * espera: nenhum requisito da baseline as pede, e um cartao que nunca muda e
 * sobre o qual ninguem age e ruido. O motivo fica nos detalhes tecnicos.
 */
function Verificacoes({ dados }) {
  const { jobs } = dados

  return (
    <section className="saude__verificacoes" aria-labelledby="saude-verificacoes">
      <h3 className="saude__titulo" id="saude-verificacoes">
        Como a plataforma está
      </h3>

      <div
        className="saude__verificacoes-grade"
        role="group"
        aria-label="Como a plataforma está"
      >
        <Velocidade desempenho={dados.desempenho} erro={dados.desempenho_erro} />
        <Dados banco={dados.banco} erro={dados.banco_erro} />
        <InteligenciaArtificial ia={dados.ia} erro={dados.ia_erro} />
        {jobs?.configurado || jobs?.esperada ? (
          <TarefasEmSegundoPlano jobs={jobs} />
        ) : null}
      </div>
    </section>
  )
}

/**
 * O que esta errado, nomeado, com a consequencia para quem usa.
 *
 * Quem abre um painel de saude quer saber *o que* quebrou antes de decidir se
 * vai investigar - e em segundos, nao em milissegundos.
 */
function problemas({ desempenho, jobs, banco }) {
  const achados = []

  if (banco?.responde === false) {
    achados.push(
      (banco.erro
        ? `O banco de dados não está respondendo (${banco.erro}).`
        : 'O banco de dados não está respondendo.') +
        ' Ninguém consegue entrar nem salvar até isso ser resolvido.'
    )
  }

  if (jobs?.esperada && !jobs?.configurado) {
    achados.push(
      'As tarefas em segundo plano deveriam estar rodando neste ambiente, e não estão.'
    )
  }

  const acima = desempenho?.acima_do_limite || 0

  if (acima > 0) {
    achados.push(
      `${plural(acima, 'ação demorou', 'ações demoraram')} mais de ` +
        `${segundos(desempenho.limite_ms)} desde o último reinício do servidor.`
    )
  }

  return achados
}

function Achados({ dados }) {
  const achados = problemas(dados)

  if (!achados.length) return null

  return (
    <div className="saude__achados" role="alert">
      <Icone icon={appIcons.warning} aria-hidden="true" />
      <ul>
        {achados.map((achado) => (
          <li key={achado}>{achado}</li>
        ))}
      </ul>
    </div>
  )
}

function Metrica({ rotulo, children }) {
  return (
    <div className="saude__metrica">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * O consumo do mes — o protagonista da tela (plano 5.3).
 *
 * `gastoPorOperacao` atende "custo estimado por fluxo": o total do mes nao
 * responde onde cortar gasto, e o corte por operacao sim. `temTabelaDePreco`
 * controla a regua: sem o preco que produziu o numero, o gasto nao se
 * interpreta.
 */
function Consumo({ ia, erro }) {
  if (erro || !ia) {
    return (
      <section className="saude__consumo">
        <p className="saude__erro" role="alert">
          Não foi possível ler o consumo de IA: {erro || 'informação indisponível'}
        </p>
      </section>
    )
  }

  const estado = ESTADOS[ia.estado] || ESTADOS.sem_apuracao
  const mostrarValor = ia.custo_apurado
  const preenchido = Math.min(Math.max(ia.percentual_do_teto || 0, 0), 100)

  const gastoPorOperacao = Object.entries(ia.custo_por_tipo || {}).sort(
    (a, b) => b[1] - a[1]
  )

  const temTabelaDePreco =
    (ia.preco_entrada_brl_por_milhao || 0) > 0 ||
    (ia.preco_saida_brl_por_milhao || 0) > 0

  const ultimoUso = ia.ultima_execucao
    ? `${ROTULOS_DAS_OPERACOES[ia.ultima_execucao.tipo] || ia.ultima_execucao.tipo} · ${
        SITUACOES_DA_EXECUCAO[ia.ultima_execucao.status] || ia.ultima_execucao.status
      }`
    : 'nenhum'

  return (
    <section className="saude__consumo" aria-labelledby="saude-consumo">
      <header className="saude__consumo-cabeca">
        <div>
          <h3 className="saude__titulo" id="saude-consumo">Consumo de IA</h3>
          <p className="saude__descricao">
            Quanto a IA foi usada neste mês e quanto isso custa, contra o limite
            de gasto.
          </p>
        </div>

        <span className={`saude__selo saude__selo--${estado.tom}`}>
          {estado.rotulo}
        </span>
      </header>

      <div className="saude__barra-area">
        <p className="saude__valor">
          {mostrarValor ? (
            <>
              <span className="saude__valor-numero">
                {reais(ia.custo_estimado_brl)}
              </span>
              <span className="saude__valor-limite">
                de {reais(ia.teto_mensal_brl)} (estimativa)
              </span>
            </>
          ) : (
            <>
              <span className="saude__valor-numero">
                {plural(ia.chamadas || 0, 'uso da IA', 'usos da IA')}
              </span>
              <span className="saude__valor-limite">
                {contagem((ia.tokens_entrada || 0) + (ia.tokens_saida || 0))} tokens
                — a unidade de texto que o provedor de IA cobra
              </span>
            </>
          )}
        </p>

        <div
          className={`saude__barra saude__barra--${estado.tom}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={mostrarValor ? Math.round(preenchido) : undefined}
          aria-label="Gasto estimado contra o limite do mês"
        >
          <span
            className="saude__barra-preenchida"
            style={{ width: mostrarValor ? `${preenchido}%` : '0%' }}
          />
        </div>

        <p className="saude__barra-legenda">
          {mostrarValor ? (
            <>
              {ia.percentual_do_teto ?? '—'}% do limite ·{' '}
              {reais(ia.saldo_brl)} disponíveis · aviso a partir de{' '}
              {ia.percentual_de_alerta}%
            </>
          ) : (
            <>
              Limite de gasto de {reais(ia.teto_mensal_brl)} por mês, definido
              na configuração do servidor.
            </>
          )}
        </p>

        {temTabelaDePreco ? (
          <p className="saude__barra-legenda">
            Calculado com o preço do provedor:{' '}
            {reais(ia.preco_entrada_brl_por_milhao)} por milhão de tokens
            enviados e {reais(ia.preco_saida_brl_por_milhao)} por milhão de
            tokens recebidos.
          </p>
        ) : null}

        {estado.explicacao ? (
          <p className="saude__nota">{estado.explicacao}</p>
        ) : null}
      </div>

      {gastoPorOperacao.length > 0 ? (
        <ul className="saude__gasto" aria-label="Gasto por operação no mês">
          {gastoPorOperacao.map(([tipo, valor]) => (
            <li className="saude__gasto-item" key={tipo}>
              <span className="saude__gasto-rotulo">
                {ROTULOS_DAS_OPERACOES[tipo] || tipo}
              </span>
              <span className="saude__gasto-valor">{reais(valor)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="saude__complemento">
        <Metrica rotulo="Modelo de IA">
          {ia.provedor_configurado ? ia.modelo : 'sem chave configurada'}
        </Metrica>
        {mostrarValor ? (
          <Metrica rotulo="Usos no mês">{contagem(ia.chamadas)}</Metrica>
        ) : null}
        <Metrica rotulo="Último uso">{ultimoUso}</Metrica>
      </dl>
    </section>
  )
}

/**
 * Quanto da saida de IA passou por gente, como proporcao.
 *
 * Fica a vista, e nao nos detalhes tecnicos: e a prova de que a IA so sugere
 * e a equipe decide (AGENTS.md 0.2), e isso e governanca, nao diagnostico.
 */
function RevisaoHumana({ revisao }) {
  const linhas = [
    {
      rotulo: 'Propostas revisadas',
      parte: revisao?.propostas_revisadas,
      total: revisao?.propostas_de_ia,
    },
    {
      rotulo: 'Indicações de pesquisadores validadas',
      parte: revisao?.indicacoes_validadas,
      total: revisao?.indicacoes,
    },
    {
      rotulo: 'Recomendações da pré-análise acatadas',
      parte: revisao?.recomendacoes_acatadas,
      total: revisao?.recomendacoes,
    },
  ].filter((linha) => linha.total > 0)

  return (
    <section className="saude__revisao" aria-labelledby="saude-revisao">
      <h3 className="saude__titulo" id="saude-revisao">
        As sugestões da IA estão passando por pessoas?
      </h3>
      <p className="saude__descricao">
        A IA só sugere — quem decide é a equipe. Cada barra mostra quanto do que
        a IA gerou já foi conferido por alguém.
      </p>

      {linhas.length ? (
        <div className="saude__medidores">
          {linhas.map((linha) => (
            <Medidor
              key={linha.rotulo}
              rotulo={linha.rotulo}
              valor={linha.parte}
              maximo={linha.total}
              tom="ok"
            >
              {linha.parte} de {linha.total} · {proporcao(linha.parte, linha.total)}%
            </Medidor>
          ))}
        </div>
      ) : (
        <p className="saude__nota">
          A IA ainda não gerou nada para revisar. Quando gerar, a proporção
          aparece aqui.
        </p>
      )}
    </section>
  )
}

function DetalhesDeTempo({ desempenho, erro }) {
  if (erro) return <p className="saude__erro">{erro}</p>

  if (!desempenho?.amostras) {
    return <p className="saude__nota">Nenhuma ação medida desde o último reinício.</p>
  }

  return (
    <dl className="saude__metricas">
      <Metrica rotulo="Metade das ações respondeu em até">
        {milissegundos(desempenho.p50_ms)}
      </Metrica>
      <Metrica rotulo="9 em cada 10 ações responderam em até">
        {milissegundos(desempenho.p90_ms)}
      </Metrica>
      <Metrica rotulo="Ações acima do aceitável">
        {contagem(desempenho.acima_do_limite || 0)}
      </Metrica>
      <Metrica rotulo="Ações medidas">{contagem(desempenho.amostras)}</Metrica>
    </dl>
  )
}

function DetalhesDaIA({ ia, erro }) {
  if (erro) return <p className="saude__erro">{erro}</p>

  if (!ia?.chamadas) {
    return (
      <p className="saude__nota">
        Sem uso de IA neste mês: não há erro nem token para mostrar.
      </p>
    )
  }

  return (
    <>
      <dl className="saude__metricas">
        <Metrica rotulo="Usos com erro">{contagem(ia.erros)}</Metrica>
        <Metrica rotulo="Usos que seguiram sem IA">{contagem(ia.fallbacks)}</Metrica>
        <Metrica rotulo="Tokens enviados">{contagem(ia.tokens_entrada)}</Metrica>
        <Metrica rotulo="Tokens recebidos">{contagem(ia.tokens_saida)}</Metrica>
        <Metrica rotulo="Tamanho médio de cada pedido">
          {ia.contexto_medio_tokens === null || ia.contexto_medio_tokens === undefined
            ? '—'
            : `${contagem(ia.contexto_medio_tokens)} tokens`}
        </Metrica>
        <Metrica rotulo="Versão do prompt">
          {ia.ultima_execucao?.versao_prompt || '—'}
        </Metrica>
      </dl>

      {ia.ultima_execucao?.erro ? (
        <p className="saude__erro">Último erro: {ia.ultima_execucao.erro}</p>
      ) : null}
    </>
  )
}

/**
 * Os numeros exatos, para quem investiga.
 *
 * Recolhidos por padrao e com o publico nomeado no botao: o administrador
 * le as verificacoes acima, e o suporte tecnico abre isto quando precisa do
 * milissegundo, do token e da versao do prompt.
 */
function DetalhesTecnicos({ dados }) {
  const [aberto, setAberto] = useState(false)

  return (
    <section className="saude__detalhes">
      <button
        type="button"
        className="saude__disclosure"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
      >
        <Icone icon={aberto ? appIcons.disclosure : appIcons.next} />
        Detalhes para o suporte técnico
      </button>

      {aberto ? (
        <div className="saude__detalhes-corpo">
          <p className="saude__nota">
            Números exatos, para quem investiga um problema. No dia a dia, as
            respostas acima bastam.
          </p>

          <div className="saude__bloco-tecnico">
            <h4 className="saude__subtitulo">Tempo de resposta</h4>
            <DetalhesDeTempo
              desempenho={dados.desempenho}
              erro={dados.desempenho_erro}
            />
            <p className="saude__fonte">
              Os tempos recomeçam do zero quando o servidor reinicia.
            </p>
          </div>

          <div className="saude__bloco-tecnico">
            <h4 className="saude__subtitulo">Uso da IA</h4>
            <DetalhesDaIA ia={dados.ia} erro={dados.ia_erro} />
          </div>

          {dados.jobs && !dados.jobs.configurado ? (
            <div className="saude__bloco-tecnico">
              <h4 className="saude__subtitulo">Tarefas em segundo plano</h4>
              <p className="saude__nota">{dados.jobs.motivo}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default function SaudeSection() {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [lidoEm, setLidoEm] = useState(null)

  const carregar = useCallback(async () => {
    setErro('')

    try {
      setDados(await obterSaudeDaPlataforma())
      setLidoEm(new Date())
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível ler a saúde da plataforma.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()

    const relogio = setInterval(carregar, INTERVALO_DE_RELEITURA_MS)

    return () => clearInterval(relogio)
  }, [carregar])

  if (carregando) {
    return (
      <p className="oportunidade-page__vazio" role="status">
        Verificando a plataforma...
      </p>
    )
  }

  return (
    <div className="saude">
      <header className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Saúde da plataforma</h2>
          <p className="admin-section__description">
            Veja se a plataforma está funcionando bem e quanto a IA consumiu
            neste mês.
            {lidoEm
              ? ` Atualizado às ${lidoEm.toLocaleTimeString('pt-BR')}; atualiza sozinho a cada 30 segundos.`
              : ''}
          </p>
        </div>

        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
          <Icone icon={appIcons.reset} />
          Atualizar agora
        </button>
      </header>

      {erro ? (
        <p className="saude__erro" role="alert">
          {erro}
        </p>
      ) : null}

      {dados ? (
        <>
          <Achados dados={dados} />
          <Consumo ia={dados.ia} erro={dados.ia_erro} />
          <Verificacoes dados={dados} />
          <RevisaoHumana revisao={dados.ia?.revisao_humana} />
          <DetalhesTecnicos dados={dados} />
        </>
      ) : null}
    </div>
  )
}
