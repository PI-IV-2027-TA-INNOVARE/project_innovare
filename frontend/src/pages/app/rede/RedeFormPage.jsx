import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AdminModal from '../../../components/console/AdminModal'
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
import ListaDeFormacoes from './ListaDeFormacoes'
import {
  DISPONIBILIDADES,
  PAPEIS_REDE,
  TITULACOES,
  membroDaApi,
  membroParaApi,
} from './redeData'
import './RedePage.scss'

const LISTAS_DO_MATCHING = [
  {
    campo: 'competencias',
    label: 'Competências',
    dica: 'Conhecimento científico e técnico que a pessoa domina.',
    placeholder: 'Ex.: Microbiologia de alimentos',
  },
  {
    campo: 'tecnicas',
    label: 'Técnicas',
    dica: 'Métodos e equipamentos que a pessoa opera.',
    placeholder: 'Ex.: PCR em tempo real',
  },
  {
    campo: 'linhas',
    label: 'Linhas de pesquisa',
    dica: 'Temas em que a pessoa atua.',
    placeholder: 'Ex.: Bioinsumos agrícolas',
  },
]

const VAZIO = {
  nome: '',
  email: '',
  papel: 'pesquisador',
  titulacao: '',
  instituicao: 'AC2 Microbiologia',
  disponibilidade: 'parcial',
  competencias: [],
  tecnicas: [],
  linhas: [],
  experiencia: '',
  formacoes: [],
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
  const [alterado, setAlterado] = useState(false)
  const [confirmarSaida, setConfirmarSaida] = useState(false)

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
    setAlterado(true)
  }

  useEffect(() => {
    if (!alterado) return undefined

    const avisar = (evento) => {
      evento.preventDefault()
      evento.returnValue = ''
    }

    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [alterado])

  const cancelar = () => {
    if (alterado) setConfirmarSaida(true)
    else navigate('/rede')
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

      setAlterado(false)
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
            Adicione pesquisadores à rede institucional, informe suas
            qualificações e competências e permita que o sistema identifique
            possíveis correspondências com oportunidades de pesquisa. O acesso à
            plataforma pode ser concedido separadamente.
          </p>
        </div>
      </header>

      <p className="proposta__legenda">Campos com * são obrigatórios.</p>

      <form className="console-form" onSubmit={enviar} noValidate>
        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Identificação</h2>
              <p className="perfil-card__description">
                O convite de acesso vai para o e-mail informado.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">
                Nome <span aria-hidden="true">*</span>
              </span>
              <input
                type="text"
                className="admin-input"
                autoComplete="name"
                aria-required="true"
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
              <span className="admin-field__label">
                E-mail <span aria-hidden="true">*</span>
              </span>
              <input
                type="email"
                className="admin-input"
                autoComplete="email"
                aria-required="true"
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

              <div className="admin-field admin-field--info">
                <label className="admin-field__label" htmlFor="campo-rede-instituicao">
                  Instituição
                </label>
                <div
                  id="campo-rede-instituicao"
                  className="admin-field__valor"
                  aria-readonly="true"
                  aria-describedby="dica-instituicao"
                >
                  {valores.instituicao}
                </div>
                <span id="dica-instituicao" className="admin-field__hint">
                  O vínculo institucional vem do cadastro de organizações.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Qualificação</h2>
              <p className="perfil-card__description">
                A titulação ajuda o sistema a identificar o nível de formação dos
                profissionais e considerar os critérios de qualificação definidos
                para cada oportunidade.
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
                  <option value="">Selecione a titulação</option>
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
                placeholder="Projetos relevantes, áreas de atuação, técnicas usadas e tempo de experiência."
              />
            </label>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Formação acadêmica</h2>
              <p className="perfil-card__description">
                Cursos concluídos ou em andamento, com a instituição e o nível.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <ListaDeFormacoes values={valores.formacoes} onChange={alterar('formacoes')} />
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">O que o matching compara</h2>
              <p className="perfil-card__description descricao-una-linha">
                O matching compara estas listas com as competências necessárias de cada oportunidade.
              </p>
              <p className="admin-field__hint" role="note">
                Técnicas e Linhas de Pesquisa aparecem após preencher Competências.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            {LISTAS_DO_MATCHING.every(({ campo }) => valores[campo].length === 0) ? (
              <p className="admin-field__hint" role="note">
                Sem nenhuma das três listas, a pessoa entra na rede, mas
                dificilmente aparece nas sugestões.
              </p>
            ) : null}

            {LISTAS_DO_MATCHING.filter(({ campo }) => {
              if (campo === 'competencias') return true;
              if (campo === 'tecnicas') return valores.competencias.length > 0;
              if (campo === 'linhas') return valores.tecnicas.length > 0;
              return false;
            }).map((lista) => (
              <div key={lista.campo} className="admin-field">
                <span className="admin-field__label">{lista.label}</span>
                <span className="admin-field__hint">{lista.dica}</span>
                <ListaEditavel
                  label={lista.label}
                  placeholder={lista.placeholder}
                  values={valores[lista.campo]}
                  onChange={alterar(lista.campo)}
                  avisoQuandoVazia={false}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="perfil-card perfil-card--acesso-plataforma">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Acesso à plataforma</h2>
              <p className="perfil-card__description">
                Cadastro na rede e acesso à plataforma são passos separados.
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
                aria-describedby="efeito-do-acesso"
              />
              <span>
                {temAcesso
                  ? 'Esta pessoa já tem login na plataforma'
                  : `Enviar o convite de acesso ao ${editando ? 'salvar' : 'cadastrar'}`}
              </span>
            </label>
            {temAcesso ? null : (
              <p id="efeito-do-acesso" className="admin-field__hint" role="status">
                {valores.liberarAcesso
                  ? 'A conta é criada, e o convite de primeiro acesso sai para o e-mail informado.'
                  : 'A pessoa entra na rede e já pode ser sugerida pelo matching, mas só entra na plataforma depois que o acesso for liberado.'}
              </p>
            )}
          </div>
        </section>

        {erroEnvio ? (
          <div className="admin-callout" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">{erroEnvio}</p>
          </div>
        ) : null}

        <footer className="console-form__footer">
          <button type="button" className="admin-btn admin-btn--outline" onClick={cancelar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="admin-btn"
            disabled={salvando || !valores.nome.trim() || !valores.email.trim()}
          >
            <Icone icon={editando ? appIcons.save : appIcons.addUser} />
            {salvando
              ? 'Gravando...'
              : (editando ? 'Salvar cadastro' : 'Cadastrar na rede')}
          </button>
        </footer>
      </form>

      {confirmarSaida ? (
        <AdminModal
          title="Sair sem salvar?"
          description="O que você preencheu neste cadastro será perdido."
          onClose={() => setConfirmarSaida(false)}
          size="sm"
          footer={
            <>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setConfirmarSaida(false)}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                onClick={() => {
                  setAlterado(false)
                  navigate('/rede')
                }}
              >
                Sair sem salvar
              </button>
            </>
          }
        />
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
