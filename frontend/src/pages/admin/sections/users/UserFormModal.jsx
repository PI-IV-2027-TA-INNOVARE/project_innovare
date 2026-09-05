import { useState } from 'react'
import AdminModal from '../../../../components/console/AdminModal'
import { PERFIS, STATUS } from './usersData'

const VAZIO = {
  nome: '',
  email: '',
  perfil: 'pesquisador',
  status: 'ativo',
  instituicao: '',
}

/** Validação de fronteira: o mesmo par de regras que o serializer da Fase 2 fará. */
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

/**
 * Formulário de criação e edição de conta.
 *
 * Grava em estado local: o endpoint de administração é da Fase 2 (ver
 * `usersData.js`). O contrato de campos, porém, já segue a baseline — nome,
 * e-mail, perfil entre os quatro atores, situação e instituição.
 */
export default function UserFormModal({ usuario, onSubmit, onClose }) {
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
      instituicao: valores.instituicao.trim(),
    })
  }

  return (
    <AdminModal
      title={editando ? 'Editar usuário' : 'Novo usuário'}
      description={
        editando
          ? 'Alterações valem para a sessão atual desta interface preliminar.'
          : 'O Administrador provisiona a conta; o Supervisor cadastra pesquisadores da rede (RN-A04).'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-btn admin-btn--outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="form-usuario" className="admin-btn">
            {editando ? 'Salvar alterações' : 'Criar usuário'}
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

        <div className="admin-form__row">
          <label className="admin-field">
            <span className="admin-field__label">Perfil</span>
            <select className="admin-input" value={valores.perfil} onChange={alterar('perfil')}>
              {PERFIS.map((perfil) => (
                <option key={perfil.id} value={perfil.id}>{perfil.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Situação</span>
            <select className="admin-input" value={valores.status} onChange={alterar('status')}>
              {STATUS.map((status) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="admin-field">
          <span className="admin-field__label">Instituição</span>
          <input
            type="text"
            className="admin-input"
            value={valores.instituicao}
            onChange={alterar('instituicao')}
            placeholder="AC2 Microbiologia"
          />
        </label>
      </form>
    </AdminModal>
  )
}
