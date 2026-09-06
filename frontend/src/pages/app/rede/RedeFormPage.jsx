import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { appIcons } from '../../../lib/icons'
import ListaEditavel from '../perfil/ListaEditavel'
import {
  DISPONIBILIDADES,
  PAPEIS_REDE,
  REDE_EXEMPLO,
  TITULACOES,
} from './redeData'
import './RedePage.scss'

/**
 * Cadastro e edição de alguém da rede interna (RF02 / RF03).
 *
 * Só o Supervisor cadastra: **não há autocadastro de pesquisador** (RN-A04 /
 * D06). O cadastro cria o registro na rede; a liberação de acesso é um segundo
 * passo, deliberadamente separado — cadastrar alguém para o matching enxergar e
 * dar-lhe login são decisões distintas, e juntá-las num único botão faria a
 * primeira arrastar a segunda sem querer.
 *
 * Página inteira, e não modal: são sete dimensões do RF03: modal com essa
 * altura vira scroll dentro de scroll.
 */

const VAZIO = {
  nome: '',
  email: '',
  papel: 'pesquisador',
  titulacao: 'mestrado',
  instituicao: 'AC2 Microbiologia',
  disponibilidade: 'parcial',
  competencias: [],
  tecnicas: [],
  linhas: [],
  experiencia: '',
  liberarAcesso: false,
}

function validar(valores) {
  const erros = {}

  if (!valores.nome.trim()) erros.nome = 'Informe o nome.'

  if (!valores.email.trim()) {
    erros.email = 'Informe o e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())) {
    erros.email = 'E-mail inválido.'
  }

  return erros
}

export default function RedeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const registro = useMemo(
    () => REDE_EXEMPLO.find((pessoa) => String(pessoa.id) === String(id)),
    [id]
  )

  const editando = Boolean(registro)

  const [valores, setValores] = useState(() =>
    registro ? { ...VAZIO, ...registro, liberarAcesso: registro.situacao === 'ativo' } : VAZIO
  )
  const [erros, setErros] = useState({})

  const alterar = (campo) => (valor) => {
    setValores((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const alterarCampo = (campo) => (event) => alterar(campo)(event.target.value)

  const enviar = (event) => {
    event.preventDefault()

    const encontrados = validar(valores)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    showToast(
      editando ? 'Cadastro atualizado.' : 'Pesquisador cadastrado na rede.'
    )

    // Sem endpoint ainda: volta para a lista, que relê o exemplo local.
    window.setTimeout(() => navigate('/rede'), 600)
  }

  return (
    <div className="console rede-page">
      <header className="rede-page__header">
        <div>
          <BackLink to="/rede">Voltar para a rede interna</BackLink>

          <p className="rede-page__kicker">
            {editando ? 'Editar cadastro' : 'Novo cadastro'}
          </p>
          <h1 className="rede-page__title">
            {editando ? valores.nome : 'Cadastrar pesquisador'}
          </h1>
          <p className="rede-page__description">
            O cadastro coloca a pessoa na rede que o matching enxerga. A liberação
            de acesso é o passo seguinte — e separado.
          </p>
        </div>
      </header>

      <form className="rede-form" onSubmit={enviar} noValidate>
        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Identificação</h2>
              <p className="perfil-card__description">
                O e-mail vira a credencial de acesso quando você liberar o login.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">Nome</span>
              <input
                type="text"
                className="admin-input"
                value={valores.nome}
                onChange={alterarCampo('nome')}
                aria-invalid={Boolean(erros.nome)}
              />
              {erros.nome ? (
                <span className="admin-field__error" role="alert">{erros.nome}</span>
              ) : null}
            </label>

            <label className="admin-field">
              <span className="admin-field__label">E-mail</span>
              <input
                type="email"
                className="admin-input"
                value={valores.email}
                onChange={alterarCampo('email')}
                aria-invalid={Boolean(erros.email)}
              />
              {erros.email ? (
                <span className="admin-field__error" role="alert">{erros.email}</span>
              ) : null}
            </label>

            <div className="admin-form__row">
              <label className="admin-field">
                <span className="admin-field__label">Papel na rede</span>
                <select className="admin-input" value={valores.papel} onChange={alterarCampo('papel')}>
                  {PAPEIS_REDE.map((papel) => (
                    <option key={papel.id} value={papel.id}>{papel.label}</option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span className="admin-field__label">Instituição</span>
                <input
                  type="text"
                  className="admin-input"
                  value={valores.instituicao}
                  onChange={alterarCampo('instituicao')}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Qualificação</h2>
              <p className="perfil-card__description">
                Titulação é lista fechada porque o matching de supervisão filtra
                por ela (RF07).
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <div className="admin-form__row">
              <label className="admin-field">
                <span className="admin-field__label">Titulação</span>
                <select
                  className="admin-input"
                  value={valores.titulacao}
                  onChange={alterarCampo('titulacao')}
                >
                  {TITULACOES.map((titulacao) => (
                    <option key={titulacao.id} value={titulacao.id}>{titulacao.label}</option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span className="admin-field__label">Disponibilidade</span>
                <select
                  className="admin-input"
                  value={valores.disponibilidade}
                  onChange={alterarCampo('disponibilidade')}
                >
                  {DISPONIBILIDADES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="admin-field">
              <span className="admin-field__label">Experiência</span>
              <textarea
                className="admin-input admin-input--area"
                rows={3}
                value={valores.experiencia}
                onChange={alterarCampo('experiencia')}
                placeholder="Projetos relevantes e tempo de atuação."
              />
            </label>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">O que o matching compara</h2>
              <p className="perfil-card__description">
                Sem competência declarada a pessoa entra na rede, mas fica
                invisível para as sugestões (RF06).
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <ListaEditavel
              label="Competências"
              placeholder="Ex.: Microbiologia de alimentos"
              values={valores.competencias}
              onChange={alterar('competencias')}
            />

            <ListaEditavel
              label="Técnicas"
              placeholder="Ex.: PCR em tempo real"
              values={valores.tecnicas}
              onChange={alterar('tecnicas')}
            />

            <ListaEditavel
              label="Linhas de pesquisa"
              placeholder="Ex.: Bioinsumos agrícolas"
              values={valores.linhas}
              onChange={alterar('linhas')}
            />
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Acesso à plataforma</h2>
              <p className="perfil-card__description">
                Passo separado do cadastro: a pessoa pode integrar a rede antes de
                receber login (RN-A04).
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="rede-form__switch">
              <input
                type="checkbox"
                checked={valores.liberarAcesso}
                onChange={(event) => alterar('liberarAcesso')(event.target.checked)}
              />
              <span>Liberar acesso agora — as credenciais chegam por e-mail</span>
            </label>
          </div>
        </section>

        <footer className="rede-form__footer">
          <Link className="admin-btn admin-btn--outline" to="/rede">Cancelar</Link>
          <button type="submit" className="admin-btn">
            <FontAwesomeIcon icon={editando ? appIcons.done : appIcons.addUser} />
            {editando ? 'Salvar cadastro' : 'Cadastrar na rede'}
          </button>
        </footer>
      </form>

      <AdminToast toast={toast} />
    </div>
  )
}
