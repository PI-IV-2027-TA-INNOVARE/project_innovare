import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminModal from '../../../../components/console/AdminModal'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  adicionarMembroEquipe,
  ajustarMembroEquipe,
  executarMatching,
  listarRede,
  obterEquipePotencial,
  validarEquipe,
} from '../../../../services/pdConnectApi'
import EsperaIA from './EsperaIA'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import ProximoPasso from './ProximoPasso'
import '../OportunidadesPage.scss'

const CODIGO_SEM_EQUIPE = 'equipe_inexistente'

const ROTULOS_DAS_FEATURES = {
  semantico: 'Semelhança de conteúdo',
  lexical: 'Termos em comum',
  area: 'Área de atuação',
  disponibilidade: 'Disponibilidade',
}

const plural = (total, singular, varios) => `${total} ${total === 1 ? singular : varios}`

function comoFoiCalculado(execucao) {
  if (execucao.fallback_usado) {
    return 'Sugestões calculadas por termos em comum, área de atuação e disponibilidade. A comparação por semelhança de conteúdo não estava disponível nesta rodada.'
  }

  return `Sugestões calculadas por semelhança de conteúdo, termos em comum, área de atuação e disponibilidade.${execucao.usou_rerank ? ' A ordem foi revisada pela IA.' : ''}`
}

function porcentagem(valor) {
  if (valor === null || valor === undefined) return '—'

  return `${Math.round(Number(valor) * 100)}%`
}

function Features({ features }) {
  const chaves = Object.keys(ROTULOS_DAS_FEATURES).filter((chave) => chave in features)

  if (chaves.length === 0) return null

  return (
    <dl className="equipe__features">
      {chaves.map((chave) => (
        <div key={chave} className="equipe__feature">
          <dt>{ROTULOS_DAS_FEATURES[chave]}</dt>
          <dd>
            {features[chave] === null ? 'indisponível' : porcentagem(features[chave])}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Indicacao({ membro, podeAjustar, onAjustar, ocupado }) {
  return (
    <li className={`equipe__membro${membro.incluido ? '' : ' equipe__membro--fora'}`}>
      <div className="equipe__cabeca">
        <div>
          <p className="equipe__nome">{membro.nome}</p>
          <p className="equipe__meta">
            {membro.papel_rotulo}
            {membro.titulacao ? ` · ${membro.titulacao}` : ''} ·{' '}
            {membro.disponibilidade} · {membro.origem_rotulo}
            {membro.validada ? ' · validada' : ''}
          </p>
        </div>

        <div className="equipe__score">
          <span className="equipe__score-valor">
            {porcentagem(membro.score_compatibilidade)}
          </span>
          <span className="equipe__score-rotulo">compatibilidade</span>
        </div>
      </div>

      {membro.match_reasons?.length > 0 ? (
        <ul className="equipe__motivos">
          {membro.match_reasons.map((motivo, indice) => (
            <li key={`${membro.id_membro_equipe}-${indice}`}>{motivo}</li>
          ))}
        </ul>
      ) : null}

      <Features features={membro.score_features || {}} />

      {podeAjustar ? (
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--outline"
          onClick={() => onAjustar(membro, { incluido: !membro.incluido })}
          disabled={ocupado}
        >
          <Icone icon={membro.incluido ? appIcons.deactivate : appIcons.activate} />
          {membro.incluido ? 'Tirar da equipe' : 'Recolocar na equipe'}
        </button>
      ) : null}
    </li>
  )
}

export default function AbaEquipe({ oportunidadeId, aoOcupar, irPara }) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const podeConduzir = user?.role === ROLES.SUPERVISOR

  const [equipe, setEquipe] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [semEquipe, setSemEquipe] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [confirmarRodada, setConfirmarRodada] = useState(false)
  const [rede, setRede] = useState([])
  const [escolhido, setEscolhido] = useState('')

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')
    setSemEquipe(false)

    try {
      setEquipe(await obterEquipePotencial(oportunidadeId))
    } catch (falha) {
      if (falha?.data?.codigo === CODIGO_SEM_EQUIPE) {
        setEquipe(null)
        setSemEquipe(true)
      } else {
        setErroCarga(falha?.message || 'Não foi possível carregar a equipe.')
      }
    } finally {
      setCarregando(false)
    }
  }, [oportunidadeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    aoOcupar?.(rodando)
  }, [rodando, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  useEffect(() => {
    if (!podeConduzir) return

    listarRede({ page_size: 100 })
      .then((pagina) => setRede(pagina?.results || []))
      .catch(() => setRede([]))
  }, [podeConduzir])

  const executar = async (acao, mensagem) => {
    setOcupado(true)

    try {
      const resultado = await acao()
      await carregar({ silencioso: true })
      showToast(typeof mensagem === 'function' ? mensagem(resultado) : mensagem)
    } catch (falha) {
      showToast(falha?.message || 'A operação não foi concluída.', 'error')
    } finally {
      setOcupado(false)
    }
  }

  const rodar = async () => {
    setConfirmarRodada(false)
    setRodando(true)

    await executar(
      () => executarMatching(oportunidadeId),
      (resultado) =>
        `Matching concluído: ${plural(resultado.equipe.membros.length, 'sugestão', 'sugestões')} entre ${plural(resultado.avaliados, 'perfil', 'perfis')} da rede.`,
    )

    setRodando(false)
  }

  const ajustar = (membro, dados) =>
    executar(
      () => ajustarMembroEquipe(oportunidadeId, membro.id_membro_equipe, dados),
      'Composição ajustada.',
    )

  const incluir = async (evento) => {
    evento.preventDefault()

    if (!escolhido) return

    const pessoa = rede.find((item) => String(item.id_membro) === String(escolhido))

    await executar(
      () =>
        adicionarMembroEquipe(oportunidadeId, {
          id_membro: Number(escolhido),
          papel: pessoa?.papel_rede || 'pesquisador',
        }),
      'Pessoa incluída na equipe potencial.',
    )
    setEscolhido('')
  }

  const validar = () =>
    executar(
      () => validarEquipe(oportunidadeId),
      'Equipe potencial validada. Nenhum convite foi enviado.',
    )

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando a equipe potencial...
        </p>
      </section>
    )
  }

  if (erroCarga) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
          Tentar de novo
        </button>
      </section>
    )
  }

  if (semEquipe) {
    return (
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Equipe potencial</h2>
            <p className="perfil-card__description">
              A composição é sugerida a partir das competências necessárias e da
              rede interna da AC2.
            </p>
          </div>

          {podeConduzir ? (
            <button
              type="button"
              className="admin-btn"
              onClick={rodar}
              disabled={ocupado}
            >
              <Icone icon={appIcons.users} />
              {rodando ? 'Rodando...' : 'Rodar matching'}
            </button>
          ) : null}
        </header>

        <div className="perfil-card__body equipe__corpo">
        <AvisoPropostaNaoRevisada oportunidadeId={oportunidadeId} irPara={irPara} />

          <AvisoPropostaNaoRevisada oportunidadeId={oportunidadeId} irPara={irPara} />

          {rodando ? (
            <EsperaIA
              titulo="Comparando as competências necessárias com a rede interna."
              detalhe="Leva alguns segundos. Não feche esta aba."
            />
          ) : null}
          <p className="oportunidade-page__vazio">
            {podeConduzir
              ? 'Nenhum matching foi rodado nesta oportunidade. O matching compara as competências necessárias com os perfis da rede interna.'
              : 'O Supervisor ainda não rodou o matching desta oportunidade.'}
          </p>
        </div>

        <AdminToast toast={toast} />
      </section>
    )
  }

  const execucao = equipe?.execucao || null
  const incluidos = (equipe?.membros || []).filter((membro) => membro.incluido)

  return (
    <section className="perfil-card equipe">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Equipe potencial</h2>
          <p className="perfil-card__description">
            Sugestão para o Supervisor validar ou ajustar. Não há convite, aceite
            nem recusa: ninguém é convocado por esta tela.
          </p>
          {execucao ? (
            <p className="equipe__execucao">{comoFoiCalculado(execucao)}</p>
          ) : null}
        </div>

        {podeConduzir ? (
          <div className="equipe__acoes">
            <Link
              className="admin-btn admin-btn--outline"
              to={`/oportunidades/${oportunidadeId}/relatorio/equipe`}
            >
              <Icone icon={appIcons.export} />
              Gerar relatório
            </Link>

            <button
              type="button"
              className="admin-btn admin-btn--outline"
              onClick={() => setConfirmarRodada(true)}
              disabled={ocupado}
            >
              <Icone icon={appIcons.reset} />
              {rodando ? 'Rodando...' : 'Rodar de novo'}
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={validar}
              disabled={ocupado || incluidos.length === 0}
            >
              <Icone icon={appIcons.done} />
              Validar equipe
            </button>
          </div>
        ) : (
          <span
            className="perfil-card__lock"
            title="Validar e ajustar a equipe é do Supervisor."
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        )}
      </header>

      <div className="perfil-card__body equipe__corpo">
        {rodando ? (
          <EsperaIA
            titulo="Comparando as competências necessárias com a rede interna."
            detalhe="Leva alguns segundos. Não feche esta aba."
          />
        ) : null}

        {podeConduzir && incluidos.length > 0 && incluidos.every((membro) => membro.validada) ? (
          <ProximoPasso etapa="pre-analise" irPara={irPara} />
        ) : null}

        {(equipe?.membros || []).length === 0 ? (
          <p className="oportunidade-page__vazio">
            Nenhum perfil alcançou o score mínimo configurado. As lacunas abaixo
            dizem quais competências ficaram sem cobertura.
          </p>
        ) : (
          <ul className="equipe__lista">
            {equipe.membros.map((membro) => (
              <Indicacao
                key={membro.id_membro_equipe}
                membro={membro}
                podeAjustar={podeConduzir}
                onAjustar={ajustar}
                ocupado={ocupado}
              />
            ))}
          </ul>
        )}

        {(equipe?.lacunas || []).length > 0 ? (
          <div className="equipe__lacunas">
            <h3 className="equipe__subtitulo">Lacunas de competência da equipe</h3>
            <ul className="equipe__lista-lacunas">
              {equipe.lacunas.map((lacuna) => (
                <li key={lacuna.id_lacuna_equipe}>{lacuna.descricao}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {podeConduzir ? (
          <form className="equipe__forma" onSubmit={incluir}>
            <label className="admin-field">
              <span className="admin-field__label">Incluir alguém da rede</span>
              <select
                className="admin-input"
                value={escolhido}
                onChange={(evento) => setEscolhido(evento.target.value)}
              >
                <option value="">Selecione uma pessoa</option>
                {rede.map((pessoa) => (
                  <option key={pessoa.id_membro} value={pessoa.id_membro}>
                    {pessoa.nome}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="admin-btn admin-btn--outline"
              disabled={!escolhido || ocupado}
            >
              <Icone icon={appIcons.addUser} />
              Incluir
            </button>
          </form>
        ) : null}
      </div>

      {confirmarRodada ? (
        <AdminModal
          title="Rodar o matching de novo?"
          description="Uma nova equipe será sugerida a partir das competências atuais. Os ajustes feitos nesta equipe (pessoas tiradas, incluídas e a validação) não passam para a nova."
          onClose={() => setConfirmarRodada(false)}
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setConfirmarRodada(false)}
              >
                Cancelar
              </button>
              <button type="button" className="admin-btn" onClick={rodar}>
                Rodar de novo
              </button>
            </>
          }
        />
      ) : null}

      <AdminToast toast={toast} />
    </section>
  )
}
