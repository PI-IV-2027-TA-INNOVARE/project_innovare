import { useCallback, useEffect, useState } from 'react'
import {
  obterIndicadores,
  obterIndicadoresDeIA,
} from '../../../services/pdConnectApi'
import { useAtualizarAoFocar } from '../../../lib/atualizarAoFocar'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { ROLES } from '../../../lib/roles'
import './IndicadoresPage.scss'

function Bloco({ titulo, descricao, total, grupos, icon }) {
  const id = `bloco-${titulo.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <section className="perfil-card" role="region" aria-labelledby={id}>
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title" id={id}>
            {icon && <Icone icon={icon} className="perfil-card__icon" aria-hidden="true" />}
            {titulo}
          </h2>
          <p className="perfil-card__description">{descricao}</p>
        </div>
        {total === null || total === undefined ? null : (
          <div className="perfil-card__total">{total}</div>
        )}
      </header>

      {grupos.map((grupo) => (
        <div className="indicador-grupo" key={grupo.titulo}>
          <h3 className="indicador-grupo__titulo">{grupo.titulo}</h3>

          <ul className="indicador-grupo__lista">
            {grupo.itens.map((item) => (
              <li
                key={item.valor}
                className="indicador-item"
                role="listitem"
                aria-label={item.rotulo || item.valor}
              >
                <span className="indicador-item__rotulo">{item.rotulo || item.valor}</span>
                <span className="indicador-item__total">
                  {item.total === null || item.total === undefined ? '—' : item.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function medida(rotulo, total) {
  return { valor: rotulo, rotulo, total }
}

function emPorcento(valor) {
  return valor === null || valor === undefined ? null : `${valor}%`
}

function BlocoSemRodada({ id, titulo, icon, texto }) {
  return (
    <Bloco
      titulo={titulo}
      descricao={texto}
      total={null}
      grupos={[]}
      icon={icon}
      key={id}
    />
  )
}

function BlocoMatching({ dados }) {
  if (!dados.houve_rodada) {
    return (
      <BlocoSemRodada
        id="matching"
        titulo="Matching"
        icon={appIcons.users}
        texto="Nenhuma rodada de matching foi executada ainda. Os números aparecem depois da primeira — hoje é ausência de rodada, não resultado zero."
      />
    )
  }

  return (
    <Bloco
      titulo="Matching"
      descricao="Quanto das competências demandadas a rede interna cobre."
      total={emPorcento(dados.cobertura_percentual)}
      icon={appIcons.users}
      grupos={[
        {
          titulo: 'Competências',
          itens: [
            medida('Demandadas', dados.competencias_demandadas),
            medida('Essenciais', dados.competencias_essenciais),
            medida('Cobertas pela equipe sugerida', dados.competencias_cobertas),
            medida('Com lacuna', dados.competencias_com_lacuna),
            medida('No vocabulário da rede', dados.competencias_no_vocabulario),
          ],
        },
        {
          titulo: 'Indicações',
          itens: [
            medida('Sugeridas pelo matching', dados.indicacoes_sugeridas),
            medida('Incluídas pelo Supervisor', dados.indicacoes_manuais),
            medida('Na composição atual', dados.indicacoes_incluidas),
            medida('Validadas', dados.indicacoes_validadas),
            medida(
              'Compatibilidade média',
              dados.score_medio === null
                ? null
                : `${Math.round(dados.score_medio * 100)}%`,
            ),
          ],
        },
        {
          titulo: 'Rodadas',
          itens: [
            medida('Executadas', dados.execucoes),
            medida('Concluídas', dados.execucoes_concluidas),
            medida('Sem base semântica', dados.execucoes_sem_base_semantica),
            medida('Com rerank', dados.execucoes_com_rerank),
            medida('Equipes geradas', dados.equipes_geradas),
          ],
        },
        {
          titulo: 'Disponibilidade da rede',
          itens: dados.rede.por_disponibilidade,
        },
      ]}
    />
  )
}

function BlocoMaturidade({ dados }) {
  if (!dados.houve_execucao) {
    return (
      <BlocoSemRodada
        id="maturidade"
        titulo="Maturidade"
        icon={appIcons.researcher}
        texto="Nenhuma pré-análise foi executada ainda. Os números aparecem depois da primeira."
      />
    )
  }

  const criterios = dados.versao_criterios
    ? ` Critérios ${dados.versao_criterios}.`
    : ''

  return (
    <Bloco
      titulo="Maturidade"
      descricao={`Nível por dimensão nas pré-análises executadas. Orientativo — não é nota nem parecer.${criterios}`}
      total={dados.execucoes}
      icon={appIcons.researcher}
      grupos={[
        { titulo: 'Dimensões por nível', itens: dados.por_nivel },
        { titulo: 'Frágeis por dimensão', itens: dados.frageis_por_dimensao },
        {
          titulo: 'Lacunas e recomendações',
          itens: [
            medida('Lacunas apontadas', dados.lacunas),
            medida('Lacunas em aberto', dados.lacunas_abertas),
            medida('Recomendações', dados.recomendacoes),
            medida('Acatadas', dados.recomendacoes_acatadas),
            medida('Propostas analisadas', dados.propostas_analisadas),
            medida('Execuções sem resultado', dados.execucoes_com_erro),
          ],
        },
      ]}
    />
  )
}

export default function IndicadoresPage() {
  const { user } = useAuth()

  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ia, setIa] = useState(null)
  const [erroIa, setErroIa] = useState('')

  const ehSupervisor = user?.role === ROLES.SUPERVISOR

  const carregar = useCallback(() => {
    obterIndicadores()
      .then((resposta) => {
        setDados(resposta)
        setErro('')
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

  return (
    <div className="console indicadores-page">
      <header className="admin-section__header">
        <div className="admin-section__heading">
          <h1 className="admin-section__title">Indicadores</h1>
          <p className="admin-section__description">
            Os números do fluxo, no que você acompanha.
          </p>
        </div>
      </header>

      {semOportunidade ? (
        <p className="perfil-card__note">
          Nenhuma oportunidade no seu acompanhamento ainda. Os números aparecem
          assim que a primeira entrar no fluxo.
        </p>
      ) : (
        <div className="indicadores-grade">
          <Bloco
            titulo="Oportunidades"
            descricao="Onde estão e de onde vieram."
            total={dados.oportunidades.total}
            grupos={[
              { titulo: 'Por etapa', itens: dados.oportunidades.por_situacao },
              { titulo: 'Por origem', itens: dados.oportunidades.por_origem },
            ]}
            icon={appIcons.folder}
          />

          <Bloco
            titulo="Decisões"
            descricao="Encaminhamentos já registrados."
            total={dados.decisoes.total}
            grupos={[{ titulo: 'Por encaminhamento', itens: dados.decisoes.por_tipo }]}
            icon={appIcons.decision}
          />

          {dados.rede ? (
            <Bloco
              titulo="Rede interna"
              descricao="Quem está cadastrado."
              total={dados.rede.total}
              grupos={[{ titulo: 'Por papel', itens: dados.rede.por_papel }]}
              icon={appIcons.users}
            />
          ) : null}

          {ia ? <BlocoMatching dados={ia.matching} /> : null}
          {ia ? <BlocoMaturidade dados={ia.maturidade} /> : null}
        </div>
      )}

      {erroIa ? (
        <p className="admin-callout" role="alert">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          {erroIa}
        </p>
      ) : null}
    </div>
  )
}
