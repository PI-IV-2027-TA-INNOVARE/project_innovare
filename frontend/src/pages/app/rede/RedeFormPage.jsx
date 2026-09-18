import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import {
  atualizarMembroRede,
  criarMembroRede,
  liberarAcessoMembro,
  obterMembroRede,
} from '../../../services/pdConnectApi'
import ListaEditavel from '../perfil/ListaEditavel'
import {
  DISPONIBILIDADES,
  PAPEIS_REDE,
  TITULACOES,
  membroDaApi,
  membroParaApi,
} from './redeData'
import './RedePage.scss'

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

  const editando = Boolean(id)

  const [valores, setValores] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [temAcesso, setTemAcesso] = useState(false)
  const [carregando, setCarregando] = useState(editando)
  const [erroCarga, setErroCarga] = useState('')
  const [erroEnvio, setErroEnvio] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!editando) return

    setCarregando(true)
    setErroCarga('')

    try {
      const membro = membroDaApi(await obterMembroRede(id))

      setValores({ ...VAZIO, ...membro, liberarAcesso: membro.temAcesso })
      setTemAcesso(membro.temAcesso)
    } catch (falha) {
      setErroCarga(falha?.message || 'Não foi possível carregar este cadastro.')
    } finally {
      setCarregando(false)
    }
  }, [editando, id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const alterar = (campo) => (valor) => {
    setValores((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const alterarCampo = (campo) => (event) => alterar(campo)(event.target.value)

  const enviar = async (event) => {
    event.preventDefault()

    const encontrados = validar(valores)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    setSalvando(true)
    setErroEnvio('')

    try {
      const corpo = membroParaApi(valores)

      const membro = editando
        ? await atualizarMembroRede(id, corpo)
        : await criarMembroRede(corpo)

      if (valores.liberarAcesso && !membro.tem_acesso) {
        await liberarAcessoMembro(membro.id_membro)
      }

      showToast(
        editando ? 'Cadastro atualizado.' : 'Pesquisador cadastrado na rede.'
      )

      window.setTimeout(() => navigate('/rede'), 600)
    } catch (falha) {
      setErroEnvio(falha?.message || 'Não foi possível gravar o cadastro.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="console rede-page">
        <BackLink to="/rede">Voltar para a rede interna</BackLink>
        <p className="oportunidade-page__vazio" role="status">Carregando o cadastro...</p>
      </div>
    )
  }

  if (erroCarga) {
    return (
      <div className="console rede-page">
        <BackLink to="/rede">Voltar para a rede interna</BackLink>
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button type="button" className="admin-btn admin-btn--outline" onClick={carregar}>
          Tentar de novo
        </button>
      </div>
    )
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

      <form className="console-form" onSubmit={enviar} noValidate>
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
                aria-describedby={erros.nome ? 'erro-rede-nome' : undefined}
              />
              {erros.nome ? (
                <span id="erro-rede-nome" className="admin-field__error" role="alert">
                  {erros.nome}
                </span>
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
                aria-describedby={erros.email ? 'erro-rede-email' : undefined}
              />
              {erros.email ? (
                <span id="erro-rede-email" className="admin-field__error" role="alert">
                  {erros.email}
                </span>
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
                  readOnly
                  aria-readonly="true"
                  aria-describedby="dica-instituicao"
                />
              </label>
              <span id="dica-instituicao" className="admin-field__hint">
                O vínculo institucional vem do cadastro de organizações.
              </span>
            </div>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Qualificação</h2>
              <p className="perfil-card__description">
                Titulação é lista fechada porque o matching de supervisão filtra
                por ela.
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
                invisível para as sugestões.
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
                receber login.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="console-form__switch">
              <input
                type="checkbox"
                checked={valores.liberarAcesso}
                disabled={temAcesso}
                onChange={(event) => alterar('liberarAcesso')(event.target.checked)}
              />
              <span>
                {temAcesso
                  ? 'Esta pessoa já tem login na plataforma'
                  : 'Liberar acesso agora — o convite chega por e-mail'}
              </span>
            </label>
          </div>
        </section>

        {erroEnvio ? (
          <div className="admin-callout" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">{erroEnvio}</p>
          </div>
        ) : null}

        <footer className="console-form__footer">
          <Link className="admin-btn admin-btn--outline" to="/rede">Cancelar</Link>
          <button type="submit" className="admin-btn" disabled={salvando}>
            <Icone icon={editando ? appIcons.save : appIcons.addUser} />
            {salvando
              ? 'Gravando...'
              : (editando ? 'Salvar cadastro' : 'Cadastrar na rede')}
          </button>
        </footer>
      </form>

      <AdminToast toast={toast} />
    </div>
  )
}
