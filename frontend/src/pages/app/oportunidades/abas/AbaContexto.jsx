import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { ORIGENS, origemLabel } from '../oportunidadesData'

/** Contexto da oportunidade: o que entrou, de onde veio e o que já se sabe. */
export default function AbaContexto({ oportunidade }) {
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
            <h2 className="perfil-card__title">O que já se sabe</h2>
            <p className="perfil-card__description">
              Competências derivadas e equipe sugerida até agora.
            </p>
          </div>
        </header>

        <div className="perfil-card__body">
          <div className="oportunidade-bloco">
            <h3 className="oportunidade-bloco__titulo">Competências necessárias</h3>
            {oportunidade.competencias.length > 0 ? (
              <div className="competencia-lista">
                {oportunidade.competencias.map((competencia) => (
                  <span className="admin-tag" key={competencia}>{competencia}</span>
                ))}
              </div>
            ) : (
              <p className="oportunidade-bloco__vazio">
                Ainda não derivadas — dependem da proposta estruturada.
              </p>
            )}
          </div>

          {/*
            Lacuna é vocabulário da baseline (CONTEXT.md §4): competência
            necessária sem correspondência suficiente na rede interna. Aparece
            aqui porque é informação de decisão, não detalhe do matching.
          */}
          {oportunidade.lacunas.length > 0 ? (
            <div className="oportunidade-bloco">
              <h3 className="oportunidade-bloco__titulo">Lacunas de competência</h3>
              <div className="competencia-lista">
                {oportunidade.lacunas.map((lacuna) => (
                  <span className="lacuna-tag" key={lacuna}>
                    <FontAwesomeIcon icon={appIcons.warning} aria-hidden="true" />
                    {lacuna}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="oportunidade-bloco">
            <h3 className="oportunidade-bloco__titulo">Equipe potencial</h3>
            {oportunidade.equipe.length > 0 ? (
              <>
                <ul className="oportunidade-equipe">
                  {oportunidade.equipe.map((pessoa) => (
                    <li key={pessoa}>{pessoa}</li>
                  ))}
                </ul>
                <p className="oportunidade-bloco__nota">
                  Sugestão do matching, validada pelo Supervisor. Não há convite,
                  aceite ou recusa pelo pesquisador (RN-A06).
                </p>
              </>
            ) : (
              <p className="oportunidade-bloco__vazio">Matching ainda não executado.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
