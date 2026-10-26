import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import VerDetalhes from '../../../../components/console/VerDetalhes'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { LIMITES_DE_GASTO, MOTIVOS_SEM_IA } from '../../../../lib/glossario'
import { Icone, appIcons } from '../../../../lib/icons'
import {
  ROTULOS_DAS_DIMENSOES,
  agruparPorLacuna,
  rotuloDoCriterio,
} from '../../../../lib/lacunas'
import { ROLES } from '../../../../lib/roles'
import {
  acatarRecomendacao,
  executarPreAnalise,
  obterEquipePotencial,
  obterPreAnalise,
} from '../../../../services/pdConnectApi'
import EsperaIA from './EsperaIA'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import ProximoPasso from './ProximoPasso'
import '../OportunidadesPage.scss'

const CODIGO_SEM_ANALISE = 'preanalise_inexistente'
const CODIGO_SEM_PROPOSTA = 'proposta_inexistente'
const CODIGO_SEM_CRITERIOS = 'criterios_ausentes'
const CODIGO_SEM_EQUIPE = 'equipe_inexistente'

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

const MOTIVOS_DE_FALHA = {
  provedor_indisponivel: 'o serviço de IA não respondeu',
  limite_da_oportunidade: MOTIVOS_SEM_IA.limite_da_oportunidade,
  limite_do_mes: MOTIVOS_SEM_IA.limite_do_mes,
  saida_invalida: 'a resposta da IA veio incompleta',
  sem_dimensoes: 'a IA não avaliou nenhuma dimensão',
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

function Dimensao({ dimensao, lacunas }) {
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

      <p className="preanalise__avaliacao">{frase}</p>

      {lacunas.length > 0 ? (
        <p className="preanalise__dimensao-lacunas">
          {lacunasPorExtenso(lacunas.length)} em O que melhorar
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
    </div>
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

function OQueMelhorar({ lacunas, recomendacoes, ...acoes }) {
  const { grupos, soltas } = agruparPorLacuna(lacunas, recomendacoes)
  const acatadas = recomendacoes.filter((item) => item.acatada).length

  if (grupos.length === 0 && soltas.length === 0) return null

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

      {grupos.length > 0 ? (
        <ul className="preanalise__grupos">
          {grupos.map(({ lacuna, recomendacoes: daLacuna }) => (
            <li key={lacuna.id_lacuna} className="preanalise__grupo">
              <div className="preanalise__grupo-cabeca">
                {ROTULOS_DAS_DIMENSOES[lacuna.campo_afetado] ? (
                  <span className="preanalise__grupo-dimensao">
                    {ROTULOS_DAS_DIMENSOES[lacuna.campo_afetado]}
                  </span>
                ) : null}
                <span
                  className={`preanalise__criterio${
                    lacuna.criterio_codigo ? '' : ' preanalise__criterio--sem-evidencia'
                  }`}
                >
                  {rotuloDoCriterio(lacuna)}
                </span>
              </div>

              <p className="preanalise__grupo-lacuna">{lacuna.descricao}</p>

              {daLacuna.length > 0 ? <Recomendacoes itens={daLacuna} {...acoes} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {soltas.length > 0 ? (
        <>
          <p className="preanalise__rotulo">Outras recomendações</p>
          <Recomendacoes itens={soltas} {...acoes} />
        </>
      ) : null}
    </div>
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

export default function AbaPreAnalise({ oportunidadeId, aoOcupar, irPara }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const podeExecutar = user?.role === ROLES.SUPERVISOR

  const [analise, setAnalise] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [semAnalise, setSemAnalise] = useState(false)
  const [semProposta, setSemProposta] = useState(false)
  const [semEquipe, setSemEquipe] = useState(false)
  const [propostaPendente, setPropostaPendente] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [ocupado, setOcupado] = useState('')

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

      if (resultado.status === 'ok') {
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
          <p className="oportunidade-page__vazio">
            Esta oportunidade ainda não tem proposta estruturada.
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
              disabled={Boolean(ocupado) || semEquipe || propostaPendente}
            >
              <Icone icon={appIcons.researcher} />
              {ocupado === 'executar' ? 'Analisando...' : 'Executar pré-análise'}
            </button>
          ) : null}
        </header>

        <div className="perfil-card__body preanalise__corpo">
          {espera}
          {podeExecutar && semEquipe ? <AvisoSemEquipe irPara={irPara} /> : null}

          <AvisoPropostaNaoRevisada
            oportunidadeId={oportunidadeId}
            irPara={irPara}
            aoVerificar={setPropostaPendente}
          />
          <p className="oportunidade-page__vazio">
            {podeExecutar
              ? 'Nenhuma pré-análise foi executada ainda.'
              : 'O Supervisor ainda não executou a pré-análise desta oportunidade.'}
          </p>
        </div>

        <AdminToast toast={toast} />
      </section>
    )
  }

  const falhou = analise?.status !== 'ok'
  const dimensoes = analise.dimensoes || []
  const lacunas = analise.lacunas || []
  const recomendacoes = analise.recomendacoes || []
  const data = formatarData(analise.executada_em)

  return (
    <section className="perfil-card preanalise">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Pré-análise de maturidade</h2>
          <p className="perfil-card__description">
            Leitura da proposta frente aos critérios de referência do PIPE/FAPESP.
          </p>
        </div>

        {podeExecutar ? (
          <div className="preanalise__acoes">
            <Link
              className="admin-btn admin-btn--outline"
              to={`/oportunidades/${oportunidadeId}/relatorio/pre-analise`}
            >
              <Icone icon={appIcons.export} />
              Gerar relatório
            </Link>

            <button
              type="button"
              className="admin-btn"
              onClick={executar}
              disabled={Boolean(ocupado) || semEquipe || propostaPendente}
            >
              <Icone icon={appIcons.reset} />
              {ocupado === 'executar' ? 'Analisando...' : 'Reavaliar'}
            </button>
          </div>
        ) : (
          <span
            className="perfil-card__lock"
            title="Executar a pré-análise é do Supervisor."
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        )}
      </header>

      <div className="perfil-card__body preanalise__corpo">
        <div className="admin-callout" role="note">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">{analise.aviso}</p>
        </div>

        {espera}

        {podeExecutar && semEquipe ? <AvisoSemEquipe irPara={irPara} /> : null}

        {podeExecutar ? (
          <AvisoPropostaNaoRevisada
            oportunidadeId={oportunidadeId}
            irPara={irPara}
            aoVerificar={setPropostaPendente}
          />
        ) : null}

        {falhou ? (
          <div className="admin-callout admin-callout--alerta" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">
              A última execução não produziu resultado
              {MOTIVOS_DE_FALHA[analise.erro] ? `: ${MOTIVOS_DE_FALHA[analise.erro]}` : ''}.
              {LIMITES_DE_GASTO.includes(analise.erro) ? '' : ' Tente reavaliar em alguns minutos.'}
            </p>
          </div>
        ) : null}

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

        {dimensoes.length > 0 ? (
          <div className="preanalise__bloco">
            <h3 className="preanalise__subtitulo">Dimensões avaliadas</h3>
            <ul className="preanalise__dimensoes">
              {dimensoes.map((dimensao) => (
                <Dimensao
                  key={dimensao.id_dimensao}
                  dimensao={dimensao}
                  lacunas={lacunas.filter(
                    (lacuna) => lacuna.campo_afetado === dimensao.dimensao,
                  )}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <OQueMelhorar
          lacunas={lacunas}
          recomendacoes={recomendacoes}
          podeExecutar={podeExecutar}
          ocupado={ocupado}
          aoAlternar={alternarRecomendacao}
        />

        {!falhou && podeExecutar ? (
          <ProximoPasso
            etapa="decisao"
            irPara={irPara}
            texto="Depois de acatar as recomendações que fizerem sentido, registre a decisão sobre a oportunidade."
          />
        ) : null}

        <p className="preanalise__versoes">
          Critérios {analise.versao_criterios} · proposta na versão {analise.versao_proposta}
          {data ? ` · executada em ${data}` : ''}
          {analise.executada_por ? ` por ${analise.executada_por}` : ''}
        </p>
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
