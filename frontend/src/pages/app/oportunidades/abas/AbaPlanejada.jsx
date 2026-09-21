import { Icone, appIcons } from '../../../../lib/icons'

export default function AbaPlanejada({ titulo, texto }) {
  return (
    <section className="perfil-card etapa-planejada">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
          <p className="perfil-card__description">{texto}</p>
        </div>

        <span className="etapa-planejada__selo">
          <Icone icon={appIcons.info} aria-hidden="true" />
          Planejado
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
