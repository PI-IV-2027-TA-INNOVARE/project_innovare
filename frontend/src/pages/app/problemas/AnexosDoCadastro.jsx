import { useState } from 'react'
import AreaDeEnvio from '../../../components/AreaDeEnvio'
import {
  TETO_BYTES,
  quantosDocumentos,
  tamanhoLegivel,
  tipoAceito,
  tipoDoArquivo,
} from '../../../lib/anexos'
import { Icone, appIcons } from '../../../lib/icons'

function nomes(arquivos) {
  return arquivos.map((arquivo) => arquivo.name).join(', ')
}

function motivoDaRecusa(grandes, foraDoTipo) {
  return [
    grandes.length === 1 ? `${nomes(grandes)} passa de 10 MB e ficou de fora.` : '',
    grandes.length > 1 ? `${nomes(grandes)} passam de 10 MB e ficaram de fora.` : '',
    foraDoTipo.length === 1 ? `${nomes(foraDoTipo)} não é de um tipo aceito e ficou de fora.` : '',
    foraDoTipo.length > 1 ? `${nomes(foraDoTipo)} não são de um tipo aceito e ficaram de fora.` : '',
  ].filter(Boolean).join(' ')
}

function chave(arquivo) {
  return `${arquivo.name}-${arquivo.size}-${arquivo.lastModified}`
}

/**
 * Os anexos do cadastro do problema (PB21).
 *
 * Antes do cadastro nao existe oportunidade a que vincular o arquivo: a tela
 * so junta a escolha, e o envio acontece quando o problema e cadastrado. A
 * area de arrastar e a lista seguem as do acompanhamento.
 */
export default function AnexosDoCadastro({ arquivos, aoMudar, desabilitado = false }) {
  const [erro, setErro] = useState('')

  const receber = (recebidos) => {
    const grandes = recebidos.filter((arquivo) => arquivo.size > TETO_BYTES)
    const foraDoTipo = recebidos.filter(
      (arquivo) => arquivo.size <= TETO_BYTES && !tipoAceito(arquivo.name)
    )
    const jaEscolhidos = new Set(arquivos.map(chave))
    const novos = recebidos.filter(
      (arquivo) =>
        arquivo.size <= TETO_BYTES && tipoAceito(arquivo.name) && !jaEscolhidos.has(chave(arquivo))
    )

    aoMudar([...arquivos, ...novos])
    setErro(motivoDaRecusa(grandes, foraDoTipo))
  }

  const remover = (alvo) => {
    aoMudar(arquivos.filter((arquivo) => arquivo !== alvo))
  }

  return (
    <section className="perfil-card anexos">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Anexos</h2>
          <p className="perfil-card__description">
            Laudos, fotos, relatórios de ensaio — o que ajudar a AC2 a entender o problema.
          </p>
        </div>
        {arquivos.length > 0 ? (
          <span className="anexos__total">{quantosDocumentos(arquivos.length)}</span>
        ) : null}
      </header>

      <div className="perfil-card__body">
        <AreaDeEnvio
          id="anexo-cadastro"
          rotulo="Anexar documentos"
          multiplos
          desabilitado={desabilitado}
          aoReceber={receber}
        />

        {erro ? (
          <p className="login-message" role="alert">
            {erro}
          </p>
        ) : null}

        {arquivos.length > 0 ? (
          <ul className="anexo-lista">
            {arquivos.map((arquivo) => (
              <li className="anexo-lista__item" key={chave(arquivo)}>
                <span className="anexo-lista__tipo" aria-hidden="true">
                  {tipoDoArquivo(arquivo.name)}
                </span>

                <div className="anexo-lista__corpo">
                  <p className="anexo-lista__nome" title={arquivo.name}>
                    {arquivo.name}
                  </p>
                  <p className="anexo-lista__meta">{tamanhoLegivel(arquivo.size)}</p>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => remover(arquivo)}
                  disabled={desabilitado}
                  aria-label={`Remover ${arquivo.name}`}
                >
                  <Icone icon={appIcons.remove} />
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="admin-callout" role="note">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Os arquivos sobem junto com o cadastro. A seleção não entra no
            rascunho: se você sair e voltar, escolha os arquivos de novo.
          </p>
        </div>
      </div>
    </section>
  )
}
