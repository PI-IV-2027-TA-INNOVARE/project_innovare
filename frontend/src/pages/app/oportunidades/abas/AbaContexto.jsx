import { useId } from 'react'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { ETAPAS, etapaDaSituacao, etapaPorId, situacaoEncerrada } from '../etapas'
import { ORIGENS, origemLabel, situacaoLabel } from '../oportunidadesData'
import ProximoPasso from './ProximoPasso'

function Andamento({ situacao, podeConduzir, irPara, etapa }) {
  if (situacaoEncerrada(situacao)) {
    return (
      <div className="roteiro__situacao">
        <p className="roteiro__titulo">
          A oportunidade já tem decisão registrada: {situacaoLabel(situacao)}.
        </p>
        {irPara ? (
          <button type="button" className="link-button" onClick={() => irPara('decisao')}>
            Ver a decisão
          </button>
        ) : null}
      </div>
    )
  }

  if (!podeConduzir) {
    return (
      <div className="roteiro__situacao">
        <p className="roteiro__titulo">
          A oportunidade está na etapa {etapa.numero}, {etapa.label}.
        </p>
      </div>
    )
  }

  return (
    <ProximoPasso
      etapa={etapa.id}
      irPara={irPara}
      texto={
        situacao === 'revisar'
          ? 'A oportunidade voltou para revisão. Retome a proposta estruturada para seguir.'
          : undefined
      }
    />
  )
}

export default function AbaContexto({ oportunidade, podeConduzir = false, irPara }) {
  const idDasSeguintes = useId()
  const origem = ORIGENS.find((item) => item.id === oportunidade.origem)
  const encerrada = situacaoEncerrada(oportunidade.situacao)
  const atual = etapaPorId(etapaDaSituacao(oportunidade.situacao))
  const proxima = podeConduzir && atual.id === 'contexto' ? etapaPorId('copiloto') : atual
  const seguintes = encerrada ? [] : ETAPAS.filter((etapa) => etapa.numero > proxima.numero)

  return (
    <div className="oportunidade-grid">
      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Entrada</h2>
            <p className="perfil-card__description">{origem?.descricao}</p>
          </div>
        </header>

        <div className="perfil-card__body">
          <p className="oportunidade-resumo">{oportunidade.resumo}</p>

          <dl className="detail-list">
            <div className="detail-list__row">
              <dt>Origem</dt>
              <dd>{origemLabel(oportunidade.origem)}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Demandante</dt>
              <dd>{oportunidade.demandante}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Responsável</dt>
              <dd>{oportunidade.responsavel}</dd>
            </div>
            <div className="detail-list__row">
              <dt>Cadastrada</dt>
              <dd>{formatarUltimoAcesso(oportunidade.criadaEm)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="perfil-card">
        <header className="perfil-card__header">
          <div>
            <h2 className="perfil-card__title">Como conduzir esta oportunidade</h2>
            <p className="perfil-card__description">
              {encerrada
                ? 'O caminho pelas etapas terminou.'
                : podeConduzir
                  ? 'Siga as etapas na ordem. Cada uma usa o resultado da anterior.'
                  : 'As etapas que o Supervisor percorre até a decisão.'}
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <Andamento
            situacao={oportunidade.situacao}
            podeConduzir={podeConduzir}
            irPara={irPara}
            etapa={proxima}
          />

          {seguintes.length > 0 ? (
            <div>
              <h3 id={idDasSeguintes} className="roteiro__subtitulo">Etapas seguintes</h3>
              <ol className="roteiro" aria-labelledby={idDasSeguintes}>
                {seguintes.map((etapa) => (
                  <li key={etapa.id} className="roteiro__etapa">
                    <span className="roteiro__numero" aria-hidden="true">
                      {etapa.numero}
                    </span>
                    <div className="roteiro__texto">
                      <p className="roteiro__titulo">{etapa.label}</p>
                      <p className="roteiro__resumo">{etapa.resumo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
