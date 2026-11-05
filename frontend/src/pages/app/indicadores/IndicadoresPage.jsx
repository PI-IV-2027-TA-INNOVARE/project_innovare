import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  obterIndicadores,
  obterIndicadoresDeIA,
} from '../../../services/pdConnectApi'
import { useAtualizarAoFocar } from '../../../lib/atualizarAoFocar'
import { useAuth } from '../../../context/AuthContext'
import VerDetalhes from '../../../components/console/VerDetalhes'
import { TERMOS } from '../../../lib/glossario'
import { Icone, appIcons } from '../../../lib/icons'
import { ROLES } from '../../../lib/roles'
import './IndicadoresPage.scss'

const ETAPAS_COM_DECISAO = new Set(['continuar', 'revisar', 'arquivada'])

const TONS = Object.freeze({
  continuar: 'bom',
  revisar: 'atencao',
  arquivar: 'neutro',
  consolidada: 'bom',
  em_desenvolvimento: 'atencao',
  fragil: 'critico',
  cobertas: 'bom',
  com_lacuna: 'atencao',
  integral: 'bom',
  parcial: 'serie1',
  pontual: 'serie2',
  indisponivel: 'neutro',
})

const TONS_EM_ORDEM = ['serie1', 'serie2', 'neutro']

const PORCENTAGEM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function tomDe(item, indice) {
  return TONS[item.valor] || TONS_EM_ORDEM[indice % TONS_EM_ORDEM.length]
}

function rotuloDe(item) {
  return item.rotulo || item.valor
}

/**
 * Larguras inteiras que somam 100, para a barra empilhada fechar sem fresta.
 *
 * O arredondamento simples deixa 99% ou 101% quando há três partes iguais; a
 * sobra vai para as partes que perderam mais no arredondamento.
 */
function partesQueSomamCem(totais) {
  const soma = totais.reduce((acumulado, total) => acumulado + total, 0)

  if (!soma) return totais.map(() => 0)

  const brutas = totais.map((total) => (total / soma) * 100)
  const partes = brutas.map(Math.floor)
  let falta = 100 - partes.reduce((acumulado, parte) => acumulado + parte, 0)

  const porSobra = brutas
    .map((bruta, indice) => ({ indice, sobra: bruta - Math.floor(bruta) }))
    .sort((a, b) => b.sobra - a.sobra)

  for (const { indice } of porSobra) {
    if (falta <= 0) break
    partes[indice] += 1
    falta -= 1
  }

  return partes
}

function deDe(parte, todo) {
  if (parte === null || parte === undefined || todo === null || todo === undefined) return null

  return `${parte} de ${todo}`
}

function emPorcento(valor) {
  return valor === null || valor === undefined ? null : `${PORCENTAGEM.format(valor)}%`
}

function numero(rotulo, total, { destaque = false, texto = false } = {}) {
  return { rotulo, total, destaque, texto }
}

function Secao({ titulo, descricao, icon, colunas = false, children }) {
  const id = useId()

  return (
    <section className="perfil-card indicadores-secao" aria-labelledby={id}>
      <header className="perfil-card__header indicadores-secao__cabecalho">
        <div>
          <h2 className="perfil-card__title" id={id}>
            {icon && <Icone icon={icon} className="perfil-card__icon" aria-hidden="true" />}
            {titulo}
          </h2>
          {descricao && <p className="perfil-card__description">{descricao}</p>}
        </div>
      </header>

      <div
        className={`indicadores-secao__corpo${colunas ? ' indicadores-secao__corpo--colunas' : ''}`}
      >
        {children}
      </div>
    </section>
  )
}

function Resumo({ numeros }) {
  return (
    <section className="indicadores-resumo" aria-label="Resumo">
      <dl className="indicadores-resumo__lista">
        {numeros.map((item) => (
          <div key={item.legenda} className="indicadores-resumo__item">
            <dt className="indicadores-resumo__legenda">{item.legenda}</dt>
            <dd className="indicadores-resumo__numero">{item.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Etapa({ item, soma }) {
  const parte = soma ? Math.round((item.total / soma) * 100) : 0

  return (
    <>
      <span className="fluxo__rotulo">{rotuloDe(item)}</span>{' '}
      <span className="fluxo__total">{item.total}</span>
      <span className="fluxo__trilho" aria-hidden="true">
        <span className="fluxo__barra" style={{ width: `${parte}%` }} />
      </span>
    </>
  )
}

function EtapasDoFluxo({ titulo, itens, soma, destino }) {
  const id = useId()

  return (
    <div className="fluxo__grupo" style={{ '--etapas': itens.length }}>
      <h3 className="indicadores-grupo__titulo" id={id}>{titulo}</h3>

      <ol className="fluxo__etapas" aria-labelledby={id}>
        {itens.map((item) => (
          <li
            key={item.valor}
            className={`fluxo__etapa${item.total ? '' : ' fluxo__etapa--zero'}`}
          >
            {item.total ? (
              <Link className="fluxo__conteudo fluxo__conteudo--link" to={destino(item.valor)}>
                <Etapa item={item} soma={soma} />
              </Link>
            ) : (
              <div className="fluxo__conteudo">
                <Etapa item={item} soma={soma} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function FluxoDasOportunidades({ itens, destino }) {
  const soma = itens.reduce((total, item) => total + (item.total || 0), 0)
  const emAndamento = itens.filter((item) => !ETAPAS_COM_DECISAO.has(item.valor))
  const comDecisao = itens.filter((item) => ETAPAS_COM_DECISAO.has(item.valor))

  return (
    <div className="fluxo">
      <EtapasDoFluxo titulo="Em andamento" itens={emAndamento} soma={soma} destino={destino} />
      {comDecisao.length ? (
        <EtapasDoFluxo titulo="Com decisão" itens={comDecisao} soma={soma} destino={destino} />
      ) : null}
    </div>
  )
}

function Composicao({ titulo, itens }) {
  const partes = partesQueSomamCem(itens.map((item) => item.total || 0))

  return (
    <div className="indicadores-grupo">
      {titulo && <h3 className="indicadores-grupo__titulo">{titulo}</h3>}

      <div className="composicao__barra" aria-hidden="true">
        {itens.map((item, indice) =>
          item.total ? (
            <span
              key={item.valor}
              className={`composicao__segmento composicao__segmento--${tomDe(item, indice)}`}
              style={{ width: `${partes[indice]}%` }}
            />
          ) : null
        )}
      </div>

      <ul className="composicao__legenda">
        {itens.map((item, indice) => (
          <li
            key={item.valor}
            className={`composicao__item${item.total ? '' : ' composicao__item--zero'}`}
          >
            <span
              className={`composicao__amostra composicao__segmento--${tomDe(item, indice)}`}
              aria-hidden="true"
            />
            <span className="composicao__rotulo">{rotuloDe(item)}</span>{' '}
            <span className="composicao__total">{item.total}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LinhasComBarra({ titulo, nota, vazio, itens }) {
  const maior = Math.max(0, ...itens.map((item) => item.total || 0))

  if (!itens.length) {
    return (
      <div className="indicadores-grupo">
        <h3 className="indicadores-grupo__titulo">{titulo}</h3>
        <p className="indicadores-grupo__vazio">{vazio}</p>
      </div>
    )
  }

  return (
    <div className="indicadores-grupo">
      <h3 className="indicadores-grupo__titulo">{titulo}</h3>
      {nota ? <p className="indicadores-grupo__nota">{nota}</p> : null}

      <ul className="linhas">
        {itens.map((item) => (
          <li
            key={item.valor}
            className={`linhas__item${item.total ? '' : ' linhas__item--zero'}`}
          >
            <span className="linhas__rotulo">{rotuloDe(item)}</span>{' '}
            <span className="linhas__total">{item.total}</span>
            <span className="linhas__trilho" aria-hidden="true">
              <span
                className="linhas__barra"
                style={{ width: `${maior ? Math.round((item.total / maior) * 100) : 0}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Estatisticas({ titulo, itens }) {
  return (
    <div className="indicadores-grupo">
      {titulo && <h3 className="indicadores-grupo__titulo">{titulo}</h3>}

      <dl className="estatisticas">
        {itens.map((item) => (
          <div
            key={item.rotulo}
            className={`estatisticas__item${item.destaque ? ' estatisticas__item--destaque' : ''}`}
          >
            <dt className="estatisticas__rotulo">{item.rotulo}</dt>
            <dd className={`estatisticas__valor${item.texto ? ' estatisticas__valor--texto' : ''}`}>
              {item.total ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SecaoMatching({ dados }) {
  if (!dados.houve_rodada) {
    return (
      <Secao
        titulo="Matching"
        icon={appIcons.users}
        descricao="Nenhuma rodada de matching foi executada ainda. Os números aparecem depois da primeira — hoje é ausência de rodada, não resultado zero."
      />
    )
  }

  return (
    <Secao
      titulo="Matching"
      icon={appIcons.users}
      descricao="Quanto das competências demandadas a rede interna cobre."
    >
      <p className="indicadores-secao__destaque">
        {dados.competencias_demandadas ? (
          <>
            Das <strong>{dados.competencias_demandadas}</strong> competências que as propostas pedem,{' '}
            <strong>{dados.competencias_cobertas}</strong> (<strong>{emPorcento(dados.cobertura_percentual)}</strong>) têm alguém na equipe sugerida.
          </>
        ) : (
          'Nenhuma competência foi pedida pelas propostas ainda.'
        )}
      </p>

      {dados.competencias_demandadas ? (
        <Composicao
          itens={[
            { valor: 'cobertas', rotulo: 'Com alguém na equipe', total: dados.competencias_cobertas },
            { valor: 'com_lacuna', rotulo: 'Lacuna de competência', total: dados.competencias_com_lacuna },
          ]}
        />
      ) : null}

      <Estatisticas
        itens={[
          numero(
            'Marcadas como essenciais',
            deDe(dados.competencias_essenciais, dados.competencias_demandadas),
          ),
        ]}
      />

      <Estatisticas
        titulo="Pessoas indicadas"
        itens={[
          numero(
            'Em equipe já validada',
            deDe(dados.indicacoes_validadas, dados.indicacoes_incluidas),
          ),
          numero('Sugeridas pelo matching', dados.indicacoes_sugeridas),
          numero('Incluídas pelo Supervisor', dados.indicacoes_manuais),
          dados.score_medio === null || dados.score_medio === undefined
            ? numero('Compatibilidade média das sugeridas', 'ainda sem cálculo', { texto: true })
            : numero(
                'Compatibilidade média das sugeridas',
                `${Math.round(dados.score_medio * 100)}%`,
              ),
        ]}
      />
    </Secao>
  )
}

function SecaoMaturidade({ dados }) {
  if (!dados.houve_execucao) {
    return (
      <Secao
        titulo="Maturidade"
        icon={appIcons.researcher}
        descricao="Nenhuma pré-análise foi executada ainda. Os números aparecem depois da primeira."
      />
    )
  }

  const criterios = dados.versao_criterios
    ? ` Critérios de referência PIPE/FAPESP, versão ${dados.versao_criterios}.`
    : ''

  const frageis = dados.frageis_por_dimensao
    .filter((item) => item.total)
    .sort((a, b) => b.total - a.total)

  const avaliadas =
    dados.dimensoes_avaliadas ??
    dados.por_nivel.reduce((total, item) => total + (item.total || 0), 0)

  return (
    <Secao
      titulo="Maturidade"
      icon={appIcons.researcher}
      descricao={`Nível por dimensão nas pré-análises executadas. Orientativo — não é nota nem parecer.${criterios}`}
    >
      <LinhasComBarra
        titulo="Onde as propostas ficaram frágeis"
        nota="Quantas vezes cada dimensão saiu frágil."
        vazio="Nenhuma dimensão saiu frágil."
        itens={frageis}
      />
      <Composicao titulo={`Como ficaram as ${avaliadas} dimensões avaliadas`} itens={dados.por_nivel} />

      <Estatisticas
        titulo="Lacunas e recomendações"
        itens={[
          numero(
            'Lacunas da pré-análise em aberto',
            deDe(dados.lacunas_abertas, dados.lacunas),
            { destaque: true },
          ),
          numero(
            'Recomendações que o Supervisor acatou',
            deDe(dados.recomendacoes_acatadas, dados.recomendacoes),
          ),
          numero('Propostas pré-analisadas', dados.propostas_analisadas),
        ]}
      />
    </Secao>
  )
}

function ComoAsRodadasCorreram({ matching, maturidade }) {
  if (!matching.houve_rodada && !maturidade.houve_execucao) return null

  return (
    <VerDetalhes
      rotulo="Como as rodadas correram"
      rotuloAberto="Ocultar como as rodadas correram"
      className="indicadores-diagnostico"
    >
      <div className="indicadores-diagnostico__corpo">
        {matching.houve_rodada ? (
          <Estatisticas
            titulo="Rodadas de matching"
            itens={[
              numero('Executadas', matching.execucoes),
              numero('Concluídas', matching.execucoes_concluidas),
              numero(TERMOS.semAfinidade, matching.execucoes_sem_base_semantica),
              numero(`Com ${TERMOS.revisaoDaIa.toLowerCase()}`, matching.execucoes_com_rerank),
              numero('Equipes geradas', matching.equipes_geradas),
              numero(
                'Ligadas a uma competência já cadastrada na rede',
                deDe(matching.competencias_no_vocabulario, matching.competencias_demandadas),
              ),
            ]}
          />
        ) : null}

        {maturidade.houve_execucao ? (
          <Estatisticas
            titulo="Pré-análises"
            itens={[
              numero('Executadas', maturidade.execucoes),
              numero('Concluídas', maturidade.execucoes_concluidas),
              numero('Pré-análises sem resultado', maturidade.execucoes_com_erro),
            ]}
          />
        ) : null}
      </div>
    </VerDetalhes>
  )
}

function numerosDoResumo(dados, ia) {
  const numeros = [
    { legenda: 'oportunidades', valor: dados.oportunidades.total },
    { legenda: 'decisões registradas', valor: dados.decisoes.total },
  ]

  if (dados.rede) {
    numeros.push({ legenda: 'pessoas na rede interna', valor: dados.rede.total })
  }

  if (ia?.matching?.houve_rodada) {
    numeros.push({
      legenda: 'cobertura das competências',
      valor: emPorcento(ia.matching.cobertura_percentual) ?? '—',
    })
  }

  if (ia?.maturidade?.houve_execucao) {
    numeros.push({ legenda: 'pré-análises executadas', valor: ia.maturidade.execucoes })
  }

  return numeros
}

function horaDe(data) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function IndicadoresPage() {
  const { user } = useAuth()

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [atualizadoEm, setAtualizadoEm] = useState(null)
  const [ia, setIa] = useState(null)
  const [erroIa, setErroIa] = useState('')

  const ehSupervisor = user?.role === ROLES.SUPERVISOR
  const ehDemandante = user?.role === ROLES.DEMANDANTE

  const carregar = useCallback(() => {
    obterIndicadores()
      .then((resposta) => {
        setDados(resposta)
        setErro('')
        setAtualizadoEm(new Date())
      })
      .catch(() => setErro('Não foi possível carregar os indicadores. Tente novamente.'))
      .finally(() => setCarregando(false))
  }, [])

  const carregarIa = useCallback(() => {
    if (!ehSupervisor) return

    obterIndicadoresDeIA()
      .then((resposta) => {
        setIa(resposta)
        setErroIa('')
      })
      .catch(() =>
        setErroIa(
          'Não foi possível carregar os indicadores de matching e maturidade.',
        ),
      )
  }, [ehSupervisor])

  useEffect(() => {
    carregar()
    carregarIa()
  }, [carregar, carregarIa])

  useAtualizarAoFocar(carregar)

  if (carregando) {
    return (
      <div className="console indicadores-page">
        <p className="perfil-card__note" role="status">Carregando indicadores…</p>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="console indicadores-page">
        <p className="admin-callout" role="alert">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          {erro}
        </p>
      </div>
    )
  }

  const semOportunidade = dados.oportunidades?.total === 0
  const listaDoFluxo = ehDemandante ? '/problemas' : '/oportunidades'
  const disponibilidade = ia?.matching?.rede?.por_disponibilidade

  return (
    <div className="console indicadores-page">
      <header className="admin-section__header indicadores-page__cabecalho">
        <div className="admin-section__heading">
          <h1 className="admin-section__title">Indicadores</h1>
          <p className="admin-section__description">
            Os números do fluxo, no que você acompanha.
          </p>
        </div>
        {atualizadoEm ? (
          <p className="indicadores-page__atualizado">
            Atualizado às{' '}
            <time dateTime={atualizadoEm.toISOString()}>{horaDe(atualizadoEm)}</time>
          </p>
        ) : null}
      </header>

      {semOportunidade ? (
        <p className="perfil-card__note">
          Nenhuma oportunidade no seu acompanhamento ainda. Os números aparecem
          assim que a primeira entrar no fluxo.
        </p>
      ) : (
        <div className="indicadores-pilha">
          <Resumo numeros={numerosDoResumo(dados, ia)} />

          <Secao
            titulo="Oportunidades"
            icon={appIcons.folder}
            descricao="Em que etapa estão. Clique numa etapa para ver a lista."
          >
            <FluxoDasOportunidades
              itens={dados.oportunidades.por_situacao}
              destino={(situacao) => `${listaDoFluxo}?situacao=${situacao}`}
            />
            {ehDemandante ? null : (
              <Composicao titulo="Por origem" itens={dados.oportunidades.por_origem} />
            )}
          </Secao>

          <div className="indicadores-linha">
            <Secao
              titulo="Decisões"
              icon={appIcons.decision}
              descricao="Encaminhamentos já registrados."
            >
              <Composicao titulo="Por encaminhamento" itens={dados.decisoes.por_tipo} />
            </Secao>

            {dados.rede ? (
              <Secao
                titulo="Rede interna"
                icon={appIcons.users}
                colunas
                descricao={
                  disponibilidade
                    ? 'Quem está cadastrado e com que disponibilidade.'
                    : 'Quem está cadastrado.'
                }
              >
                <Composicao titulo="Por papel" itens={dados.rede.por_papel} />
                {disponibilidade ? (
                  <Composicao titulo="Por disponibilidade" itens={disponibilidade} />
                ) : null}
              </Secao>
            ) : null}
          </div>

          {ia ? (
            <div className="indicadores-linha">
              <SecaoMatching dados={ia.matching} />
              <SecaoMaturidade dados={ia.maturidade} />
            </div>
          ) : null}

          {erroIa ? (
            <p className="admin-callout" role="alert">
              <Icone icon={appIcons.warning} className="admin-callout__icon" />
              {erroIa}
            </p>
          ) : null}

          {ia ? <ComoAsRodadasCorreram matching={ia.matching} maturidade={ia.maturidade} /> : null}
        </div>
      )}
    </div>
  )
}
