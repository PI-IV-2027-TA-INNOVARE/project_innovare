import { formatarUltimoAcesso } from '../../../../lib/people'
import { ETAPAS } from '../etapas'
import { ORIGENS, origemLabel } from '../oportunidadesData'

export default function AbaContexto({ oportunidade, podeConduzir = false, irPara }) {
  const origem = ORIGENS.find((item) => item.id === oportunidade.origem)

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
              {podeConduzir
                ? 'Siga as etapas na ordem. Cada uma usa o resultado da anterior.'
                : 'As etapas que o Supervisor percorre até a decisão.'}
            </p>
          </div>
        </header>

        <ol className="roteiro">
          {ETAPAS.filter((etapa) => etapa.id !== 'contexto').map((etapa) => (
            <li key={etapa.id} className="roteiro__etapa">
              <span className="roteiro__numero" aria-hidden="true">
                {etapa.numero}
              </span>
              <div className="roteiro__texto">
                <p className="roteiro__titulo">{etapa.label}</p>
                <p className="roteiro__resumo">{etapa.resumo}</p>
              </div>
              {irPara ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => irPara(etapa.id)}
                  aria-label={`Abrir a etapa ${etapa.label}`}
                >
                  Abrir
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
