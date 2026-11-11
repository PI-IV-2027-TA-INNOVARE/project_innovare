import { useCallback, useEffect, useState } from 'react'
import VerDetalhes from '../../../components/console/VerDetalhes'
import { DESCRICOES_DAS_OPERACOES, OPERACOES_DE_IA } from '../../../lib/glossario'
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
      'A IA foi usada, mas o custo não pôde ser calculado: falta configurar no servidor o preço cobrado pelo provedor.',
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

const ROTULOS_DAS_OPERACOES = OPERACOES_DE_IA

const SITUACOES_DA_EXECUCAO = {
  ok: 'concluído',
  erro: 'com erro',
  pendente: 'aguardando',
  executando: 'em andamento',
}

const PAPEIS_DOS_PROVEDORES = {
  principal: 'Principal',
  reserva: 'Reserva',
  fora_de_uso: 'Fora de uso',
}

const EXPLICACAO_DOS_PAPEIS = {
  principal: 'o principal responde a todos os pedidos',
  reserva: 'a reserva só responde quando o principal falha',
  fora_de_uso: 'fora de uso é quem respondeu neste mês, mas deixou de ser usado',
}

const AJUDA_DOS_NUMEROS_DA_IA = {
  erros:
    'O provedor estava fora do ar, recusou o pedido, demorou demais mesmo tentando de novo, ou respondeu algo que a plataforma não conseguiu ler.',
  fallbacks: 'A tela continuou sem a sugestão da IA.',
  tokensEnviados:
    'Texto que a plataforma mandou para a IA. Token é um pedaço de palavra, e é por ele que o provedor cobra.',
  tokensRecebidos: 'Texto que a IA devolveu, também medido em tokens.',
  contexto: 'Quanto texto vai, em média, em cada uso.',
  versao:
    'Muda quando a equipe de desenvolvimento do P&D Connect ajusta o que a plataforma pede à IA.',
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

function emUso(provedor) {
  return provedor.papel === 'principal' || provedor.papel === 'reserva'
}

function temPreco(provedor) {
  return (
    (provedor.preco_entrada_brl_por_milhao || 0) > 0 ||
    (provedor.preco_saida_brl_por_milhao || 0) > 0
  )
}

function nomeDoProvedor(provedor) {
  return provedor.modelo ? `${provedor.rotulo} · ${provedor.modelo}` : provedor.rotulo
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

function estaLenta(desempenho) {
  return (desempenho?.p90_ms || 0) > (desempenho?.limite_ms || Infinity)
}

function acimaDoLimite(desempenho) {
  const acima = desempenho.acima_do_limite || 0

  return `${contagem(acima)} das últimas ${plural(desempenho.amostras, 'ação', 'ações')} ${
    acima === 1 ? 'passou' : 'passaram'
  } de ${segundos(desempenho.limite_ms)}.`
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
  const lenta = estaLenta(desempenho)

  return (
    <Verificacao
      id={id}
      pergunta={pergunta}
      resposta={lenta ? 'Não, está lenta' : 'Sim, está rápida'}
      tom={lenta ? 'atencao' : 'ok'}
    >
      <Medidor
        rotulo="9 em cada 10 ações responderam em até"
        valor={proporcao(desempenho.p90_ms, desempenho.limite_ms)}
        maximo={100}
        tom={lenta ? 'atencao' : 'ok'}
        legenda={`O aceitável é até ${segundos(desempenho.limite_ms)}.`}
      >
        {segundos(desempenho.p90_ms)}
      </Medidor>

      {acima > 0 ? (
        <p className="saude__nota">
          {acimaDoLimite(desempenho)}
          {lenta
            ? ' Se a lentidão continuar, avise o suporte técnico.'
            : ' É pontual: 9 em cada 10 ações seguem dentro do aceitável.'}
        </p>
      ) : null}

      <p className="saude__fonte">
        Medido nas últimas {plural(desempenho.amostras, 'ação', 'ações')}, sem
        contar a espera pela IA. A medida recomeça quando a plataforma é
        reiniciada.
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

function consequenciaDaFalha(provedores) {
  if (provedores?.some((provedor) => provedor.papel === 'reserva')) {
    return '. Nesses casos a reserva tenta responder; se também falhar, a tela segue sem a sugestão da IA.'
  }

  return ', e a tela seguiu sem a sugestão da IA.'
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

  const falhas = ia.falhas || 0

  if (falhas > 0) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Com falhas" tom="atencao">
        <p className="saude__nota">
          {contagem(falhas)} dos {contagem(ia.chamadas)} usos deste mês{' '}
          {falhas === 1 ? 'falhou' : 'falharam'}
          {consequenciaDaFalha(ia.provedores)} Se isso se repetir, avise
          o suporte técnico.
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

function ComparacaoComARede({ comparacao, erro }) {
  const pergunta = 'A comparação com a rede está funcionando?'
  const id = 'saude-comparacao'

  if (erro || !comparacao) {
    return (
      <Verificacao id={id} pergunta={pergunta} resposta="Não foi possível verificar">
        <p className="saude__erro">{erro || 'Informação indisponível.'}</p>
      </Verificacao>
    )
  }

  const peso = `${Math.round((comparacao.peso_na_nota || 0) * 100)}% da nota`
  const rodadas = comparacao.rodadas_no_mes || 0
  const semAfinidade = comparacao.rodadas_sem_afinidade || 0

  let resposta = 'Sim, funcionando'
  let tom = 'ok'
  let situacao = `${plural(rodadas, 'rodada', 'rodadas')} de matching neste mês, ${
    rodadas === 1 ? 'com' : 'todas com'
  } a afinidade com o tema.`

  if (!comparacao.ligada) {
    resposta = 'Desligada'
    tom = 'atencao'
    situacao = `O matching sugere pesquisadores sem a afinidade com o tema, que vale ${peso}. Peça à equipe de desenvolvimento do P&D Connect para ligar.`
  } else if (semAfinidade > 0) {
    resposta = 'Com falhas'
    tom = 'atencao'
    situacao = `${contagem(semAfinidade)} das ${plural(rodadas, 'rodada', 'rodadas')} de matching deste mês ${
      semAfinidade === 1 ? 'saiu' : 'saíram'
    } sem a afinidade com o tema, que vale ${peso}. Se isso se repetir, avise o suporte técnico.`
  } else if (!rodadas) {
    resposta = 'Sim, ligada'
    situacao = 'Nenhuma rodada de matching neste mês.'
  }

  return (
    <Verificacao id={id} pergunta={pergunta} resposta={resposta} tom={tom}>
      <p className="saude__nota">{situacao}</p>
      <p className="saude__nota">{DESCRICOES_DAS_OPERACOES.embedding}</p>
      {comparacao.ultimo_calculo ? (
        <p className="saude__fonte">
          Último cálculo: {dataEHora(comparacao.ultimo_calculo)}.
        </p>
      ) : null}
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
 * sobre o qual ninguem age e ruido. Pela mesma razao, os detalhes tecnicos so
 * falam delas quando eram esperadas e nao estao rodando.
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
        <ComparacaoComARede comparacao={dados.comparacao} erro={dados.comparacao_erro} />
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

  if (estaLenta(desempenho)) {
    achados.push(`A plataforma está lenta: ${acimaDoLimite(desempenho)}`)
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

function Metrica({ rotulo, ajuda, children }) {
  return (
    <div className="saude__metrica">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
      {ajuda ? <dd className="saude__metrica-ajuda">{ajuda}</dd> : null}
    </div>
  )
}

function papelDoProvedor(provedor) {
  if (provedor.papel === 'sem_uso') {
    return provedor.configurado ? 'Disponível' : 'Não configurado'
  }

  return PAPEIS_DOS_PROVEDORES[provedor.papel] || provedor.papel
}

function explicacaoDosPapeis(provedores) {
  const frases = Object.keys(EXPLICACAO_DOS_PAPEIS)
    .filter((papel) => provedores.some((provedor) => provedor.papel === papel))
    .map((papel) => EXPLICACAO_DOS_PAPEIS[papel])
    .join('; ')

  return frases ? `${frases.charAt(0).toUpperCase()}${frases.slice(1)}.` : ''
}

function custoDoProvedor(provedor) {
  return provedor.custo_apurado ? reais(provedor.custo_estimado_brl) : 'não calculado'
}

function Numero({ rotulo, children }) {
  return (
    <div className="saude__provedor-numero">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Provedor({ provedor }) {
  return (
    <li className="saude__provedor">
      <div className="saude__provedor-cabeca">
        <p className="saude__provedor-nome">
          <span>{provedor.rotulo}</span>
          <span className="saude__provedor-modelo">
            {provedor.modelo || 'modelo não informado'}
          </span>
        </p>

        <span className={`saude__papel saude__papel--${provedor.papel}`}>
          {papelDoProvedor(provedor)}
        </span>

        {emUso(provedor) && !provedor.configurado ? (
          <span className="saude__provedor-aviso">não configurado</span>
        ) : null}
      </div>

      {provedor.chamadas ? (
        <dl className="saude__provedor-numeros">
          <Numero rotulo="Usos">{contagem(provedor.chamadas)}</Numero>
          <Numero rotulo="Falhas">{contagem(provedor.falhas || 0)}</Numero>
          <Numero rotulo="Custo">{custoDoProvedor(provedor)}</Numero>
          <Numero rotulo="Tempo médio">{segundos(provedor.latencia_media_ms)}</Numero>
        </dl>
      ) : (
        <p className="saude__nota saude__provedor-vazio">Sem uso neste mês.</p>
      )}
    </li>
  )
}

/**
 * Um cartao por provedor e modelo, na ordem que a API manda: principal,
 * reserva, fora de uso.
 *
 * Os registrados sem papel nem uso nao ajudam a ler o mes e ficam a um
 * clique. O preco de cada um fica nos detalhes para o suporte tecnico.
 */
function Provedores({ provedores }) {
  if (!provedores?.length) return null

  const visiveis = provedores.filter((provedor) => provedor.papel !== 'sem_uso')
  const semUso = provedores.filter((provedor) => provedor.papel === 'sem_uso')

  return (
    <div className="saude__provedores">
      <h4 className="saude__subtitulo">Provedores de IA neste mês</h4>
      <p className="saude__nota">
        Cada provedor e modelo aparece com o próprio consumo: quem respondeu,
        quem falhou e quanto custou. {explicacaoDosPapeis(visiveis)}
      </p>

      <ul className="saude__provedores-lista" aria-label="Consumo do mês por provedor de IA">
        {visiveis.map((provedor) => (
          <Provedor key={`${provedor.nome}:${provedor.modelo}`} provedor={provedor} />
        ))}
      </ul>

      {semUso.length ? (
        <VerDetalhes
          className="saude__provedores-sem-uso"
          rotulo={`${plural(semUso.length, 'outro provedor', 'outros provedores')} sem uso neste mês`}
          rotuloAberto="Ocultar provedores sem uso"
        >
          <ul className="saude__provedores-lista" aria-label="Provedores sem uso neste mês">
            {semUso.map((provedor) => (
              <Provedor key={`${provedor.nome}:${provedor.modelo}`} provedor={provedor} />
            ))}
          </ul>
        </VerDetalhes>
      ) : null}
    </div>
  )
}

function AvisoDePreco({ provedores }) {
  const ativos = (provedores || []).filter(emUso)
  const semPreco = ativos.filter((provedor) => !temPreco(provedor))

  if (!semPreco.length) return null

  const texto =
    semPreco.length === ativos.length
      ? 'A tabela de preço da IA está vazia. Sem ela o custo de cada uso não é calculado, e os limites de gasto, do mês e por oportunidade, não bloqueiam nada. Peça a quem mantém o servidor para preencher o preço do provedor.'
      : `Falta o preço de ${semPreco.map(nomeDoProvedor).join(' e ')}. Os usos dele não têm custo calculado e não contam para os limites de gasto, do mês e por oportunidade. Peça a quem mantém o servidor para preencher o preço.`

  return (
    <div className="admin-callout admin-callout--alerta">
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <p className="admin-callout__text">{texto}</p>
    </div>
  )
}

/**
 * O consumo do mes — o protagonista da tela (plano 5.3).
 *
 * `gastoPorOperacao` atende "custo estimado por fluxo": o total do mes nao
 * responde onde cortar gasto, e o corte por operacao sim.
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

        {estado.explicacao ? (
          <p className="saude__nota">{estado.explicacao}</p>
        ) : null}

        <AvisoDePreco provedores={ia.provedores} />
      </div>

      <Provedores provedores={ia.provedores} />

      {gastoPorOperacao.length > 0 ? (
        <ul className="saude__gasto" aria-label="Gasto por operação no mês">
          {gastoPorOperacao.map(([tipo, valor]) => (
            <li className="saude__gasto-item" key={tipo}>
              <span className="saude__gasto-texto">
                <span className="saude__gasto-rotulo">
                  {ROTULOS_DAS_OPERACOES[tipo] || tipo}
                </span>
                {DESCRICOES_DAS_OPERACOES[tipo] ? (
                  <span className="saude__gasto-descricao">
                    {DESCRICOES_DAS_OPERACOES[tipo]}
                  </span>
                ) : null}
              </span>
              <span className="saude__gasto-valor">{reais(valor)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {mostrarValor ? (
        <dl className="saude__complemento">
          <Metrica rotulo="Usos no mês">{contagem(ia.chamadas)}</Metrica>
        </dl>
      ) : null}
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
        As sugestões da plataforma estão passando por pessoas?
      </h3>
      <p className="saude__descricao">
        A plataforma só sugere — quem decide é a equipe. Cada barra mostra quanto
        do que ela sugeriu já foi conferido por alguém, com ou sem a IA, desde o
        começo do uso da plataforma, e não só neste mês. Por isso as barras
        podem ter números mesmo num mês em que a IA não foi usada.
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
          A plataforma ainda não sugeriu nada para revisar. Quando sugerir, a
          proporção aparece aqui.
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

function dataEHora(iso) {
  if (!iso) return ''

  return new Date(iso)
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(', ', ' às ')
}

function ultimoUso(execucao) {
  if (!execucao) return 'nenhum'

  return [
    ROTULOS_DAS_OPERACOES[execucao.tipo] || execucao.tipo,
    SITUACOES_DA_EXECUCAO[execucao.status] || execucao.status,
    dataEHora(execucao.criado_em),
  ]
    .filter(Boolean)
    .join(' · ')
}

function DetalhesDaIA({ ia, erro }) {
  if (erro) return <p className="saude__erro">{erro}</p>

  if (!ia?.chamadas) {
    return (
      <>
        <p className="saude__nota">
          A IA não foi usada neste mês, então não há falhas nem consumo para
          mostrar.
        </p>
        {ia?.ultima_execucao ? (
          <p className="saude__fonte">
            Último uso: {ultimoUso(ia.ultima_execucao)}.{' '}
            {DESCRICOES_DAS_OPERACOES[ia.ultima_execucao.tipo]}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <>
      <dl className="saude__metricas saude__metricas--explicadas">
        <Metrica rotulo="Usos com erro" ajuda={AJUDA_DOS_NUMEROS_DA_IA.erros}>
          {contagem(ia.erros)}
        </Metrica>
        <Metrica rotulo="Usos que seguiram sem IA" ajuda={AJUDA_DOS_NUMEROS_DA_IA.fallbacks}>
          {contagem(ia.fallbacks)}
        </Metrica>
        <Metrica rotulo="Tokens enviados" ajuda={AJUDA_DOS_NUMEROS_DA_IA.tokensEnviados}>
          {contagem(ia.tokens_entrada)}
        </Metrica>
        <Metrica rotulo="Tokens recebidos" ajuda={AJUDA_DOS_NUMEROS_DA_IA.tokensRecebidos}>
          {contagem(ia.tokens_saida)}
        </Metrica>
        <Metrica rotulo="Tamanho médio de cada pedido" ajuda={AJUDA_DOS_NUMEROS_DA_IA.contexto}>
          {ia.contexto_medio_tokens === null || ia.contexto_medio_tokens === undefined
            ? '—'
            : `${contagem(ia.contexto_medio_tokens)} tokens`}
        </Metrica>
        <Metrica
          rotulo="Último uso"
          ajuda={DESCRICOES_DAS_OPERACOES[ia.ultima_execucao?.tipo]}
        >
          {ultimoUso(ia.ultima_execucao)}
        </Metrica>
        <Metrica rotulo="Versão das instruções da IA" ajuda={AJUDA_DOS_NUMEROS_DA_IA.versao}>
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
function precoDoProvedor(provedor) {
  if (!temPreco(provedor)) return 'sem preço configurado'

  return `${reais(provedor.preco_entrada_brl_por_milhao)} enviados · ${reais(
    provedor.preco_saida_brl_por_milhao
  )} recebidos`
}

function PrecosDosProvedores({ provedores }) {
  const comPapelOuUso = (provedores || []).filter(
    (provedor) => provedor.papel !== 'sem_uso'
  )

  if (!comPapelOuUso.length) return null

  return (
    <section className="saude__bloco-tecnico" aria-labelledby="saude-precos">
      <h4 className="saude__subtitulo" id="saude-precos">
        Preço de cada provedor
      </h4>
      <dl className="saude__metricas">
        {comPapelOuUso.map((provedor) => (
          <Metrica
            key={`${provedor.nome}:${provedor.modelo}`}
            rotulo={nomeDoProvedor(provedor)}
          >
            {precoDoProvedor(provedor)}
          </Metrica>
        ))}
      </dl>
      <p className="saude__fonte">
        Preço por milhão de tokens, usado para calcular o custo de cada uso.
      </p>
    </section>
  )
}

function DetalhesDaComparacao({ comparacao }) {
  if (!comparacao?.modelo) return null

  return (
    <section className="saude__bloco-tecnico" aria-labelledby="saude-comparacao-detalhes">
      <h4 className="saude__subtitulo" id="saude-comparacao-detalhes">
        Comparação com a rede
      </h4>
      <dl className="saude__metricas saude__metricas--explicadas">
        <Metrica
          rotulo="Modelo"
          ajuda="Roda na própria plataforma: o texto dos perfis e das competências não sai para nenhum provedor."
        >
          {comparacao.modelo}
        </Metrica>
      </dl>
    </section>
  )
}

function DetalhesTecnicos({ dados }) {
  return (
    <section className="saude__detalhes">
      <VerDetalhes
        rotulo="Detalhes para o suporte técnico"
        rotuloAberto="Ocultar detalhes para o suporte técnico"
      >
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

          <PrecosDosProvedores provedores={dados.ia?.provedores} />

          <DetalhesDaComparacao comparacao={dados.comparacao} />

          {dados.jobs?.esperada && !dados.jobs.configurado ? (
            <div className="saude__bloco-tecnico">
              <h4 className="saude__subtitulo">Tarefas em segundo plano</h4>
              <p className="saude__nota">{dados.jobs.motivo}</p>
            </div>
          ) : null}
        </div>
      </VerDetalhes>
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
