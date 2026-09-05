import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { appIcons } from '../../../../lib/icons'

/**
 * Aba de etapa ainda não implementada.
 *
 * Existe em vez de sumir porque o shell é o mapa do fluxo: uma aba ausente faria
 * o Supervisor procurar a etapa que a baseline promete. O que ela diz é o que a
 * etapa fará — e diz que ainda não faz, sem simular resultado nenhum.
 *
 * Simular seria pior que omitir: uma equipe potencial inventada aqui ensinaria
 * uma leitura de justificativa que o algoritmo real não vai produzir.
 */
export default function AbaPlanejada({ fase, titulo, texto }) {
  return (
    <section className="perfil-card etapa-planejada">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
          <p className="perfil-card__description">{texto}</p>
        </div>

        <span className="etapa-planejada__selo">
          <FontAwesomeIcon icon={appIcons.info} aria-hidden="true" />
          {fase}
        </span>
      </header>

      <div className="perfil-card__body">
        <p className="etapa-planejada__nota">
          Etapa ainda não implementada. Nada é exibido aqui em forma de exemplo:
          uma saída simulada ensinaria a ler um resultado que o módulo real não
          vai produzir do mesmo jeito.
        </p>
      </div>
    </section>
  )
}
