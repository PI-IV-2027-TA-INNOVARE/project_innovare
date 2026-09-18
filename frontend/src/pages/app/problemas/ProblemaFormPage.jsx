import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BackLink from '../../../components/console/BackLink'
import GuardaDeSaida from '../../../components/console/GuardaDeSaida'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { useRascunho } from '../../../lib/rascunho'
import { criarOportunidade } from '../../../services/pdConnectApi'
import './ProblemasPage.scss'

const VAZIO = {
  titulo: '',
  resumo: '',
  contexto: '',
  resultadoEsperado: '',
}

const LIMITE_RESUMO = 400

function validar(valores) {
  const erros = {}

  if (!valores.titulo.trim()) {
    erros.titulo = 'Informe um título para o problema.'
  }

  if (!valores.resumo.trim()) {
    erros.resumo = 'Descreva o problema em poucas linhas.'
  } else if (valores.resumo.trim().length > LIMITE_RESUMO) {
    erros.resumo = `O resumo passa de ${LIMITE_RESUMO} caracteres.`
  }

  return erros
}

export default function ProblemaFormPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const identificador = user?.email || user?.displayName

  const { valores, setValores, alterado, rascunhoEm, descartar, limpar } = useRascunho(
    'problema', identificador, VAZIO
  )

  const [erros, setErros] = useState({})
  const [anexos, setAnexos] = useState([])
  const [saindoPara, setSaindoPara] = useState(null)
  const [erroEnvio, setErroEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)

  const sujo = alterado || anexos.length > 0

  const alterarCampo = (campo) => (event) => {
    const { value } = event.target
    setValores((atual) => ({ ...atual, [campo]: value }))
    setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const escolherAnexos = (event) => {
    setAnexos(Array.from(event.target.files || []).map((arquivo) => arquivo.name))
  }

  const descartarRascunho = () => {
    descartar()
    setAnexos([])
    setErros({})
  }

  const tentarSair = (destino) => (event) => {
    if (!sujo) return

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

  const enviar = async (event) => {
    event.preventDefault()

    const encontrados = validar(valores)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    const contexto = [
      valores.contexto.trim(),
      valores.resultadoEsperado.trim()
        ? `Resultado esperado: ${valores.resultadoEsperado.trim()}`
        : '',
    ].filter(Boolean).join('\n\n')

    setEnviando(true)
    setErroEnvio('')

    try {
      const criado = await criarOportunidade({
        titulo: valores.titulo.trim(),
        resumo: valores.resumo.trim(),
        contexto,
      })

      limpar()
      showToast(
        `Problema ${criado?.codigo || ''} cadastrado. A AC2 vai analisar e retornar por aqui.`.replace('  ', ' ')
      )

      window.setTimeout(() => navigate('/problemas'), 600)
    } catch (problema) {
      setErroEnvio(problema?.message || 'Não foi possível cadastrar o problema.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="console problemas-page">
      <header className="problemas-page__header">
        <div>
          <BackLink to="/problemas" onClick={tentarSair('/problemas')}>
            Voltar para meus problemas
          </BackLink>

          <p className="console-kicker">Novo problema externo</p>
          <h1 className="problemas-page__title">Cadastrar problema</h1>
          <p className="problemas-page__description">
            Descreva o desafio com as suas palavras. Quem estrutura a proposta
            científica é o Núcleo de P&amp;D da AC2 — aqui basta o problema real.
          </p>
        </div>
      </header>

      {rascunhoEm ? (
        <div className="admin-callout" role="status">
          <Icone icon={appIcons.history} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Rascunho recuperado deste navegador, de{' '}
            {formatarUltimoAcesso(rascunhoEm).toLowerCase()}. Continue de onde
            parou ou{' '}
            <button type="button" className="link-button" onClick={descartarRascunho}>
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
              <h2 className="perfil-card__title">Quem está cadastrando</h2>
              <p className="perfil-card__description">
                O problema fica vinculado à sua organização. Só você e o Núcleo de
                P&amp;D enxergam este registro.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">Organização demandante</span>
              <input
                type="text"
                className="admin-input"
                value={user?.displayName || ''}
                readOnly
                aria-readonly="true"
              />
            </label>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">O problema</h2>
              <p className="perfil-card__description">
                Título e resumo são obrigatórios. O resto ajuda a AC2 a entender o
                contexto sem precisar voltar a você.
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
                placeholder="Ex.: Contaminação microbiana na linha de envase"
                aria-invalid={Boolean(erros.titulo)}
                aria-describedby={erros.titulo ? 'erro-problema-titulo' : undefined}
              />
              {erros.titulo ? (
                <span id="erro-problema-titulo" className="admin-field__error" role="alert">
                  {erros.titulo}
                </span>
              ) : null}
            </label>

            <div className="admin-field">
              <label className="admin-field__label" htmlFor="campo-resumo-problema">
                Resumo do problema
              </label>
              <textarea
                id="campo-resumo-problema"
                className="admin-input admin-input--area"
                rows={4}
                value={valores.resumo}
                onChange={alterarCampo('resumo')}
                placeholder="O que acontece hoje, onde acontece e desde quando."
                aria-invalid={Boolean(erros.resumo)}
                aria-describedby={
                  ['contador-resumo-problema', erros.resumo ? 'erro-problema-resumo' : null]
                    .filter(Boolean).join(' ')
                }
              />
              <span id="contador-resumo-problema" className="admin-field__hint">
                {valores.resumo.trim().length} de {LIMITE_RESUMO} caracteres
              </span>
              {erros.resumo ? (
                <span id="erro-problema-resumo" className="admin-field__error" role="alert">
                  {erros.resumo}
                </span>
              ) : null}
            </div>

            <label className="admin-field">
              <span className="admin-field__label">Contexto e tentativas anteriores</span>
              <textarea
                className="admin-input admin-input--area"
                rows={3}
                value={valores.contexto}
                onChange={alterarCampo('contexto')}
                placeholder="O que já foi tentado, com que resultado, e o que restringe a solução."
              />
            </label>

            <label className="admin-field">
              <span className="admin-field__label">Resultado esperado</span>
              <textarea
                className="admin-input admin-input--area"
                rows={3}
                value={valores.resultadoEsperado}
                onChange={alterarCampo('resultadoEsperado')}
                placeholder="Como a sua organização saberia que o problema foi resolvido."
              />
            </label>
          </div>
        </section>

        <section className="perfil-card">
          <header className="perfil-card__header">
            <div>
              <h2 className="perfil-card__title">Anexos</h2>
              <p className="perfil-card__description">
                Laudos, fotos, relatórios de ensaio — o que ajudar a AC2 a
                entender o problema.
              </p>
            </div>
          </header>

          <div className="perfil-card__body">
            <label className="admin-field">
              <span className="admin-field__label">Selecionar arquivos</span>
              <input
                type="file"
                className="admin-input"
                multiple
                onChange={escolherAnexos}
              />
            </label>

            {anexos.length > 0 ? (
              <ul className="problema-anexos">
                {anexos.map((nome) => (
                  <li className="problema-anexos__item" key={nome}>
                    <Icone icon={appIcons.folder} aria-hidden="true" />
                    {nome}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="admin-callout" role="note">
              <Icone icon={appIcons.info} className="admin-callout__icon" />
              <p className="admin-callout__text">
                Nenhum arquivo sai do seu computador nesta versão: a lista acima é
                só a sua seleção, e ela não entra no rascunho. O envio real, os
                tipos aceitos e a política de retenção entram com o módulo de
                anexos.
              </p>
            </div>
          </div>
        </section>

        {erroEnvio ? (
          <div className="admin-callout" role="alert">
            <Icone icon={appIcons.warning} className="admin-callout__icon" />
            <p className="admin-callout__text">{erroEnvio}</p>
          </div>
        ) : null}

        <footer className="console-form__footer">
          <Link
            className="admin-btn admin-btn--outline"
            to="/problemas"
            onClick={tentarSair('/problemas')}
          >
            Cancelar
          </Link>
          <button type="submit" className="admin-btn" disabled={enviando}>
            <Icone icon={appIcons.done} />
            {enviando ? 'Cadastrando...' : 'Cadastrar problema'}
          </button>
        </footer>
      </form>

      <GuardaDeSaida
        aberto={Boolean(saindoPara)}
        titulo="Sair sem cadastrar?"
        nota={
          anexos.length > 0
            ? 'A seleção de anexos não é guardada — você precisa escolher os arquivos de novo ao voltar.'
            : 'Você pode retomar este cadastro a qualquer momento, neste mesmo navegador.'
        }
        onContinuar={() => setSaindoPara(null)}
        onDescartar={sairDescartando}
        onSair={sairGuardando}
      />

      <AdminToast toast={toast} />
    </div>
  )
}
