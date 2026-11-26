import { useEffect, useState } from 'react'
import AdminModal from '../../../../components/console/AdminModal'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { listarPreAnalises, obterProposta } from '../../../../services/pdConnectApi'
import { situacaoEncerrada } from '../etapas'
import { DECISOES, decisaoLabel } from '../oportunidadesData'
import AvisoPropostaNaoRevisada from './AvisoPropostaNaoRevisada'
import EtapaBloqueada from './EtapaBloqueada'
import ObservacoesDaAvaliacao from './ObservacoesDaAvaliacao'

function bloqueioDa(situacao) {
  if (situacao === 'aguardando_decisao') return null

  if (situacao === 'revisar') {
    return {
      motivo: 'A oportunidade voltou para revisão. Retome a proposta estruturada para seguir.',
      etapa: 'proposta',
    }
  }

  return {
    motivo: 'Continuar e Revisar ficam liberados quando a pré-análise termina.',
    etapa: 'pre-analise',
  }
}

const SEM_VOLTA = 'A decisão não pode ser refeita, e as etapas ficam só para leitura.'

const AVISO_SEM_JUSTIFICATIVA = 'A empresa demandante recebe um aviso por e-mail, sem a justificativa.'

const JUSTIFICATIVA_VAI_PARA_A_EMPRESA =
  'Este texto vai para a empresa demandante, na plataforma e por e-mail.'

function consequencias(tipo, comEmpresa) {
  if (tipo === 'revisar') {
    return [
      'A oportunidade volta para complementação ou correção antes de seguir.',
      comEmpresa ? JUSTIFICATIVA_VAI_PARA_A_EMPRESA : null,
    ].filter(Boolean)
  }

  return [
    tipo === 'continuar'
      ? 'A oportunidade segue como apta a avançar, e o fluxo dela termina aqui.'
      : 'A oportunidade sai do fluxo ativo, e o histórico é preservado.',
    SEM_VOLTA,
    comEmpresa ? AVISO_SEM_JUSTIFICATIVA : null,
  ].filter(Boolean)
}

const formatarData = (valor) => new Date(valor).toLocaleDateString('pt-BR')

function maisRecenteConcluida(rodadas) {
  return (rodadas || [])
    .filter((rodada) => rodada.status === 'ok')
    .sort((a, b) => Date.parse(b.executada_em) - Date.parse(a.executada_em))[0]
}

function AvisoPropostaMudou({ oportunidadeId, irPara }) {
  const [base, setBase] = useState(null)

  useEffect(() => {
    let ativo = true

    Promise.all([obterProposta(oportunidadeId), listarPreAnalises(oportunidadeId)])
      .then(([proposta, rodadas]) => {
        const valida = maisRecenteConcluida(rodadas)
        const salvaDepois =
          valida && Date.parse(proposta?.atualizado_em) > Date.parse(valida.executada_em)

        if (ativo) setBase(salvaDepois ? valida : null)
      })
      .catch(() => {
        if (ativo) setBase(null)
      })

    return () => {
      ativo = false
    }
  }, [oportunidadeId])

  if (!base) return null

  return (
    <div className="admin-callout admin-callout--alerta" role="note">
      <Icone icon={appIcons.warning} className="admin-callout__icon" />
      <p className="admin-callout__text">
        A proposta foi salva depois da pré-análise de {formatarData(base.executada_em)}, que
        leu o texto anterior. Reavalie antes de decidir, para a decisão se apoiar na proposta
        atual.
      </p>
      {irPara ? (
        <button
          type="button"
          className="admin-btn admin-btn--sm admin-btn--outline"
          onClick={() => irPara('pre-analise')}
        >
          Ir para Pré-análise
        </button>
      ) : null}
    </div>
  )
}

function DecisaoRegistrada({ decisao, titulo, aviso = null }) {
  return (
    <section className="perfil-card oportunidade-decisao">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
          <p className="perfil-card__description">
            Encaminhamento humano da oportunidade — preservado no histórico.
          </p>
        </div>

        <span className={`decisao-selo decisao-selo--${decisao.tipo}`}>
          {decisaoLabel(decisao.tipo)}
        </span>
      </header>

      <div className="perfil-card__body">
        {aviso}

        <blockquote className="oportunidade-justificativa">
          {decisao.justificativa}
        </blockquote>

        <p className="oportunidade-bloco__nota">
          Registrada por <strong>{decisao.autor}</strong> ·{' '}
          {formatarUltimoAcesso(decisao.em)}
        </p>
      </div>
    </section>
  )
}

export default function AbaDecisao({
  oportunidadeId,
  decisao,
  situacao,
  podeDecidir,
  onRegistrar,
  irPara,
  observacoes = [],
  aoRegistrarObservacao,
  comEmpresa = true,
}) {
  const [tipo, setTipo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const encerrada = situacaoEncerrada(situacao)

  const observacoesDaAvaliacao = podeDecidir ? (
    <ObservacoesDaAvaliacao
      codigo={oportunidadeId}
      observacoes={observacoes}
      aoRegistrar={aoRegistrarObservacao}
    />
  ) : null

  const aviso = (
    <AvisoPropostaNaoRevisada
      oportunidadeId={oportunidadeId}
      irPara={irPara}
      podeRevisar={podeDecidir}
      bloqueiaEtapa={false}
      encerrada={encerrada}
    />
  )

  if (decisao && (!podeDecidir || encerrada)) {
    return (
      <>
        <DecisaoRegistrada decisao={decisao} titulo="Decisão registrada" aviso={aviso} />
        {observacoesDaAvaliacao}
      </>
    )
  }

  if (!podeDecidir) {
    return (
      <section className="perfil-card oportunidade-decisao">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Aguardando decisão</h2>
            <p className="perfil-card__description">
              O encaminhamento é registrado pelo Supervisor. Você acompanha o
              resultado por aqui.
            </p>
          </div>
        </header>

        {aviso}
      </section>
    )
  }

  const bloqueio = bloqueioDa(situacao)
  const liberada = (opcao) => opcao.id === 'arquivar' || !bloqueio

  const enviar = (event) => {
    event.preventDefault()

    if (!tipo) {
      setErro('Escolha o encaminhamento.')
      return
    }

    if (justificativa.trim().length < 10) {
      setErro('Descreva o motivo — é o que o histórico preserva.')
      return
    }

    setConfirmando(true)
  }

  const confirmar = () => {
    setConfirmando(false)
    onRegistrar(tipo, justificativa.trim())
  }

  const opcaoEscolhida = DECISOES.find((opcao) => opcao.id === tipo)

  return (
    <>
      {decisao ? <DecisaoRegistrada decisao={decisao} titulo="Última decisão" /> : null}

      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Registrar decisão</h2>
            <p className="perfil-card__description">
              A decisão é sua e fica no histórico. A plataforma não decide, e a IA
              tampouco — ela apenas estruturou, sugeriu e apontou lacunas.
            </p>
          </div>
        </header>

        <form className="perfil-card__body" onSubmit={enviar} noValidate>
          {aviso}

          {situacao === 'aguardando_decisao' ? (
            <AvisoPropostaMudou oportunidadeId={oportunidadeId} irPara={irPara} />
          ) : null}

          {bloqueio ? (
            <EtapaBloqueada motivo={bloqueio.motivo} etapa={bloqueio.etapa} irPara={irPara} />
          ) : null}

          <fieldset className="decisao-opcoes">
            <legend className="admin-field__label">Encaminhamento</legend>

            {DECISOES.map((opcao) => (
              <label
                key={opcao.id}
                className={`decisao-opcao decisao-opcao--${opcao.tom}${tipo === opcao.id ? ' is-selected' : ''}${liberada(opcao) ? '' : ' is-disabled'}`}
              >
                <input
                  type="radio"
                  name="decisao"
                  value={opcao.id}
                  checked={tipo === opcao.id}
                  disabled={!liberada(opcao)}
                  onChange={() => {
                    setTipo(opcao.id)
                    setErro('')
                  }}
                />
                <span className="decisao-opcao__texto">
                  <strong>{opcao.label}</strong>
                  <span>{opcao.descricao}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="admin-field">
            <span className="admin-field__label">Justificativa</span>
            <textarea
              className="admin-input admin-input--area"
              rows={4}
              value={justificativa}
              aria-describedby={
                tipo === 'revisar' && comEmpresa
                  ? 'dica-minimo-justificativa dica-justificativa'
                  : 'dica-minimo-justificativa'
              }
              onChange={(event) => {
                setJustificativa(event.target.value)
                setErro('')
              }}
              placeholder="O que sustenta este encaminhamento."
            />
          </label>

          <p id="dica-minimo-justificativa" className="admin-field__hint">
            Mínimo de 10 caracteres.
          </p>

          {tipo === 'revisar' && comEmpresa ? (
            <p id="dica-justificativa" className="admin-field__hint">
              {JUSTIFICATIVA_VAI_PARA_A_EMPRESA} Não cite pessoas da equipe nem informação
              interna.
            </p>
          ) : null}

          {erro ? (
            <p className="admin-field__error" role="alert">{erro}</p>
          ) : null}

          <div className="decisao-acoes">
            <button type="submit" className="admin-btn">
              <Icone icon={appIcons.done} />
              Registrar decisão
            </button>
          </div>
        </form>
      </section>

      {observacoesDaAvaliacao}

      {confirmando && opcaoEscolhida ? (
        <AdminModal
          title={`Registrar a decisão: ${opcaoEscolhida.label}?`}
          onClose={() => setConfirmando(false)}
          footer={
            <>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setConfirmando(false)}
              >
                Voltar
              </button>
              <button type="button" className="admin-btn" onClick={confirmar}>
                <Icone icon={appIcons.done} />
                Confirmar e registrar
              </button>
            </>
          }
        >
          <div className="decisao-confirmacao">
            {consequencias(tipo, comEmpresa).map((frase) => (
              <p key={frase}>{frase}</p>
            ))}
          </div>
        </AdminModal>
      ) : null}
    </>
  )
}
