import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXTENSOES_ACEITAS,
  PRAZO_DE_GUARDA,
  TIPOS_POR_EXTENSO,
  salvarNoComputador,
} from '../lib/anexos'
import { Icone, appIcons } from '../lib/icons'
import { formatarUltimoAcesso } from '../lib/people'
import { baixarAnexo, enviarAnexo, listarAnexos } from '../services/pdConnectApi'
import './AnexosOportunidade.scss'

const TETO_BYTES = 10 * 1024 * 1024

function tamanhoLegivel(bytes) {
  if (!bytes) return '—'

  const kb = bytes / 1024

  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function tipoDoArquivo(nome) {
  const extensao = (nome || '').split('.').pop()

  if (!extensao || extensao === nome) return 'ARQ'

  return extensao === 'jpeg' ? 'JPG' : extensao.toUpperCase().slice(0, 4)
}

function quantos(total) {
  return total === 1 ? '1 documento' : `${total} documentos`
}

/**
 * Os documentos de uma oportunidade (PB21).
 *
 * Uma so implementacao para os dois atores que a historia cita: o Supervisor
 * a ve como aba da conducao, o Demandante como bloco do acompanhamento. O
 * recorte de quem alcanca o registro ja e do servidor; aqui so muda a moldura.
 */
export default function AnexosOportunidade({
  codigo,
  podeEnviar = false,
  titulo = 'Anexos e documentos',
  descricao = 'Laudos, relatórios e material de apoio da oportunidade. Cada envio fica registrado no histórico.',
  quemVe = '',
}) {
  const [anexos, setAnexos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState('')
  const [baixando, setBaixando] = useState(null)
  const [arrastando, setArrastando] = useState(false)

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

  const baixar = async (anexo) => {
    setBaixando(anexo.id_anexo)
    setErro('')

    try {
      salvarNoComputador(await baixarAnexo(codigo, anexo))
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível baixar o documento.')
    } finally {
      setBaixando(null)
    }
  }

  const enviar = async (arquivo) => {
    if (!arquivo || enviando) return

    if (arquivo.size > TETO_BYTES) {
      setErro(`"${arquivo.name}" passa de 10 MB. Envie um arquivo menor.`)
      return
    }

    setEnviando(arquivo.name)
    setErro('')

    try {
      await enviarAnexo(codigo, arquivo)
      await carregar()
    } catch (problema) {
      setErro(problema.message || 'Não foi possível enviar o documento.')
    } finally {
      setEnviando('')
    }
  }

  const escolher = (event) => {
    const arquivo = event.target.files?.[0]

    if (campo.current) campo.current.value = ''
    enviar(arquivo)
  }

  const arrastarSobre = (event) => {
    event.preventDefault()
    if (!enviando) setArrastando(true)
  }

  const soltar = (event) => {
    event.preventDefault()
    setArrastando(false)
    enviar(event.dataTransfer?.files?.[0])
  }

  return (
    <section className="perfil-card anexos">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{titulo}</h2>
          <p className="perfil-card__description">{descricao}</p>
        </div>
        {!carregando && anexos.length > 0 ? (
          <span className="anexos__total">{quantos(anexos.length)}</span>
        ) : null}
      </header>

      <div className="perfil-card__body">
        {quemVe ? (
          <p className="anexos__quem-ve">
            <Icone icon={appIcons.lock} />
            <span>
              <strong>Quem vê:</strong> {quemVe}
            </span>
          </p>
        ) : null}

        {podeEnviar ? (
          <div
            data-testid="anexo-envio"
            className={`anexos__envio${arrastando ? ' is-arrastando' : ''}${enviando ? ' is-enviando' : ''}`}
            onDragOver={arrastarSobre}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
          >
            <span className="anexos__envio-icone" aria-hidden="true">
              <Icone icon={appIcons.folder} />
            </span>

            {enviando ? (
              <p className="anexos__envio-texto" role="status">
                Enviando {enviando}...
              </p>
            ) : (
              <p className="anexos__envio-texto">Arraste um arquivo para cá ou</p>
            )}

            <input
              id="anexo-arquivo"
              ref={campo}
              type="file"
              accept={EXTENSOES_ACEITAS}
              className="sr-only anexos__campo"
              aria-label="Anexar documento"
              onChange={escolher}
              disabled={Boolean(enviando)}
            />
            <label
              htmlFor="anexo-arquivo"
              className={`admin-btn anexos__escolher${enviando ? ' is-desabilitado' : ''}`}
            >
              Escolher arquivo
            </label>

            <p className="anexos__envio-dica">{TIPOS_POR_EXTENSO} · até 10 MB por arquivo</p>
          </div>
        ) : null}

        <p className="anexos__prazo">{PRAZO_DE_GUARDA}</p>

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
                <span className="anexo-lista__tipo" aria-hidden="true">
                  {tipoDoArquivo(anexo.nome_original)}
                </span>

                <div className="anexo-lista__corpo">
                  <p className="anexo-lista__nome" title={anexo.nome_original}>
                    {anexo.nome_original}
                  </p>
                  <p className="anexo-lista__meta">
                    <span>{tamanhoLegivel(anexo.tamanho_bytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{anexo.enviado_por_nome || 'Sistema'}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={anexo.criado_em}>
                      {formatarUltimoAcesso(new Date(anexo.criado_em).getTime())}
                    </time>
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => baixar(anexo)}
                  disabled={baixando === anexo.id_anexo}
                  aria-label={`Baixar ${anexo.nome_original}`}
                >
                  <Icone icon={appIcons.export} />
                  {baixando === anexo.id_anexo ? 'Baixando...' : 'Baixar'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="anexos__vazio">
            <p className="anexos__vazio-titulo">Nenhum documento anexado a esta oportunidade.</p>
            <p className="anexos__vazio-texto">
              {podeEnviar
                ? 'Anexe o primeiro laudo, relatório ou foto pela área acima.'
                : 'Quando um documento for anexado, ele aparece aqui.'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
