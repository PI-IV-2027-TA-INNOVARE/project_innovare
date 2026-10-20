import { useId } from 'react'
import { Icone, appIcons } from '../../../lib/icons'
import { FORMACAO_VAZIA, TITULACOES } from './redeData'
import './ListaDeFormacoes.scss'

export default function ListaDeFormacoes({ values = [], onChange, readOnly = false }) {
  const prefixo = useId()

  const alterar = (indice, campo) => (event) => {
    onChange(
      values.map((formacao, posicao) =>
        posicao === indice ? { ...formacao, [campo]: event.target.value } : formacao,
      ),
    )
  }

  const remover = (indice) => onChange(values.filter((_, posicao) => posicao !== indice))

  const adicionar = () => onChange([...values, { ...FORMACAO_VAZIA }])

  return (
    <div className="lista-formacoes">
      {values.length === 0 ? (
        <p className="lista-editavel__vazio">Nenhuma formação informada.</p>
      ) : (
        <ol className="lista-formacoes__itens">
          {values.map((formacao, indice) => {
            const id = (campo) => `${prefixo}-${indice}-${campo}`

            return (
              <li key={indice} className="lista-formacoes__item">
                <label className="admin-field" htmlFor={id('curso')}>
                  <span className="admin-field__label">Curso</span>
                  <input
                    id={id('curso')}
                    className="admin-input"
                    value={formacao.curso}
                    onChange={alterar(indice, 'curso')}
                    placeholder="Ex.: Ciências Biológicas"
                    readOnly={readOnly}
                    required
                  />
                </label>

                <label className="admin-field" htmlFor={id('instituicao')}>
                  <span className="admin-field__label">Instituição de ensino</span>
                  <input
                    id={id('instituicao')}
                    className="admin-input"
                    value={formacao.instituicao}
                    onChange={alterar(indice, 'instituicao')}
                    placeholder="Ex.: Unicamp"
                    readOnly={readOnly}
                    required
                  />
                </label>

                <label className="admin-field" htmlFor={id('titulacao')}>
                  <span className="admin-field__label">Nível</span>
                  <select
                    id={id('titulacao')}
                    className="admin-input"
                    value={formacao.titulacao}
                    onChange={alterar(indice, 'titulacao')}
                    disabled={readOnly}
                  >
                    <option value="">Não informado</option>
                    {TITULACOES.map((titulacao) => (
                      <option key={titulacao.id} value={titulacao.id}>{titulacao.label}</option>
                    ))}
                  </select>
                </label>

                <label className="admin-field" htmlFor={id('ano')}>
                  <span className="admin-field__label">Conclusão</span>
                  <input
                    id={id('ano')}
                    type="number"
                    inputMode="numeric"
                    className="admin-input"
                    value={formacao.ano}
                    onChange={alterar(indice, 'ano')}
                    placeholder="Ano"
                    min={1950}
                    readOnly={readOnly}
                  />
                </label>

                {readOnly ? null : (
                  <button
                    type="button"
                    className="admin-btn admin-btn--outline lista-formacoes__remover"
                    onClick={() => remover(indice)}
                    aria-label={`Remover a formação ${formacao.curso || indice + 1}`}
                  >
                    <Icone icon={appIcons.remove} />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {readOnly ? null : (
        <button type="button" className="admin-btn admin-btn--outline" onClick={adicionar}>
          Adicionar formação
        </button>
      )}
    </div>
  )
}
