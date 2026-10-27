import { useEffect, useState } from 'react'
import AdminModal from '../../../../components/console/AdminModal'
import { cnpjValido, mascararCnpj, somenteDigitos } from '../../../../lib/cnpj'
import { buscarEmpresaPorCnpj } from '../../../../services/pdConnectApi'
import { PERFIS_PROVISIONAVEIS } from './usersData'

const VAZIO = {
  nome: '',
  email: '',
  perfil: 'supervisor',
  cnpj: '',
  nomeEmpresa: '',
}

function validar(valores) {
  const erros = {}
  const demandante = valores.perfil === 'demandante'

  if (demandante) {
    if (!somenteDigitos(valores.cnpj)) {
      erros.cnpj = 'Informe o CNPJ da empresa.'
    } else if (!cnpjValido(valores.cnpj)) {
      erros.cnpj = 'CNPJ inválido. Confira os 14 números.'
    }

    if (!valores.nomeEmpresa.trim()) {
      erros.nomeEmpresa = 'Informe o nome da empresa.'
    }
  } else if (!valores.nome.trim()) {
    erros.nome = 'Informe o nome do usuário.'
  }

  if (!valores.email.trim()) {
    erros.email = 'Informe o e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())) {
    erros.email = 'E-mail inválido.'
  }

  return erros
}

function Campo({ id, rotulo, erro, dica, children }) {
  const descritores = [erro ? `erro-${id}` : null, dica ? `dica-${id}` : null]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className="admin-field">
      <label className="admin-field__label" htmlFor={`campo-${id}`}>{rotulo}</label>
      {children(descritores)}
      {dica ? <span id={`dica-${id}`} className="admin-field__hint">{dica}</span> : null}
      {erro ? (
        <span id={`erro-${id}`} className="admin-field__error" role="alert">{erro}</span>
      ) : null}
    </div>
  )
}

export default function UserFormModal({ usuario, onSubmit, onClose, salvando = false }) {
  const [valores, setValores] = useState(() => (
    usuario ? { ...VAZIO, ...usuario, cnpj: mascararCnpj(usuario.cnpj) } : VAZIO
  ))
  const [erros, setErros] = useState({})
  const [empresaExistente, setEmpresaExistente] = useState(false)

  const editando = Boolean(usuario)
  const demandante = valores.perfil === 'demandante'
  const cnpjCompleto = cnpjValido(valores.cnpj)

  useEffect(() => {
    if (!demandante || !cnpjCompleto) {
      setEmpresaExistente(false)
      return undefined
    }

    let ativo = true

    buscarEmpresaPorCnpj(somenteDigitos(valores.cnpj))
      .then((empresa) => {
        if (!ativo) return
        setEmpresaExistente(true)
        setValores((atual) => ({ ...atual, nomeEmpresa: empresa.nome }))
        setErros((atual) => ({ ...atual, nomeEmpresa: undefined }))
      })
      .catch(() => {
        if (ativo) setEmpresaExistente(false)
      })

    return () => {
      ativo = false
    }
  }, [demandante, cnpjCompleto, valores.cnpj])

  const alterar = (campo) => (event) => {
    const valor = campo === 'cnpj' ? mascararCnpj(event.target.value) : event.target.value

    setValores((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const enviar = (event) => {
    event.preventDefault()

    const encontrados = validar(valores)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    onSubmit({
      ...valores,
      nome: valores.nome.trim(),
      email: valores.email.trim(),
      cnpj: somenteDigitos(valores.cnpj),
      nomeEmpresa: valores.nomeEmpresa.trim(),
    })
  }

  return (
    <AdminModal
      title={editando ? 'Editar usuário' : 'Novo usuário'}
      description={
        editando
          ? 'Os dados de acesso. Situação e senha têm caminhos próprios.'
          : 'A conta nasce sem senha: a pessoa recebe um convite por e-mail e define a dela. Pesquisadores entram pela rede interna, pelo Supervisor.'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-btn admin-btn--outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-usuario" className="admin-btn" disabled={salvando}>
            {salvando
              ? 'Enviando...'
              : (editando ? 'Salvar alterações' : 'Criar conta e enviar convite')}
          </button>
        </>
      }
    >
      <form id="form-usuario" className="admin-form" onSubmit={enviar} noValidate>
        <div className="admin-field">
          <label className="admin-field__label" htmlFor="campo-perfil">Perfil</label>
          <select
            id="campo-perfil"
            className="admin-input"
            value={valores.perfil}
            onChange={alterar('perfil')}
            aria-describedby="dica-perfil"
          >
            {PERFIS_PROVISIONAVEIS.map((perfil) => (
              <option key={perfil.id} value={perfil.id}>{perfil.label}</option>
            ))}
          </select>
          <span id="dica-perfil" className="admin-field__hint">
            Pesquisador não aparece aqui: a conta dele nasce do cadastro na rede
            interna, feito pelo Supervisor.
          </span>
        </div>

        {demandante ? (
          <>
            <Campo id="cnpj" rotulo="CNPJ" erro={erros.cnpj}>
              {(descritores) => (
                <input
                  id="campo-cnpj"
                  type="text"
                  inputMode="numeric"
                  className="admin-input"
                  placeholder="00.000.000/0000-00"
                  value={valores.cnpj}
                  onChange={alterar('cnpj')}
                  aria-invalid={Boolean(erros.cnpj)}
                  aria-describedby={descritores}
                />
              )}
            </Campo>

            <Campo
              id="empresa"
              rotulo="Nome da empresa"
              erro={erros.nomeEmpresa}
              dica={empresaExistente
                ? 'Empresa já cadastrada: esta conta fica ligada a ela.'
                : 'É o nome que aparece para a equipe da AC2.'}
            >
              {(descritores) => (
                <input
                  id="campo-empresa"
                  type="text"
                  className="admin-input"
                  value={valores.nomeEmpresa}
                  onChange={alterar('nomeEmpresa')}
                  readOnly={empresaExistente}
                  aria-invalid={Boolean(erros.nomeEmpresa)}
                  aria-describedby={descritores}
                />
              )}
            </Campo>
          </>
        ) : (
          <Campo id="nome" rotulo="Nome" erro={erros.nome}>
            {(descritores) => (
              <input
                id="campo-nome"
                type="text"
                className="admin-input"
                value={valores.nome}
                onChange={alterar('nome')}
                aria-invalid={Boolean(erros.nome)}
                aria-describedby={descritores}
              />
            )}
          </Campo>
        )}

        <Campo id="email" rotulo={demandante ? 'E-mail de acesso' : 'E-mail'} erro={erros.email}>
          {(descritores) => (
            <input
              id="campo-email"
              type="email"
              className="admin-input"
              value={valores.email}
              onChange={alterar('email')}
              aria-invalid={Boolean(erros.email)}
              aria-describedby={descritores}
            />
          )}
        </Campo>
      </form>
    </AdminModal>
  )
}
