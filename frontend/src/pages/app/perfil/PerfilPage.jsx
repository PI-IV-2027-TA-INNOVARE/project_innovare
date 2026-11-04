import { useEffect, useMemo, useState } from 'react'
import CampoDeSenha, { RegrasDaSenha } from '../../../components/CampoDeSenha'
import { Avatar } from '../../../components/console/ConsoleTable'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { Icone, appIcons } from '../../../lib/icons'
import { formatarUltimoAcesso } from '../../../lib/people'
import { ROLES, isAdministrador, roleLabel } from '../../../lib/roles'
import { errosDosCampos, problemaNaConfirmacao, problemaNaNovaSenha } from '../../../lib/senha'
import { mascararTelefone, telefoneValido } from '../../../lib/telefone'
import {
  alterarSenha,
  atualizarMeuPerfil,
  atualizarTelefone,
  obterMeuPerfil,
} from '../../../services/pdConnectApi'
import {
  DISPONIBILIDADES,
  TITULACOES,
  completudeDoPerfil,
  formacoesParaApi,
  perfilDaApi,
  titulacaoLabel,
} from '../rede/redeData'
import ListaDeFormacoes from '../rede/ListaDeFormacoes'
import ListaEditavel from './ListaEditavel'
import MeusDados from './MeusDados'
import './PerfilPage.scss'

const PAPEIS_DA_REDE = [ROLES.PESQUISADOR, ROLES.SUPERVISOR]

const PERFIL_VAZIO = {
  titulacao: '',
  disponibilidade: 'parcial',
  experiencia: '',
  competencias: [],
  tecnicas: [],
  linhas: [],
  formacoes: [],
}

const SENHA_VAZIA = { senhaAtual: '', novaSenha: '', confirmarSenha: '' }

const CAMPOS_DA_SENHA = {
  senha_atual: 'senhaAtual',
  nova_senha: 'novaSenha',
  confirmar_senha: 'confirmarSenha',
}

const IDS_DA_SENHA = {
  senhaAtual: 'campo-senha-atual',
  novaSenha: 'campo-nova-senha',
  confirmarSenha: 'campo-confirmar-senha',
}

const REGRAS_DA_NOVA_SENHA = 'regras-nova-senha'

const EFEITO_DA_DISPONIBILIDADE = {
  integral:
    'Você pode se dedicar a um projeto novo. Nas sugestões de equipe, a disponibilidade conta inteira a seu favor.',
  parcial:
    'Você pode assumir parte de um projeto, junto com outras atividades. Nas sugestões de equipe, a disponibilidade conta em parte a seu favor.',
  pontual:
    'Você pode ajudar em consultas e tarefas curtas. Nas sugestões de equipe, a disponibilidade conta pouco a seu favor.',
  indisponivel:
    'Você não pode assumir projetos agora. Você continua na rede, mas a disponibilidade deixa de contar a seu favor nas sugestões de equipe.',
}

const TITULO_PROFISSIONAL = 'titulo-perfil-profissional'

function Secao({ title, description, children, nivel = 2, className = '' }) {
  const Titulo = `h${nivel}`

  return (
    <section className={`perfil-card ${className}`.trim()}>
      <header className="perfil-card__header">
        <div>
          <Titulo className="perfil-card__title">{title}</Titulo>
          {description ? <p className="perfil-card__description">{description}</p> : null}
        </div>
      </header>

      <div className="perfil-card__body">{children}</div>
    </section>
  )
}

function TrocaDeSenha({ onConcluido }) {
  const [valores, setValores] = useState(SENHA_VAZIA)
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [salvando, setSalvando] = useState(false)

  const alterar = (campo) => (valor) => {
    setValores((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => ({ ...atual, [campo]: '' }))
    setErroGeral('')
  }

  const apontar = (encontrados) => {
    setErros(encontrados)

    const primeiro = Object.keys(IDS_DA_SENHA).find((campo) => encontrados[campo])

    if (primeiro) document.getElementById(IDS_DA_SENHA[primeiro])?.focus()
  }

  const enviar = async (event) => {
    event.preventDefault()

    const encontrados = Object.fromEntries(
      Object.entries({
        senhaAtual: valores.senhaAtual ? '' : 'Informe a senha atual.',
        novaSenha: problemaNaNovaSenha(valores.novaSenha),
        confirmarSenha: problemaNaConfirmacao(valores.novaSenha, valores.confirmarSenha),
      }).filter(([, mensagem]) => mensagem)
    )

    if (Object.keys(encontrados).length > 0) {
      apontar(encontrados)
      return
    }

    setSalvando(true)
    setErros({})
    setErroGeral('')

    try {
      await alterarSenha({
        senha_atual: valores.senhaAtual,
        nova_senha: valores.novaSenha,
        confirmar_senha: valores.confirmarSenha,
      })

      setValores(SENHA_VAZIA)
      onConcluido('Senha alterada. Use a nova no próximo acesso.')
    } catch (problema) {
      const doServidor = errosDosCampos(problema, CAMPOS_DA_SENHA)

      if (Object.keys(doServidor).length > 0) {
        apontar(doServidor)
      } else {
        setErroGeral(problema?.message || 'Não foi possível alterar a senha.')
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="perfil-senha" onSubmit={enviar} noValidate>
      <div className="perfil-senha__grade">
        <CampoDeSenha
          id={IDS_DA_SENHA.senhaAtual}
          rotulo="Senha atual"
          valor={valores.senhaAtual}
          onChange={alterar('senhaAtual')}
          autoComplete="current-password"
          erro={erros.senhaAtual}
        />

        <CampoDeSenha
          id={IDS_DA_SENHA.novaSenha}
          rotulo="Nova senha"
          valor={valores.novaSenha}
          onChange={alterar('novaSenha')}
          autoComplete="new-password"
          erro={erros.novaSenha}
          descricao={REGRAS_DA_NOVA_SENHA}
        />

        <RegrasDaSenha id={REGRAS_DA_NOVA_SENHA} />

        <CampoDeSenha
          id={IDS_DA_SENHA.confirmarSenha}
          rotulo="Confirmar nova senha"
          valor={valores.confirmarSenha}
          onChange={alterar('confirmarSenha')}
          autoComplete="new-password"
          erro={erros.confirmarSenha}
        />
      </div>

      {erroGeral ? (
        <p className="admin-field__error" role="alert">{erroGeral}</p>
      ) : null}

      <button type="submit" className="admin-btn" disabled={salvando}>
        <Icone icon={appIcons.done} />
        {salvando ? 'Alterando...' : 'Alterar senha'}
      </button>
    </form>
  )
}

function TelefoneDeContato({ inicial, onConcluido }) {
  const [telefone, setTelefone] = useState(() => mascararTelefone(inicial))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const enviar = async (event) => {
    event.preventDefault()

    if (!telefoneValido(telefone)) {
      setErro('Telefone incompleto. Informe o DDD e o número, como (19) 99876-5432.')
      return
    }

    setSalvando(true)

    try {
      const dados = await atualizarTelefone(telefone)
      setTelefone(mascararTelefone(dados?.telefone ?? telefone))
      onConcluido(telefone ? 'Telefone salvo.' : 'Telefone removido.')
    } catch (problema) {
      setErro(problema?.message || 'Não foi possível salvar o telefone.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form className="perfil-contato" onSubmit={enviar} noValidate>
      <div className="admin-field">
        <label className="admin-field__label" htmlFor="campo-telefone">Telefone</label>

        <div className="perfil-contato__linha">
          <input
            id="campo-telefone"
            type="tel"
            inputMode="numeric"
            className="admin-input"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={(event) => {
              setTelefone(mascararTelefone(event.target.value))
              setErro('')
            }}
            aria-describedby="dica-telefone"
          />

          <button type="submit" className="admin-btn" disabled={salvando}>
            <Icone icon={appIcons.save} />
            {salvando ? 'Salvando...' : 'Salvar telefone'}
          </button>
        </div>

        <span id="dica-telefone" className="admin-field__hint">
          Opcional. Só você e quem administra as contas veem este número.
        </span>
      </div>

      {erro ? (
        <p className="admin-field__error" role="alert">{erro}</p>
      ) : null}
    </form>
  )
}

export default function PerfilPage() {
  const { user } = useAuth()
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
        formacoes: formacoesParaApi(perfil.formacoes),
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
            {email ? <p className="perfil-page__email">{email}</p> : null}
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
            <p className="perfil-page__nota">
              {isAdministrador(user)
                ? 'Para mudar nome, e-mail, papel ou organização, use Administração › Usuários.'
                : 'Nome, e-mail, papel e organização são mantidos por quem administra as contas.'}
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

      {user?.role === ROLES.DEMANDANTE ? (
        <Secao
          className="perfil-card--faixa"
          title="Contato"
          description="Um telefone para a equipe da AC2 falar com a sua empresa."
        >
          <TelefoneDeContato inicial={user?.telefone || ''} onConcluido={showToast} />
        </Secao>
      ) : null}

      <div className="perfil-grid">
        <Secao
          title="Senha"
          description="Troque quando quiser. A nova senha vale no próximo acesso."
        >
          <TrocaDeSenha onConcluido={showToast} />
        </Secao>

        <Secao
          className="perfil-card--meus-dados"
          title="Meus dados"
          description="Baixe uma cópia do que a plataforma guarda sobre você, ou peça a exclusão da conta."
        >
          <MeusDados aoConcluir={showToast} />
        </Secao>

        {carregandoPerfil ? (
          <p className="perfil-card__note perfil-grid__aviso" role="status">
            Carregando o seu perfil...
          </p>
        ) : null}

        {mostrarProfissional ? (
          <section
            className="perfil-grupo"
            aria-labelledby={TITULO_PROFISSIONAL}
          >
            <header className="perfil-grupo__header">
              <div>
                <h2 id={TITULO_PROFISSIONAL} className="perfil-card__title">
                  Perfil profissional
                </h2>
                <p className="perfil-card__description">
                  É com estes dados que a plataforma sugere quem chamar para a
                  equipe de cada oportunidade. As alterações valem depois que
                  você salvar.
                </p>
              </div>

              <div className="perfil-grupo__acao">
                {alterado ? (
                  <span className="perfil-grupo__pendente" role="status">
                    Alterações não salvas
                  </span>
                ) : null}

                <button
                  type="button"
                  className="admin-btn"
                  onClick={salvarPerfil}
                  disabled={!alterado || salvando}
                >
                  <Icone icon={appIcons.save} />
                  {salvando ? 'Salvando...' : 'Salvar perfil'}
                </button>
              </div>
            </header>

            {erroPerfil ? (
              <p className="admin-field__error" role="alert">{erroPerfil}</p>
            ) : null}

            <div className="perfil-grupo__grid">
              <Secao
                nivel={3}
                title="Titulação"
                description="O seu maior título acadêmico."
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

                <p className="perfil-card__note">
                  Aparece para o Supervisor entre os motivos de cada sugestão de
                  equipe e, quando duas pessoas empatam, desempata a favor de quem
                  tem a titulação maior.
                  {user?.role === ROLES.SUPERVISOR
                    ? ' Como Supervisor, a partir do mestrado você vem na frente nas vagas de supervisão.'
                    : ''}
                </p>
              </Secao>

              <Secao
                nivel={3}
                title="Disponibilidade"
                description="Quanto tempo você tem hoje para entrar em novos projetos."
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
                  {EFEITO_DA_DISPONIBILIDADE[perfil.disponibilidade]}
                </p>

                <p className="perfil-card__note">
                  O Supervisor vê a disponibilidade que você declarar junto de cada
                  sugestão de equipe.
                </p>
              </Secao>

              <Secao
                nivel={3}
                title="Experiência"
                description="Projetos de que você participou e há quanto tempo atua. As palavras daqui ajudam a ligar você a oportunidades da sua área."
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

              <Secao
                nivel={3}
                title="Competências"
                description="O que você domina em conhecimento científico e técnico. É comparado com o que cada oportunidade precisa."
              >
                <ListaEditavel
                  label="Competências"
                  placeholder="Ex.: Microbiologia de alimentos"
                  values={perfil.competencias}
                  onChange={alterar('competencias')}
                />
              </Secao>

              <Secao
                nivel={3}
                title="Técnicas"
                description="Métodos e equipamentos que você opera. Também são comparados com o que cada oportunidade precisa."
              >
                <ListaEditavel
                  label="Técnicas"
                  placeholder="Ex.: PCR em tempo real"
                  values={perfil.tecnicas}
                  onChange={alterar('tecnicas')}
                />
              </Secao>

              <Secao
                nivel={3}
                title="Linhas de pesquisa"
                description="Temas em que você pesquisa. Ajudam a ligar você a oportunidades da sua área."
              >
                <ListaEditavel
                  label="Linhas de pesquisa"
                  placeholder="Ex.: Bioinsumos agrícolas"
                  values={perfil.linhas}
                  onChange={alterar('linhas')}
                />
              </Secao>
            </div>

            <Secao
              nivel={3}
              className="perfil-card--larga"
              title="Formação acadêmica"
              description="Cursos concluídos ou em andamento, com a instituição e o nível."
            >
              <ListaDeFormacoes
                values={perfil.formacoes}
                onChange={alterar('formacoes')}
              />
            </Secao>
          </section>
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
