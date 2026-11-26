import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminModal from '../../../../components/console/AdminModal'
import VerDetalhes from '../../../../components/console/VerDetalhes'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { LIMITES_DE_GASTO, MOTIVOS_DE_FALHA_DA_PREANALISE } from '../../../../lib/glossario'
import { Icone, appIcons } from '../../../../lib/icons'
import {
  ROTULOS_DAS_DIMENSOES,
  SEM_RECOMENDACAO,
  agruparPorLacuna,
  rotuloDoCriterio,
} from '../../../../lib/lacunas'
import { ROLES } from '../../../../lib/roles'
import {
  acatarRecomendacao,
  executarPreAnalise,
  listarPreAnalises,
  obterEquipePotencial,
  obterPreAnalise,
  obterPreAnaliseDaRodada,
} from '../../../../services/pdConnectApi'
import { situacaoEncerrada } from '../etapas'
import EsperaIA from './EsperaIA'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import BarraDeAcoes, { ContinuarPara } from './BarraDeAcoes'
import EtapaEncerrada from './EtapaEncerrada'
import ProximoPasso from './ProximoPasso'
import '../OportunidadesPage.scss'

const CODIGO_SEM_ANALISE = 'preanalise_inexistente'
const CODIGO_SEM_PROPOSTA = 'proposta_inexistente'
const CODIGO_SEM_CRITERIOS = 'criterios_ausentes'
const CODIGO_SEM_EQUIPE = 'equipe_inexistente'
const STATUS_EM_ANDAMENTO = ['pendente', 'executando']

const NIVEIS = [
  { id: 'consolidada', singular: 'consolidada', plural: 'consolidadas', rotulo: 'Consolidada' },
  {
    id: 'em_desenvolvimento',
    singular: 'em desenvolvimento',
    plural: 'em desenvolvimento',
    rotulo: 'Em desenvolvimento',
  },
  { id: 'fragil', singular: 'frágil', plural: 'frágeis', rotulo: 'Frágil' },
]

function proximoPasso(erro) {
  if (LIMITES_DE_GASTO.includes(erro)) return ''

  if (erro === 'execucao_interrompida') return ' Reavalie para tentar de novo.'

  return ' Tente reavaliar em alguns minutos.'
}

const rotuloDaDimensao = (dimensao) =>
  ROTULOS_DAS_DIMENSOES[dimensao.dimensao] || dimensao.dimensao_rotulo

const rotuloDoNivel = (dimensao) =>
  NIVEIS.find((nivel) => nivel.id === dimensao.nivel)?.rotulo || dimensao.nivel_rotulo

function formatarData(valor) {
  const data = valor ? new Date(valor) : null
  return data && !Number.isNaN(data.getTime()) ? data.toLocaleDateString('pt-BR') : ''
}

function Resumo({ dimensoes }) {
  const partes = NIVEIS.map((nivel) => {
    const total = dimensoes.filter((dimensao) => dimensao.nivel === nivel.id).length
    return total > 0
      ? { id: nivel.id, texto: `${total} ${total === 1 ? nivel.singular : nivel.plural}` }
      : null
  }).filter(Boolean)

  if (partes.length === 0) return null

  return (
    <ul className="preanalise__resumo" aria-label="Dimensões por nível">
      {partes.map((parte) => (
        <li key={parte.id} className={`preanalise__nivel preanalise__nivel--${parte.id}`}>
          {parte.texto}
        </li>
      ))}
    </ul>
  )
}

export function primeiraFrase(texto) {
  const limpo = (texto || '').trim()
  const fim = limpo.search(/[.!?](\s|$)/)

  if (fim === -1) return { frase: limpo, resto: '' }

  return { frase: limpo.slice(0, fim + 1), resto: limpo.slice(fim + 1).trim() }
}

const lacunasPorExtenso = (total) => `${total} ${total === 1 ? 'lacuna' : 'lacunas'}`

const comoFrase = (texto) => `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`

function Dimensao({ dimensao, lacunas, aoVerLacunas }) {
  const { frase, resto } = primeiraFrase(dimensao.avaliacao)
  const temDetalhe = Boolean(resto) || dimensao.evidencias?.length > 0

  return (
    <li className={`preanalise__dimensao preanalise__dimensao--${dimensao.nivel}`}>
      <div className="preanalise__dimensao-cabeca">
        <h4 className="preanalise__dimensao-nome">{rotuloDaDimensao(dimensao)}</h4>
        <span className={`preanalise__nivel preanalise__nivel--${dimensao.nivel}`}>
          {rotuloDoNivel(dimensao)}
        </span>
      </div>

      {dimensao.nivel_significado ? (
        <p className="preanalise__nivel-significado">
          {comoFrase(dimensao.nivel_significado)}
        </p>
      ) : null}

      <p className="preanalise__avaliacao">{frase}</p>

      {lacunas.length > 0 ? (
        <p className="preanalise__dimensao-lacunas">
          {aoVerLacunas ? (
            <button type="button" className="link-button" onClick={aoVerLacunas}>
              {lacunasPorExtenso(lacunas.length)} em O que melhorar
            </button>
          ) : (
            `${lacunasPorExtenso(lacunas.length)} em O que melhorar`
          )}
        </p>
      ) : null}

      {temDetalhe ? (
        <VerDetalhes>
          {resto ? <p className="preanalise__avaliacao">{resto}</p> : null}

          {dimensao.evidencias?.length > 0 ? (
            <>
              <p className="preanalise__rotulo">Evidências na proposta</p>
              <ul className="preanalise__evidencias">
                {dimensao.evidencias.map((evidencia, indice) => (
                  <li key={`${dimensao.id_dimensao}-${indice}`}>{evidencia}</li>
                ))}
              </ul>
            </>
          ) : null}
        </VerDetalhes>
      ) : null}
    </li>
  )
}

const MOVIMENTOS = {
  avancou: 'Avançou',
  recuou: 'Recuou',
  manteve: 'Manteve',
  nova: 'Avaliada agora',
  sem_avaliacao: 'Não avaliada agora',
}

const rotuloDoNivelId = (id) => NIVEIS.find((nivel) => nivel.id === id)?.rotulo || '—'

function Comparacao({ comparacao, versaoAtual }) {
  const data = formatarData(comparacao.anterior.executada_em)

  return (
    <div className="preanalise__bloco preanalise__comparacao">
      <h3 className="preanalise__subtitulo">
        Em relação à análise anterior
        {data ? <span className="preanalise__contagem"> ({data})</span> : null}
      </h3>

      {!comparacao.mesmos_criterios ? (
        <p className="preanalise__comparacao-aviso">
          Os critérios mudaram entre as duas rodadas ({comparacao.anterior.versao_criterios} antes,{' '}
          {versaoAtual} agora): parte da diferença pode vir da régua, não da proposta.
        </p>
      ) : null}

      {comparacao.dimensoes.length > 0 ? (
        <ul className="preanalise__movimentos">
          {comparacao.dimensoes.map((item) => (
            <li key={item.dimensao} className="preanalise__movimento">
              <span className="preanalise__movimento-dimensao">
                {ROTULOS_DAS_DIMENSOES[item.dimensao] || item.dimensao_rotulo}
              </span>
              <span className="preanalise__movimento-niveis">
                {rotuloDoNivelId(item.nivel_anterior)} → {rotuloDoNivelId(item.nivel_atual)}
              </span>
              <span className={`preanalise__direcao preanalise__direcao--${item.movimento}`}>
                {MOVIMENTOS[item.movimento] || item.movimento}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="preanalise__comparacao-lacunas">
        {lacunasPorExtenso(comparacao.lacunas.anterior)} antes, {comparacao.lacunas.atual} agora.
      </p>

      {comparacao.recomendacoes ? (
        <>
          <p className="preanalise__comparacao-lacunas">
            {recomendacoesPorExtenso(comparacao.recomendacoes.anterior)} antes,{' '}
            {comparacao.recomendacoes.atual} agora.
          </p>

          {comparacao.recomendacoes.acatadas_na_anterior.length > 0 ? (
            <div className="preanalise__acatadas-anterior">
              <p className="preanalise__rotulo">Acatadas na análise anterior</p>
              <ul>
                {comparacao.recomendacoes.acatadas_na_anterior.map((recomendacao) => (
                  <li key={recomendacao.id_recomendacao}>
                    <Icone icon={appIcons.done} aria-hidden="true" />
                    <span>{recomendacao.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

const recomendacoesPorExtenso = (total) =>
  `${total} ${total === 1 ? 'recomendação' : 'recomendações'}`

function semResultado(rodada) {
  const motivo = rodada.status === 'erro' ? MOTIVOS_DE_FALHA_DA_PREANALISE[rodada.erro] : ''

  return motivo ? `Não produziu resultado: ${motivo}` : 'Sem resultado'
}

function maisRecenteConcluida(rodadas) {
  return rodadas
    .filter((rodada) => rodada.status === 'ok' && !rodada.atual)
    .sort((a, b) => Date.parse(b.executada_em) - Date.parse(a.executada_em))[0]
}

function HistoricoDePreAnalises({ rodadas, aoVer }) {
  if (rodadas.length < 2) return null

  return (
    <VerDetalhes
      rotulo={`Todas as pré-análises (${rodadas.length})`}
      rotuloAberto="Ocultar as pré-análises anteriores"
      className="preanalise__historico"
    >
      <ul className="preanalise__rodadas" aria-label="Pré-análises desta oportunidade">
        {rodadas.map((rodada) => {
          const data = formatarData(rodada.executada_em)

          return (
            <li key={rodada.id_pre_analise} className="preanalise__rodada">
              <div className="preanalise__rodada-texto">
                <span className="preanalise__rodada-data">{data || 'Sem data'}</span>
                <span className="preanalise__rodada-detalhe">
                  Proposta na versão {rodada.versao_proposta} · critérios {rodada.versao_criterios}
                  {rodada.status === 'ok' ? '' : ` · ${rodada.status_rotulo}`}
                </span>
                <span className="preanalise__rodada-detalhe">
                  {rodada.status === 'ok'
                    ? `${lacunasPorExtenso(rodada.lacunas)} · ${rodada.recomendacoes_acatadas} de ${
                        rodada.recomendacoes
                      } ${rodada.recomendacoes === 1 ? 'recomendação acatada' : 'recomendações acatadas'}`
                    : semResultado(rodada)}
                </span>
              </div>

              {rodada.atual ? (
                <span className="proposta__selo">
                  {rodada.status === 'ok' ? 'Atual' : 'Mais recente'}
                </span>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => aoVer(rodada)}
                  aria-label={`Ver a pré-análise de ${data}`}
                >
                  <Icone icon={appIcons.view} />
                  Ver
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </VerDetalhes>
  )
}

function ConteudoDaRodada({ analise }) {
  const dimensoes = analise.dimensoes || []
  const lacunas = analise.lacunas || []
  const motivo = analise.status === 'erro' ? MOTIVOS_DE_FALHA_DA_PREANALISE[analise.erro] : ''

  return (
    <div className="preanalise__corpo">
      {analise.status === 'erro' ? (
        <div className="admin-callout admin-callout--alerta" role="note">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Esta execução não produziu resultado{motivo ? `: ${motivo}` : ''}.
          </p>
        </div>
      ) : null}

      {analise.sintese ? <p className="preanalise__sintese">{analise.sintese}</p> : null}
      {dimensoes.length > 0 ? <Resumo dimensoes={dimensoes} /> : null}

      {analise.comparacao ? (
        <Comparacao comparacao={analise.comparacao} versaoAtual={analise.versao_criterios} />
      ) : null}

      <Resultado
        dimensoes={dimensoes}
        lacunas={lacunas}
        recomendacoes={analise.recomendacoes || []}
        podeExecutar={false}
      />
    </div>
  )
}

function RodadaAnterior({ analise, onFechar }) {
  return (
    <AdminModal
      title={`Pré-análise de ${formatarData(analise.executada_em)}`}
      description={`Proposta na versão ${analise.versao_proposta} · critérios ${analise.versao_criterios}. Somente leitura: as recomendações se marcam na pré-análise atual.`}
      onClose={onFechar}
      size="xl"
      footer={
        <button type="button" className="admin-btn admin-btn--outline" onClick={onFechar}>
          Fechar
        </button>
      }
    >
      <ConteudoDaRodada analise={analise} />
    </AdminModal>
  )
}

function UltimoResultadoValido({ analise }) {
  const id = useId()

  return (
    <section className="preanalise__valida" aria-labelledby={id}>
      <h3 id={id} className="preanalise__subtitulo">
        Último resultado válido, de {formatarData(analise.executada_em)}
      </h3>
      <p className="preanalise__versoes">
        Somente leitura. É o resultado mais recente que terminou · critérios{' '}
        {analise.versao_criterios} · proposta na versão {analise.versao_proposta}.
      </p>
      <ConteudoDaRodada analise={analise} />
    </section>
  )
}

function Recomendacoes({ itens, podeExecutar, ocupado, aoAlternar }) {
  return (
    <ul className="preanalise__recomendacoes">
      {itens.map((recomendacao) => (
        <li key={recomendacao.id_recomendacao} className="preanalise__recomendacao">
          <span className={recomendacao.acatada ? 'preanalise__acatada' : undefined}>
            {recomendacao.texto}
          </span>

          {podeExecutar ? (
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--outline"
              onClick={() => aoAlternar(recomendacao)}
              disabled={Boolean(ocupado)}
            >
              <Icone icon={recomendacao.acatada ? appIcons.reset : appIcons.done} />
              {recomendacao.acatada ? 'Reabrir' : 'Marcar como acatada'}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

const OUTRAS_LACUNAS = 'outras'

const OUTRAS_RECOMENDACOES = 'recomendacoes'

const contar = (total, singular, plural) => `${total} ${total === 1 ? singular : plural}`

function acatadasPorExtenso(recomendacoes) {
  const acatadas = recomendacoes.filter((item) => item.acatada).length
  const total = recomendacoes.length

  return `${acatadas} de ${total} ${total === 1 ? 'acatada' : 'acatadas'}`
}

function gruposPorDimensao(dimensoes, lacunas, recomendacoes) {
  const { grupos, soltas } = agruparPorLacuna(lacunas, recomendacoes)
  const avaliadas = dimensoes.map((dimensao) => dimensao.dimensao)
  const ordem = [...new Set([...avaliadas, ...Object.keys(ROTULOS_DAS_DIMENSOES)])]
  const porChave = new Map()

  for (const grupo of grupos) {
    const campo = grupo.lacuna.campo_afetado
    const chave = ordem.includes(campo) ? campo : OUTRAS_LACUNAS

    if (!porChave.has(chave)) porChave.set(chave, [])
    porChave.get(chave).push(grupo)
  }

  const daDimensao = [...porChave.keys()]
    .sort((a, b) => (a === OUTRAS_LACUNAS) - (b === OUTRAS_LACUNAS) || ordem.indexOf(a) - ordem.indexOf(b))
    .map((chave) => {
      const itens = porChave.get(chave)
      const avaliada = dimensoes.find((dimensao) => dimensao.dimensao === chave)
      const daChave = itens.flatMap((item) => item.recomendacoes)
      const partes = [contar(itens.length, 'lacuna', 'lacunas')]

      if (daChave.length > 0) partes.push(acatadasPorExtenso(daChave))

      return {
        chave,
        titulo:
          chave === OUTRAS_LACUNAS
            ? 'Outras lacunas'
            : ROTULOS_DAS_DIMENSOES[chave] || avaliada?.dimensao_rotulo || chave,
        nivel: avaliada ? { id: avaliada.nivel, rotulo: rotuloDoNivel(avaliada) } : null,
        resumo: partes.join(' · '),
        itens,
      }
    })

  if (soltas.length > 0) {
    daDimensao.push({
      chave: OUTRAS_RECOMENDACOES,
      titulo: 'Outras recomendações',
      nivel: null,
      resumo: `${contar(soltas.length, 'recomendação', 'recomendações')} · ${acatadasPorExtenso(soltas)}`,
      soltas,
    })
  }

  return daDimensao
}

function GrupoDoQueMelhorar({ id, grupo, aberto, aoAlternar, children }) {
  const conteudo = `${id}-conteudo`

  return (
    <li id={id} className="preanalise__melhoria">
      <h4 className="preanalise__melhoria-titulo">
        <button
          type="button"
          className="preanalise__melhoria-botao"
          aria-expanded={aberto}
          aria-controls={conteudo}
          onClick={aoAlternar}
        >
          <Icone icon={aberto ? appIcons.disclosure : appIcons.next} />
          <span className="preanalise__melhoria-nome">{grupo.titulo}</span>
          {grupo.nivel ? (
            <>
              {' · '}
              <span className={`preanalise__nivel preanalise__nivel--${grupo.nivel.id}`}>
                {grupo.nivel.rotulo}
              </span>
            </>
          ) : null}
          {' · '}
          <span className="preanalise__melhoria-resumo">{grupo.resumo}</span>
        </button>
      </h4>

      <div id={conteudo} className="preanalise__melhoria-conteudo" hidden={!aberto}>
        {children}
      </div>
    </li>
  )
}

function OQueMelhorar({ dimensoes = [], lacunas, recomendacoes, abertos, aoAlternarGrupo, idDoGrupo, ...acoes }) {
  const grupos = gruposPorDimensao(dimensoes, lacunas, recomendacoes)
  const acatadas = recomendacoes.filter((item) => item.acatada).length

  if (grupos.length === 0) return null

  return (
    <div className="preanalise__bloco">
      <h3 className="preanalise__subtitulo">
        O que melhorar
        {recomendacoes.length > 0 ? (
          <span className="preanalise__contagem">
            {' '}({acatadas} de {recomendacoes.length} acatadas)
          </span>
        ) : null}
      </h3>

      <ul className="preanalise__melhorias">
        {grupos.map((grupo) => (
          <GrupoDoQueMelhorar
            key={grupo.chave}
            id={idDoGrupo(grupo.chave)}
            grupo={grupo}
            aberto={abertos.has(grupo.chave)}
            aoAlternar={() => aoAlternarGrupo(grupo.chave)}
          >
            {grupo.soltas ? (
              <Recomendacoes itens={grupo.soltas} {...acoes} />
            ) : (
              <ul className="preanalise__grupos">
                {grupo.itens.map(({ lacuna, recomendacoes: daLacuna }) => (
                  <li key={lacuna.id_lacuna} className="preanalise__grupo">
                    <div className="preanalise__grupo-cabeca">
                      <span
                        className={`preanalise__criterio${
                          lacuna.criterio_codigo ? '' : ' preanalise__criterio--sem-evidencia'
                        }`}
                      >
                        {rotuloDoCriterio(lacuna)}
                      </span>
                    </div>

                    <p className="preanalise__grupo-lacuna">{lacuna.descricao}</p>

                    {daLacuna.length > 0 ? (
                      <Recomendacoes itens={daLacuna} {...acoes} />
                    ) : (
                      <p className="preanalise__sem-recomendacao">{SEM_RECOMENDACAO}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GrupoDoQueMelhorar>
        ))}
      </ul>
    </div>
  )
}

function Resultado({ dimensoes, lacunas, recomendacoes, ...acoes }) {
  const prefixo = useId()
  const [abertos, setAbertos] = useState(() => new Set())
  const [alvo, setAlvo] = useState(null)

  const idDoGrupo = (chave) => `${prefixo}-melhorar-${chave}`

  useEffect(() => {
    if (!alvo) return

    const grupo = document.getElementById(`${prefixo}-melhorar-${alvo}`)

    grupo?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    grupo?.querySelector('button')?.focus({ preventScroll: true })
    setAlvo(null)
  }, [alvo, prefixo])

  const alternarGrupo = (chave) => {
    setAbertos((atuais) => {
      const novos = new Set(atuais)

      if (novos.has(chave)) novos.delete(chave)
      else novos.add(chave)

      return novos
    })
  }

  const abrirGrupo = (chave) => {
    setAbertos((atuais) => new Set(atuais).add(chave))
    setAlvo(chave)
  }

  return (
    <>
      {dimensoes.length > 0 ? (
        <div className="preanalise__bloco">
          <h3 className="preanalise__subtitulo">Dimensões avaliadas</h3>
          <ul className="preanalise__dimensoes">
            {dimensoes.map((dimensao) => (
              <Dimensao
                key={dimensao.id_dimensao}
                dimensao={dimensao}
                lacunas={lacunas.filter((lacuna) => lacuna.campo_afetado === dimensao.dimensao)}
                aoVerLacunas={() => abrirGrupo(dimensao.dimensao)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <OQueMelhorar
        dimensoes={dimensoes}
        lacunas={lacunas}
        recomendacoes={recomendacoes}
        abertos={abertos}
        aoAlternarGrupo={alternarGrupo}
        idDoGrupo={idDoGrupo}
        {...acoes}
      />
    </>
  )
}

function AvisoSemEquipe({ irPara }) {
  return (
    <div className="admin-callout admin-callout--alerta" role="note">
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <p className="admin-callout__text">
        A pré-análise avalia também a equipe: gere a equipe potencial, com ao
        menos uma pessoa incluída, antes de pré-analisar.
      </p>
      {irPara ? (
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--outline"
          onClick={() => irPara('equipe')}
        >
          Ir para Equipe potencial
        </button>
      ) : null}
    </div>
  )
}

export default function AbaPreAnalise({ oportunidadeId, situacao, aoOcupar, irPara }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const ehSupervisor = user?.role === ROLES.SUPERVISOR
  const encerrada = situacaoEncerrada(situacao)
  const podeExecutar = ehSupervisor && !encerrada

  const [analise, setAnalise] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [semAnalise, setSemAnalise] = useState(false)
  const [semProposta, setSemProposta] = useState(false)
  const [semEquipe, setSemEquipe] = useState(false)
  const [propostaPendente, setPropostaPendente] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [rodadas, setRodadas] = useState([])
  const [rodadaAberta, setRodadaAberta] = useState(null)
  const [ultimaValida, setUltimaValida] = useState(null)

  const idDaAtual = analise?.id_pre_analise
  const acatadasDaAtual = (analise?.recomendacoes || []).filter((item) => item.acatada).length
  const idDaUltimaValida =
    analise?.status === 'erro' ? maisRecenteConcluida(rodadas)?.id_pre_analise : undefined

  useEffect(() => {
    if (!idDaUltimaValida) {
      setUltimaValida(null)
      return undefined
    }

    let ativo = true

    obterPreAnaliseDaRodada(oportunidadeId, idDaUltimaValida)
      .then((dados) => {
        if (ativo) setUltimaValida(dados)
      })
      .catch(() => {
        if (ativo) setUltimaValida(null)
      })

    return () => {
      ativo = false
    }
  }, [oportunidadeId, idDaUltimaValida])

  useEffect(() => {
    if (!idDaAtual) return undefined

    let ativo = true

    listarPreAnalises(oportunidadeId)
      .then((lista) => {
        if (ativo) setRodadas(lista || [])
      })
      .catch(() => {
        if (ativo) setRodadas([])
      })

    return () => {
      ativo = false
    }
  }, [oportunidadeId, idDaAtual, acatadasDaAtual])

  const verRodada = async (rodada) => {
    try {
      setRodadaAberta(await obterPreAnaliseDaRodada(oportunidadeId, rodada.id_pre_analise))
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível abrir esta pré-análise.', 'error')
    }
  }

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')

    const [resultado, equipe] = await Promise.allSettled([
      obterPreAnalise(oportunidadeId),
      podeExecutar ? obterEquipePotencial(oportunidadeId) : Promise.resolve(null),
    ])

    setSemEquipe(
      (equipe.status === 'rejected' && equipe.reason?.data?.codigo === CODIGO_SEM_EQUIPE) ||
        (equipe.status === 'fulfilled' &&
          Boolean(equipe.value) &&
          !(equipe.value.membros || []).some((membro) => membro.incluido)),
    )

    if (resultado.status === 'fulfilled') {
      setAnalise(resultado.value)
      setSemAnalise(false)
      setSemProposta(false)
    } else {
      const codigo = resultado.reason?.data?.codigo
      setAnalise(null)
      setSemAnalise(codigo === CODIGO_SEM_ANALISE)
      setSemProposta(codigo === CODIGO_SEM_PROPOSTA)

      if (codigo !== CODIGO_SEM_ANALISE && codigo !== CODIGO_SEM_PROPOSTA) {
        setErroCarga(resultado.reason?.message || 'Não foi possível carregar a pré-análise.')
      }
    }

    setCarregando(false)
  }, [oportunidadeId, podeExecutar])

  useEffect(() => {
    carregar()
  }, [carregar])

  const emAndamento = Boolean(
    analise && STATUS_EM_ANDAMENTO.includes(analise.status),
  )

  useEffect(() => {
    if (!emAndamento) return undefined

    const relogio = setInterval(() => carregar({ silencioso: true }), 3000)

    return () => clearInterval(relogio)
  }, [emAndamento, carregar])

  useEffect(() => {
    aoOcupar?.(ocupado === 'executar')
  }, [ocupado, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  const executar = async () => {
    setOcupado('executar')

    try {
      const resultado = await executarPreAnalise(oportunidadeId)
      setAnalise(resultado)
      setSemAnalise(false)

      if (STATUS_EM_ANDAMENTO.includes(resultado.status)) {
        showToast('Pré-análise enviada. A tela atualiza sozinha.')
      } else if (resultado.status === 'ok') {
        showToast('Pré-análise concluída.')
      }
    } catch (falha) {
      showToast(
        falha?.data?.codigo === CODIGO_SEM_CRITERIOS
          ? falha.data.detail
          : falha?.message || 'A pré-análise não foi executada.',
        'error',
      )
    } finally {
      setOcupado('')
    }
  }

  const alternarRecomendacao = async (recomendacao) => {
    setOcupado('recomendacao')

    try {
      await acatarRecomendacao(
        oportunidadeId,
        recomendacao.id_recomendacao,
        !recomendacao.acatada,
      )
      await carregar({ silencioso: true })
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível atualizar a recomendação.', 'error')
    } finally {
      setOcupado('')
    }
  }

  const espera = ocupado === 'executar' ? (
    <EsperaIA titulo="A pré-análise está lendo a proposta e a equipe potencial." />
  ) : null

  const esperaDaFila = emAndamento ? (
    <EsperaIA
      key={analise.id_pre_analise}
      desde={analise.executada_em}
      titulo={
        analise.status === 'pendente'
          ? 'A pré-análise está na fila para começar.'
          : 'A pré-análise está em andamento.'
      }
      detalhe="A tela atualiza sozinha; você pode continuar em outra aba."
    />
  ) : null

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando a pré-análise...
        </p>
      </section>
    )
  }

  if (erroCarga) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => carregar()}
        >
          Tentar de novo
        </button>
      </section>
    )
  }

  if (semProposta) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Pré-análise de maturidade</h2>
            <p className="perfil-card__description">
              A pré-análise lê a proposta estruturada e a equipe potencial.
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <EtapaEncerrada situacao={situacao} irPara={irPara} />
          <p className="oportunidade-page__vazio">
            {encerrada
              ? 'A proposta estruturada não foi iniciada antes da decisão.'
              : 'Esta oportunidade ainda não tem proposta estruturada.'}
          </p>
          {podeExecutar ? (
            <ProximoPasso
              etapa="copiloto"
              irPara={irPara}
              texto="Comece pela proposta: peça uma primeira versão ao Copiloto e revise o texto."
            />
          ) : null}
        </div>
      </section>
    )
  }

  if (semAnalise) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Pré-análise de maturidade</h2>
            <p className="perfil-card__description">
              Leitura orientativa da proposta frente aos critérios de referência
              do PIPE/FAPESP: aponta o que está consolidado, o que é frágil e o
              que melhorar.
            </p>
          </div>

          {podeExecutar ? (
            <button
              type="button"
              className="admin-btn"
              onClick={executar}
              disabled={
                Boolean(ocupado) || semEquipe || propostaPendente || emAndamento
              }
            >
              <Icone icon={appIcons.researcher} />
              {ocupado === 'executar' ? 'Analisando...' : 'Executar pré-análise'}
            </button>
          ) : null}
        </header>

        <div className="perfil-card__body preanalise__corpo">
          <EtapaEncerrada situacao={situacao} irPara={irPara} />
          {espera}
          {podeExecutar && semEquipe ? <AvisoSemEquipe irPara={irPara} /> : null}

          <AvisoPropostaNaoRevisada
            oportunidadeId={oportunidadeId}
            irPara={irPara}
            aoVerificar={setPropostaPendente}
            podeRevisar={podeExecutar}
            encerrada={encerrada}
          />
          <p className="oportunidade-page__vazio">
            {podeExecutar
              ? 'Nenhuma pré-análise foi executada ainda.'
              : encerrada
                ? 'Nenhuma pré-análise foi executada antes da decisão.'
                : 'O Supervisor ainda não executou a pré-análise desta oportunidade.'}
          </p>
        </div>

        <AdminToast toast={toast} />
      </section>
    )
  }

  const falhou = analise?.status === 'erro'
  const concluida = analise?.status === 'ok'
  const dimensoes = analise.dimensoes || []
  const lacunas = analise.lacunas || []
  const recomendacoes = analise.recomendacoes || []
  const data = formatarData(analise.executada_em)
  const executor = analise.executada_por_nome || analise.executada_por

  return (
    <section className="perfil-card preanalise">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Pré-análise de maturidade</h2>
          <p className="perfil-card__description">
            Leitura da proposta frente aos critérios de referência do PIPE/FAPESP.
          </p>
        </div>

        {podeExecutar || (ehSupervisor && concluida) ? (
          <div className="preanalise__acoes">
            {concluida ? (
              <Link
                className="admin-btn admin-btn--outline"
                to={`/oportunidades/${oportunidadeId}/relatorio/pre-analise`}
              >
                <Icone icon={appIcons.view} />
                Relatório da pré-análise
              </Link>
            ) : null}

            {podeExecutar ? (
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={executar}
                disabled={
                  Boolean(ocupado) || semEquipe || propostaPendente || emAndamento
                }
              >
                <Icone icon={appIcons.reset} />
                {ocupado === 'executar' ? 'Analisando...' : 'Reavaliar'}
              </button>
            ) : null}
          </div>
        ) : (
          <span
            className="perfil-card__lock"
            title={
              encerrada
                ? 'A oportunidade foi encerrada: a pré-análise fica como estava na decisão.'
                : 'Executar a pré-análise é do Supervisor.'
            }
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        )}
      </header>

      <div className="perfil-card__body preanalise__corpo">
        <EtapaEncerrada situacao={situacao} irPara={irPara} />

        <div className="admin-callout" role="note">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">{analise.aviso}</p>
        </div>

        {espera}
        {esperaDaFila}

        {podeExecutar && semEquipe ? <AvisoSemEquipe irPara={irPara} /> : null}

        <AvisoPropostaNaoRevisada
          oportunidadeId={oportunidadeId}
          irPara={irPara}
          aoVerificar={setPropostaPendente}
          podeRevisar={podeExecutar}
          encerrada={encerrada}
        />

        {falhou ? (
          <div className="admin-callout admin-callout--alerta" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              A última execução não produziu resultado
              {MOTIVOS_DE_FALHA_DA_PREANALISE[analise.erro]
                ? `: ${MOTIVOS_DE_FALHA_DA_PREANALISE[analise.erro]}`
                : ''}.
              {encerrada ? '' : proximoPasso(analise.erro)}
            </p>
          </div>
        ) : null}

        {falhou && ultimaValida ? <UltimoResultadoValido analise={ultimaValida} /> : null}

        {analise.sintese || dimensoes.length > 0 ? (
          <div className="preanalise__abertura">
            <h3 className="preanalise__subtitulo">Em resumo</h3>
            {analise.sintese ? (
              <p className="preanalise__sintese">{analise.sintese}</p>
            ) : null}
            <Resumo dimensoes={dimensoes} />
          </div>
        ) : null}

        {analise.comparacao ? <Comparacao comparacao={analise.comparacao} versaoAtual={analise.versao_criterios} /> : null}

        <Resultado
          dimensoes={dimensoes}
          lacunas={lacunas}
          recomendacoes={recomendacoes}
          podeExecutar={podeExecutar}
          ocupado={ocupado}
          aoAlternar={alternarRecomendacao}
        />

        <p className="preanalise__versoes">
          Critérios {analise.versao_criterios} · proposta na versão {analise.versao_proposta}
          {data ? ` · executada em ${data}` : ''}
          {executor ? ` por ${executor}` : ''}
        </p>

        <HistoricoDePreAnalises rodadas={rodadas} aoVer={verRodada} />

        {concluida && podeExecutar ? (
          <BarraDeAcoes estado="Depois de acatar as recomendações que fizerem sentido, registre a decisão sobre a oportunidade.">
            <ContinuarPara etapa="decisao" irPara={irPara} />
          </BarraDeAcoes>
        ) : null}
      </div>

      {rodadaAberta ? (
        <RodadaAnterior analise={rodadaAberta} onFechar={() => setRodadaAberta(null)} />
      ) : null}

      <AdminToast toast={toast} />
    </section>
  )
}
