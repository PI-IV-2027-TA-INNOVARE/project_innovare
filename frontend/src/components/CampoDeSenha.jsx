import { useState } from 'react'
import { Icone, appIcons } from '../lib/icons'
import { REGRAS_DA_SENHA } from '../lib/senha'
import './CampoDeSenha.scss'

const CLASSES = {
  console: {
    campo: 'admin-field',
    rotulo: 'admin-field__label',
    entrada: 'admin-input',
    erro: 'admin-field__error',
  },
  acesso: {
    campo: 'form-group',
    rotulo: 'form-label',
    entrada: 'form-input',
    erro: 'field-error',
  },
}

export function RegrasDaSenha({ id }) {
  return (
    <div id={id} className="regras-da-senha">
      <p className="regras-da-senha__titulo">A nova senha precisa:</p>
      <ul className="regras-da-senha__lista">
        {REGRAS_DA_SENHA.map((regra) => (
          <li key={regra}>{regra}</li>
        ))}
      </ul>
    </div>
  )
}

export default function CampoDeSenha({
  id,
  rotulo,
  valor,
  onChange,
  autoComplete,
  erro = '',
  descricao,
  placeholder,
  desabilitado = false,
  estilo = 'console',
}) {
  const [visivel, setVisivel] = useState(false)
  const classes = CLASSES[estilo] || CLASSES.console
  const erroId = `${id}-erro`
  const descritoPor = [descricao, erro ? erroId : null].filter(Boolean).join(' ')

  return (
    <div className={`${classes.campo} campo-de-senha`}>
      <label className={classes.rotulo} htmlFor={id}>{rotulo}</label>

      <div className="campo-de-senha__controle">
        <input
          id={id}
          type={visivel ? 'text' : 'password'}
          className={`${classes.entrada} campo-de-senha__entrada`}
          value={valor}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          spellCheck="false"
          aria-invalid={erro ? true : undefined}
          aria-describedby={descritoPor || undefined}
          disabled={desabilitado}
        />

        <button
          type="button"
          className="campo-de-senha__alternar"
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          aria-controls={id}
          title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          disabled={desabilitado}
        >
          <Icone icon={visivel ? appIcons.passwordHide : appIcons.passwordShow} />
        </button>
      </div>

      {erro ? (
        <span id={erroId} className={classes.erro} role="alert">{erro}</span>
      ) : null}
    </div>
  )
}
