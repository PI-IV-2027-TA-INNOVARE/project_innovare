import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../../../components/console/ConsoleTable'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES, roleLabel } from '../../../lib/roles'
import {
  alterarSenha,
  atualizarMeuPerfil,
  obterMeuPerfil,
} from '../../../services/pdConnectApi'
import {
  DISPONIBILIDADES,
  TITULACOES,
  completudeDoPerfil,
  disponibilidadeLabel,
  perfilDaApi,
  titulacaoLabel,
} from '../rede/redeData'
import ListaEditavel from './ListaEditavel'
import './PerfilPage.scss'

const PAPEIS_DA_REDE = [ROLES.PESQUISADOR, ROLES.SUPERVISOR]

const PERFIL_VAZIO = {
  titulacao: '',
  disponibilidade: 'parcial',
  experiencia: '',
  competencias: [],
  tecnicas: [],
  linhas: [],
}

const SENHA_VAZIA = { senhaAtual: '', novaSenha: '', confirmarSenha: '' }

function Secao({ title, description, children, readOnly, hint }) {
  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">{title}</h2>
          {description ? <p className="perfil-card__description">{description}</p> : null}
        </div>

        {readOnly ? (
          <span className="perfil-card__lock" title={hint}>
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        ) : null}
      </header>

      <fieldset className="perfil-card__body" disabled={readOnly}>
        {children}
      </fieldset>
    </section>
  )
}

function TrocaDeSenha({ demonstracao, onConcluido }) {
  const [valores, setValores] = useState(SENHA_VAZIA)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const alterar = (campo) => (event) => {
    const { value } = event.target
    setValores((atual) => ({ ...atual, [campo]: value }))
    setErro('')
  }

  const enviar = async (event) => {
    event.preventDefault()

    if (!valores.senhaAtual || !valores.novaSenha) {
      setErro('Informe a senha atual e a nova senha.')
      return
    }

    if (valores.novaSenha.length < 8) {
      setErro('A nova senha precisa de pelo menos 8 caracteres.')
      return
    }

    if (valores.novaSenha !== valores.confirmarSenha) {
      setErro('A confirmação não corresponde à nova senha.')
      return
    }

    setSalvando(true)

    try {
      await alterarSenha({
        senha_atual: valores.senhaAtual,
        nova_senha: valores.novaSenha,
        confirmar_senha: valores.confirmarSenha,
      })

      setValores(SENHA_VAZIA)
      onConcluido('Senha alterada. Use a nova no próximo acesso.')
    } catch (problema) {
      setErro(problema?.message || 'Não foi possível alterar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  if (demonstracao) {
    return (
      <p className="perfil-card__note">
        A troca de senha não funciona no ambiente de demonstração, que não tem
        credencial real para verificar.
      </p>
    )
  }

  return (
    <form onSubmit={enviar} noValidate>
      <label className="admin-field">
        <span className="admin-field__label">Senha atual</span>
        <input
          type="password"
          className="admin-input"
          autoComplete="current-password"
          value={valores.senhaAtual}
          onChange={alterar('senhaAtual')}
        />
      </label>

      <div className="admin-form__row">
        <div className="admin-field">
          <label className="admin-field__label" htmlFor="campo-nova-senha">Nova senha</label>
          <input
            id="campo-nova-senha"
            type="password"
            className="admin-input"
            autoComplete="new-password"
            value={valores.novaSenha}
            onChange={alterar('novaSenha')}
            aria-describedby="dica-nova-senha"
          />
          <span id="dica-nova-senha" className="admin-field__hint">
            Pelo menos 8 caracteres.
          </span>
        </div>

        <label className="admin-field">
          <span className="admin-field__label">Confirmar nova senha</span>
          <input
            type="password"
            className="admin-input"
            autoComplete="new-password"
            value={valores.confirmarSenha}
            onChange={alterar('confirmarSenha')}
          />
        </label>
      </div>

      {erro ? (
        <p className="admin-field__error" role="alert">{erro}</p>
      ) : null}

      <button type="submit" className="admin-btn" disabled={salvando}>
        <Icone icon={appIcons.done} />
        {salvando ? 'Alterando...' : 'Alterar senha'}
      </button>
    </form>
  )
}

export default function PerfilPage() {
  const { user, isMockAuth } = useAuth()
  const { toast, showToast } = useToast()

  const nome = user?.displayName || 'Minha conta'
  const email = user?.email || ''
  const papel = roleLabel(user?.role)
  const organizacao = user?.organizacao?.nome || 'AC2 Microbiologia'
  const naRede = PAPEIS_DA_REDE.includes(user?.role)

  const [perfil, setPerfil] = useState(PERFIL_VAZIO)
  const [carregandoPerfil, setCarregandoPerfil] = useState(naRede)
  const [semCadastro, setSemCadastro] = useState(false)
  const [erroPerfil, setErroPerfil] = useState('')
  const [alterado, setAlterado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!naRede) return undefined

    let ativo = true

    obterMeuPerfil()
      .then((dados) => {
        if (!ativo) return
        setPerfil(perfilDaApi(dados))
        setAlterado(false)
      })
      .catch((falha) => {
        if (!ativo) return

        if (falha?.status === 404) {
          setSemCadastro(true)
        } else {
          setErroPerfil(falha?.message || 'Não foi possível carregar o seu perfil.')
        }
      })
      .finally(() => {
        if (ativo) setCarregandoPerfil(false)
      })

    return () => {
      ativo = false
    }
  }, [naRede])

  const completude = useMemo(() => completudeDoPerfil(perfil), [perfil])

  const alterar = (campo) => (valor) => {
    setPerfil((atual) => ({ ...atual, [campo]: valor }))
    setAlterado(true)
  }

  const alterarCampo = (campo) => (event) => alterar(campo)(event.target.value)

  const salvarPerfil = async () => {
    setSalvando(true)
    setErroPerfil('')

    try {
      const dados = await atualizarMeuPerfil({
        titulacao_codigo: perfil.titulacao || null,
        disponibilidade: perfil.disponibilidade,
        experiencia: perfil.experiencia,
        competencias: perfil.competencias,
        tecnicas: perfil.tecnicas,
        linhas: perfil.linhas,
      })

      setPerfil(perfilDaApi(dados))
      setAlterado(false)
      showToast('Perfil salvo. O matching passa a comparar com estes dados.')
    } catch (falha) {
      setErroPerfil(falha?.message || 'Não foi possível salvar o perfil.')
    } finally {
      setSalvando(false)
    }
  }

  const mostrarProfissional = naRede && !semCadastro

  return (
    <div className="console perfil-page">
      <header className="perfil-page__header">
        <div className="perfil-page__identity">
          <Avatar nome={nome} size="lg" />

          <div>
            <p className="admin-page__breadcrumb">
              {organizacao} <span aria-hidden="true">·</span> Minha conta
            </p>
            <h1 className="perfil-page__name">{nome}</h1>
            <p className="perfil-page__meta">
              <span className={`role-badge role-badge--${user?.role || 'pesquisador'}`}>
                {papel}
              </span>
              {user?.lastAccess ? (
                <span className="user-cell__meta">
                  Último acesso {formatarUltimoAcesso(Date.parse(user.lastAccess)).toLowerCase()}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {mostrarProfissional ? (
          <div className="perfil-completude">
            <div className="perfil-completude__top">
              <span className="perfil-completude__label">Perfil completo</span>
              <strong className="perfil-completude__value">{completude.percentual}%</strong>
            </div>

            <div
              className="perfil-completude__bar"
              role="progressbar"
              aria-valuenow={completude.percentual}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Completude do perfil"
            >
              <span style={{ width: `${completude.percentual}%` }} />
            </div>

            <p className="perfil-completude__hint">
              {completude.faltando.length === 0
                ? 'Todas as dimensões preenchidas — seu perfil entra completo no matching.'
                : `Falta preencher: ${completude.faltando.map((item) => item.label).join(', ')}.`}
            </p>
          </div>
        ) : null}
      </header>

      <div className="perfil-grid">
        <Secao
          title="Identificação"
          description="Nome e e-mail são a sua credencial de acesso."
          readOnly
          hint="Para alterar nome ou e-mail, fale com quem administra as contas."
        >
          <label className="admin-field">
            <span className="admin-field__label">Nome</span>
            <input type="text" className="admin-input" value={nome} readOnly />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">E-mail</span>
            <input type="email" className="admin-input" value={email} readOnly />
          </label>
        </Secao>

        <Secao
          title="Vínculo"
          description="Como você entra na plataforma e em nome de quem."
          readOnly
          hint="Papel e organização são mantidos por quem administra as contas."
        >
          <label className="admin-field">
            <span className="admin-field__label">Papel</span>
            <input type="text" className="admin-input" value={papel} readOnly />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Organização</span>
            <input type="text" className="admin-input" value={organizacao} readOnly />
          </label>
        </Secao>

        <Secao
          title="Senha"
          description="Troque quando quiser. A nova senha vale no próximo acesso."
        >
          <TrocaDeSenha demonstracao={isMockAuth} onConcluido={showToast} />
        </Secao>

        {carregandoPerfil ? (
          <p className="perfil-card__note" role="status">Carregando o seu perfil...</p>
        ) : null}

        {mostrarProfissional ? (
          <>
            <section className="perfil-card perfil-card--destaque">
              <header className="perfil-card__header">
                <div>
                  <h2 className="perfil-card__title">Perfil profissional</h2>
                  <p className="perfil-card__description">
                    É o que o matching compara com as competências necessárias de
                    cada oportunidade. As alterações valem depois que você salvar.
                  </p>
                </div>

                <button
                  type="button"
                  className="admin-btn"
                  onClick={salvarPerfil}
                  disabled={!alterado || salvando}
                >
                  <Icone icon={appIcons.save} />
                  {salvando ? 'Salvando...' : 'Salvar perfil'}
                </button>
              </header>

              {erroPerfil ? (
                <div className="perfil-card__body">
                  <p className="admin-field__error" role="alert">{erroPerfil}</p>
                </div>
              ) : null}
            </section>

            <Secao
              title="Titulação"
              description="Vocabulário controlado — é por ele que o matching de supervisão filtra."
            >
              <label className="admin-field">
                <span className="admin-field__label">Titulação</span>
                <select
                  className="admin-input"
                  value={perfil.titulacao}
                  onChange={alterarCampo('titulacao')}
                >
                  <option value="">Não informada</option>
                  {TITULACOES.map((titulacao) => (
                    <option key={titulacao.id} value={titulacao.id}>{titulacao.label}</option>
                  ))}
                </select>
              </label>
            </Secao>

            <Secao
              title="Disponibilidade"
              description="É o que torna a sugestão realista: competência sem disponibilidade produz equipe que não se sustenta."
            >
              <label className="admin-field">
                <span className="admin-field__label">Disponibilidade atual</span>
                <select
                  className="admin-input"
                  value={perfil.disponibilidade}
                  onChange={alterarCampo('disponibilidade')}
                >
                  {DISPONIBILIDADES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>

              <p className="perfil-card__note">
                Hoje: <strong>{disponibilidadeLabel(perfil.disponibilidade)}</strong>
              </p>
            </Secao>

            <Secao
              title="Competências"
              description="Conhecimento científico e técnico que você domina."
            >
              <ListaEditavel
                label="Competências"
                placeholder="Ex.: Microbiologia de alimentos"
                values={perfil.competencias}
                onChange={alterar('competencias')}
              />
            </Secao>

            <Secao title="Técnicas" description="Métodos e equipamentos que você opera.">
              <ListaEditavel
                label="Técnicas"
                placeholder="Ex.: PCR em tempo real"
                values={perfil.tecnicas}
                onChange={alterar('tecnicas')}
              />
            </Secao>

            <Secao title="Linhas de pesquisa" description="Temas em que você atua.">
              <ListaEditavel
                label="Linhas de pesquisa"
                placeholder="Ex.: Bioinsumos agrícolas"
                values={perfil.linhas}
                onChange={alterar('linhas')}
              />
            </Secao>

            <Secao
              title="Experiência"
              description="Projetos e tempo de atuação — texto livre."
            >
              <label className="admin-field">
                <span className="admin-field__label">Resumo da experiência</span>
                <textarea
                  className="admin-input admin-input--area"
                  rows={4}
                  value={perfil.experiencia}
                  onChange={alterarCampo('experiencia')}
                  placeholder="Projetos relevantes, tempo de atuação, resultados."
                />
              </label>
            </Secao>
          </>
        ) : null}
      </div>

      {mostrarProfissional ? (
        <p className="perfil-page__footer">
          Titulação atual:{' '}
          <strong>{perfil.titulacao ? titulacaoLabel(perfil.titulacao) : 'não informada'}</strong>.
          Sem competência declarada você entra na rede, mas fica invisível para as
          sugestões de equipe.
        </p>
      ) : null}

      {semCadastro ? (
        <p className="perfil-page__footer">
          Sua conta ainda não está vinculada a um cadastro na rede interna. Quem
          faz esse vínculo é o Supervisor — até lá, o matching não enxerga você.
        </p>
      ) : null}

      {!naRede ? (
        <p className="perfil-page__footer">
          O perfil profissional — titulação, competências e disponibilidade — é
          mantido por quem integra a rede interna da AC2. Sua conta não precisa
          dele.
        </p>
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
