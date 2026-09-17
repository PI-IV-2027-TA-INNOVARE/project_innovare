import { useState } from 'react'
import AdminModal from '../../../../components/console/AdminModal'
import { PERFIS_PROVISIONAVEIS } from './usersData'

const VAZIO = {
  nome: '',
  email: '',
  perfil: 'supervisor',
}

function validar(valores) {
  const erros = {}

  if (!valores.nome.trim()) {
    erros.nome = 'Informe o nome do usuário.'
  }

  if (!valores.email.trim()) {
    erros.email = 'Informe o e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())) {
    erros.email = 'E-mail inválido.'
  }

  return erros
}

export default function UserFormModal({ usuario, onSubmit, onClose, salvando = false }) {
  const [valores, setValores] = useState(() => (usuario ? { ...usuario } : VAZIO))
  const [erros, setErros] = useState({})

  const editando = Boolean(usuario)

  const alterar = (campo) => (event) => {
    setValores((atual) => ({ ...atual, [campo]: event.target.value }))
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
    })
  }

  return (
    <AdminModal
      title={editando ? 'Editar usuário' : 'Novo usuário'}
      description={
        editando
          ? 'Nome, e-mail e papel. Situação e senha têm caminhos próprios.'
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
        <label className="admin-field">
          <span className="admin-field__label">Nome</span>
          <input
            type="text"
            className="admin-input"
            value={valores.nome}
            onChange={alterar('nome')}
            aria-invalid={Boolean(erros.nome)}
            aria-describedby={erros.nome ? 'erro-nome' : undefined}
          />
          {erros.nome ? (
            <span id="erro-nome" className="admin-field__error" role="alert">{erros.nome}</span>
          ) : null}
        </label>

        <label className="admin-field">
          <span className="admin-field__label">E-mail</span>
          <input
            type="email"
            className="admin-input"
            value={valores.email}
            onChange={alterar('email')}
            aria-invalid={Boolean(erros.email)}
            aria-describedby={erros.email ? 'erro-email' : undefined}
          />
          {erros.email ? (
            <span id="erro-email" className="admin-field__error" role="alert">{erros.email}</span>
          ) : null}
        </label>

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
      </form>
    </AdminModal>
  )
}
