import { useRef, useState } from 'react'
import { EXTENSOES_ACEITAS, TIPOS_POR_EXTENSO } from '../lib/anexos'
import { Icone, appIcons } from '../lib/icons'
import './AnexosOportunidade.scss'

/**
 * A area de arrastar e o botao de escolher arquivo dos anexos.
 *
 * A mesma moldura serve a quem envia na hora (conducao e acompanhamento da
 * oportunidade) e a quem so junta os arquivos para mandar depois (cadastro do
 * problema). O que fazer com os arquivos recebidos fica com quem a usa.
 */
export default function AreaDeEnvio({
  id,
  rotulo,
  multiplos = false,
  enviando = '',
  desabilitado = false,
  aoReceber,
}) {
  const [arrastando, setArrastando] = useState(false)

  const campo = useRef(null)
  const bloqueada = desabilitado || Boolean(enviando)

  const escolher = (event) => {
    const arquivos = Array.from(event.target.files || [])

    if (campo.current) campo.current.value = ''
    if (arquivos.length > 0) aoReceber(arquivos)
  }

  const arrastarSobre = (event) => {
    event.preventDefault()
    if (!bloqueada) setArrastando(true)
  }

  const soltar = (event) => {
    event.preventDefault()
    setArrastando(false)

    const arquivos = Array.from(event.dataTransfer?.files || [])

    if (!bloqueada && arquivos.length > 0) aoReceber(arquivos)
  }

  return (
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
        <p className="anexos__envio-texto">
          {multiplos ? 'Arraste arquivos para cá ou' : 'Arraste um arquivo para cá ou'}
        </p>
      )}

      <input
        id={id}
        ref={campo}
        type="file"
        accept={EXTENSOES_ACEITAS}
        className="sr-only anexos__campo"
        aria-label={rotulo}
        multiple={multiplos}
        onChange={escolher}
        disabled={bloqueada}
      />
      <label
        htmlFor={id}
        className={`admin-btn anexos__escolher${bloqueada ? ' is-desabilitado' : ''}`}
      >
        {multiplos ? 'Escolher arquivos' : 'Escolher arquivo'}
      </label>

      <p className="anexos__envio-dica">{TIPOS_POR_EXTENSO} · até 10 MB por arquivo</p>
    </div>
  )
}
