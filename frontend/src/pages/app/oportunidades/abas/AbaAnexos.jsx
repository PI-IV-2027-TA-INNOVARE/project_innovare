import { useCallback, useEffect, useRef, useState } from 'react'
import { Icone, appIcons } from '../../../../lib/icons'
import { formatarUltimoAcesso } from '../../../../lib/people'
import { enviarAnexo, listarAnexos } from '../../../../services/pdConnectApi'

const TETO_BYTES = 10 * 1024 * 1024

function tamanhoLegivel(bytes) {
  if (!bytes) return '—'

  const kb = bytes / 1024

  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

export default function AbaAnexos({ codigo, podeEnviar = false }) {
  const [anexos, setAnexos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const campo = useRef(null)

  const carregar = useCallback(async () => {
    try {
      setAnexos(await listarAnexos(codigo))
      setErro('')
    } catch {
      setErro('Não foi possível carregar os documentos desta oportunidade.')
    } finally {
      setCarregando(false)
    }
  }, [codigo])

  useEffect(() => {
    carregar()
  }, [carregar])

  const escolher = async (event) => {
    const arquivo = event.target.files?.[0]

    if (campo.current) campo.current.value = ''
    if (!arquivo) return

    if (arquivo.size > TETO_BYTES) {
      setErro(`"${arquivo.name}" passa de 10 MB. Envie um arquivo menor.`)
      return
    }

    setEnviando(true)
    setErro('')

    try {
      await enviarAnexo(codigo, arquivo)
      await carregar()
    } catch (problema) {
      setErro(problema.message || 'Não foi possível enviar o documento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Anexos e documentos</h2>
          <p className="perfil-card__description">
            Laudos, relatórios e material de apoio da oportunidade. Cada envio
            fica registrado no histórico.
          </p>
        </div>
      </header>

      <div className="perfil-card__body">
        {podeEnviar ? (
          <div className="console-form__field">
            <label className="form-label" htmlFor="anexo-arquivo">
              Anexar documento
            </label>
            <input
              id="anexo-arquivo"
              ref={campo}
              type="file"
              className="form-input"
              onChange={escolher}
              disabled={enviando}
            />
            <p className="console-form__hint">
              Até 10 MB por arquivo.
            </p>
          </div>
        ) : null}

        {erro ? (
          <p className="login-message" role="alert">
            {erro}
          </p>
        ) : null}

        {carregando ? (
          <p className="oportunidade-bloco__vazio">Carregando documentos…</p>
        ) : anexos.length > 0 ? (
          <ul className="anexo-lista">
            {anexos.map((anexo) => (
              <li className="anexo-lista__item" key={anexo.id_anexo}>
                <span className="anexo-lista__icone" aria-hidden="true">
                  <Icone icon={appIcons.folder} />
                </span>

                <div className="anexo-lista__corpo">
                  <p className="anexo-lista__nome">{anexo.nome_original}</p>
                  <p className="trilha__meta">
                    <span>{tamanhoLegivel(anexo.tamanho_bytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{anexo.enviado_por_nome || 'Sistema'}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={anexo.criado_em}>
                      {formatarUltimoAcesso(new Date(anexo.criado_em).getTime())}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oportunidade-bloco__vazio">
            Nenhum documento anexado a esta oportunidade.
          </p>
        )}
      </div>
    </section>
  )
}
