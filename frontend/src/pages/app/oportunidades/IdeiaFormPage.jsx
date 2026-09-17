import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import BackLink from '../../../components/console/BackLink'
import GuardaDeSaida from '../../../components/console/GuardaDeSaida'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { useRascunho } from '../../../lib/rascunho'
import { REDE_EXEMPLO } from '../rede/redeData'
import { origemLabel, situacaoLabel } from './oportunidadesData'
import './OportunidadesPage.scss'

const LIMITE_RESUMO = 400

const SUPERVISORES = REDE_EXEMPLO.filter((pessoa) => pessoa.papel === 'supervisor')

function validar(valores) {
  const erros = {}

  if (!valores.titulo.trim()) {
    erros.titulo = 'Informe um título para a ideia.'
  }

  if (!valores.resumo.trim()) {
    erros.resumo = 'Descreva a ideia em poucas linhas.'
  } else if (valores.resumo.trim().length > LIMITE_RESUMO) {
    erros.resumo = `O resumo passa de ${LIMITE_RESUMO} caracteres.`
  }

  if (!valores.responsavel) {
    erros.responsavel = 'Escolha quem conduz a ideia.'
  }

  return erros
}

export default function IdeiaFormPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const identificador = user?.email || user?.displayName

  const vazio = useMemo(() => {
    const proprio = SUPERVISORES.find((pessoa) => pessoa.nome === user?.displayName)

    return {
      titulo: '',
      resumo: '',
      contexto: '',
      motivacao: '',
      responsavel: (proprio || SUPERVISORES[0])?.nome || '',
    }
  }, [user?.displayName])

  const { valores, setValores, alterado, rascunhoEm, descartar, limpar } = useRascunho(
    'ideia-interna', identificador, vazio
  )

  const [erros, setErros] = useState({})
  const [saindoPara, setSaindoPara] = useState(null)

  const alterarCampo = (campo) => (event) => {
    const { value } = event.target
    setValores((atual) => ({ ...atual, [campo]: value }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const tentarSair = (destino) => (event) => {
    if (!alterado) return

    event.preventDefault()
    setSaindoPara(destino)
  }

  const sairGuardando = () => {
    const destino = saindoPara
    setSaindoPara(null)
    navigate(destino)
  }

  const sairDescartando = () => {
    const destino = saindoPara
    limpar()
    setSaindoPara(null)
    navigate(destino)
  }

  const enviar = (event) => {
    event.preventDefault()

    const encontrados = validar(valores)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    limpar()
    showToast('Ideia interna cadastrada. Ela entra na fila em Entrada.')

    window.setTimeout(() => navigate('/oportunidades'), 600)
  }

  return (
    <div className="console oportunidade-page">
      <header className="oportunidade-page__header">
        <div>
          <BackLink to="/oportunidades" onClick={tentarSair('/oportunidades')}>
            Voltar para as oportunidades
          </BackLink>

          <p className="console-kicker">Nova oportunidade</p>
          <h1 className="oportunidade-page__title">Cadastrar ideia interna</h1>

          <p className="oportunidade-page__meta">
            <span className="origem-badge origem-badge--interna">
              {origemLabel('interna')}
            </span>
            <span className="fluxo-badge fluxo-badge--entrada">
              nasce em {situacaoLabel('entrada')}
            </span>
          </p>

          <p className="oportunidades-page__description">
            Ensaio, produto, processo, tecnologia ou linha de pesquisa que nasce
            dentro da AC2. É a outra porta de entrada do fluxo — a primeira é o
            problema trazido por um Demandante Externo.
          </p>
        </div>
      </header>

      <div className="admin-callout" role="note">
        <FontAwesomeIcon icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          Interface preliminar — o registro não é persistido.
        </p>
      </div>

      {rascunhoEm ? (
        <div className="admin-callout" role="status">
          <FontAwesomeIcon icon={appIcons.history} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Rascunho recuperado deste navegador, de{' '}
            {formatarUltimoAcesso(rascunhoEm).toLowerCase()}. Continue de onde
            parou ou{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                descartar()
                setErros({})
              }}
            >
              descarte o rascunho
            </button>
            .
          </p>
        </div>
      ) : null}

      <form className="console-form" onSubmit={enviar} noValidate>
        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">A ideia</h2>
              <p className="perfil-card__description">
                Título e resumo são obrigatórios. O Copiloto parte deste texto
                para estruturar a proposta — quanto mais concreto, menos
                pergunta orientadora depois.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">Título</span>
              <input
                type="text"
                className="admin-input"
                value={valores.titulo}
                onChange={alterarCampo('titulo')}
                placeholder="Ex.: Cultura starter para queijo artesanal"
                aria-invalid={Boolean(erros.titulo)}
              />
              {erros.titulo ? (
                <span className="admin-field__error" role="alert">{erros.titulo}</span>
              ) : null}
            </label>

            <label className="admin-field">
              <span className="admin-field__label">Resumo da ideia</span>
              <textarea
                className="admin-input admin-input--area"
                rows={4}
                value={valores.resumo}
                onChange={alterarCampo('resumo')}
                placeholder="O que se pretende investigar ou desenvolver, e sobre o que se aplica."
                aria-invalid={Boolean(erros.resumo)}
              />
              <span className="admin-field__hint">
                {valores.resumo.trim().length} de {LIMITE_RESUMO} caracteres
              </span>
              {erros.resumo ? (
                <span className="admin-field__error" role="alert">{erros.resumo}</span>
              ) : null}
            </label>

            <label className="admin-field">
              <span className="admin-field__label">Contexto técnico</span>
              <textarea
                className="admin-input admin-input--area"
                rows={3}
                value={valores.contexto}
                onChange={alterarCampo('contexto')}
                placeholder="Estado da arte conhecido, trabalhos anteriores da casa, restrições."
              />
            </label>

            <label className="admin-field">
              <span className="admin-field__label">Motivação</span>
              <textarea
                className="admin-input admin-input--area"
                rows={3}
                value={valores.motivacao}
                onChange={alterarCampo('motivacao')}
                placeholder="Por que agora, e o que a AC2 ganha se isso avançar."
              />
            </label>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Condução</h2>
              <p className="perfil-card__description">
                Ideia interna não tem organização demandante — ela nasce do
                Núcleo de P&amp;D, e quem responde por ela é um Supervisor.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">Supervisor responsável</span>
              <select
                className="admin-input admin-input--select"
                value={valores.responsavel}
                onChange={alterarCampo('responsavel')}
                aria-invalid={Boolean(erros.responsavel)}
              >
                {SUPERVISORES.map((pessoa) => (
                  <option key={pessoa.id} value={pessoa.nome}>{pessoa.nome}</option>
                ))}
              </select>
              <span className="admin-field__hint">
                A lista vem da rede interna. Só quem está cadastrado como
                Supervisor aparece aqui.
              </span>
              {erros.responsavel ? (
                <span className="admin-field__error" role="alert">{erros.responsavel}</span>
              ) : null}
            </label>
          </div>
        </section>

        <footer className="console-form__footer">
          <Link
            className="admin-btn admin-btn--outline"
            to="/oportunidades"
            onClick={tentarSair('/oportunidades')}
          >
            Cancelar
          </Link>
          <button type="submit" className="admin-btn">
            <FontAwesomeIcon icon={appIcons.done} />
            Cadastrar ideia interna
          </button>
        </footer>
      </form>

      <GuardaDeSaida
        aberto={Boolean(saindoPara)}
        titulo="Sair sem cadastrar?"
        nota="Você pode retomar este cadastro a qualquer momento, neste mesmo navegador."
        onContinuar={() => setSaindoPara(null)}
        onDescartar={sairDescartando}
        onSair={sairGuardando}
      />

      <AdminToast toast={toast} />
    </div>
  )
}
