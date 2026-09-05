import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Avatar } from '../../../components/console/ConsoleTable'
import { AdminToast, useToast } from '../../../components/console/toast'
import { useAuth } from '../../../context/AuthContext'
import { appIcons } from '../../../lib/icons'
import { roleLabel } from '../../../lib/roles'
import {
  DISPONIBILIDADES,
  TITULACOES,
  completudeDoPerfil,
  disponibilidadeLabel,
  situacaoLabel,
  titulacaoLabel,
} from '../rede/redeData'
import ListaEditavel from './ListaEditavel'
import './PerfilPage.scss'

/**
 * Meu Perfil do Pesquisador (RF03 / RN-A05).
 *
 * O enquadramento decide a tela: **não é currículo, é a entrada do matching**.
 * Cada campo preenchido vira feature comparada em RF06/RF07, e é por isso que a
 * completude aparece no topo — sem isso ninguém preenche.
 *
 * Nem tudo aqui é dele. Nome, e-mail, vínculo e situação na rede pertencem ao
 * Supervisor, que gere a rede (RF02) — esses campos aparecem **em leitura, não
 * escondidos** (PLANO_IMPLEMENTACAO.md §4.4): esconder faz o pesquisador achar
 * que o dado não existe e abrir chamado.
 *
 * Grava em estado local; o endpoint é da Fase 2.
 */

const PERFIL_INICIAL = {
  titulacao: 'mestrado',
  formacao: 'Mestrado em Microbiologia Aplicada — UNICAMP, 2021',
  competencias: ['Microbiologia de alimentos', 'Fermentação'],
  tecnicas: ['PCR em tempo real'],
  linhas: ['Bioinsumos agrícolas'],
  experiencia: '',
  disponibilidade: 'parcial',
  observacoes: '',
}

/** Campos que o Supervisor mantém — o pesquisador lê, não edita. */
const VINCULO = {
  instituicao: 'AC2 Microbiologia',
  papel: 'Pesquisador',
  situacao: 'ativo',
}

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
            <FontAwesomeIcon icon={appIcons.view} />
            Somente leitura
          </span>
        ) : null}
      </header>

      {/*
        `fieldset` neutro de layout: o navegador cascateia `disabled` para todo
        campo descendente, então não há lista de campos a manter em sincronia.
      */}
      <fieldset className="perfil-card__body" disabled={readOnly}>
        {children}
      </fieldset>
    </section>
  )
}

export default function PerfilPage() {
  const { user } = useAuth()
  const { toast, showToast } = useToast()

  const [perfil, setPerfil] = useState(PERFIL_INICIAL)

  const nome = user?.displayName || 'Pesquisador'
  const email = user?.email || 'pesquisador@ac2microbiologia.com.br'

  const completude = useMemo(() => completudeDoPerfil(perfil), [perfil])

  const alterar = (campo) => (valor) => {
    setPerfil((atual) => ({ ...atual, [campo]: valor }))
    showToast('Perfil salvo automaticamente.')
  }

  const alterarCampo = (campo) => (event) => alterar(campo)(event.target.value)

  return (
    <div className="console perfil-page">
      <header className="perfil-page__header">
        <div className="perfil-page__identity">
          <Avatar nome={nome} size="lg" />

          <div>
            <p className="admin-page__breadcrumb">
              AC2 Microbiologia <span aria-hidden="true">·</span> Rede interna
            </p>
            <h1 className="perfil-page__name">{nome}</h1>
            <p className="perfil-page__meta">
              <span className="role-badge role-badge--pesquisador">
                {roleLabel(user?.role) || 'Pesquisador'}
              </span>
              <span className={`status-badge status-badge--${VINCULO.situacao}`}>
                <span className="status-badge__dot" aria-hidden="true" />
                {situacaoLabel(VINCULO.situacao)}
              </span>
              {VINCULO.instituicao}
            </p>
          </div>
        </div>

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
      </header>

      <div className="admin-callout" role="note">
        <FontAwesomeIcon icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O que você declara aqui é o que o matching compara com as competências
          necessárias de cada oportunidade. Interface preliminar: as alterações
          valem para esta sessão.
        </p>
      </div>

      <div className="perfil-grid">
        <Secao
          title="Identificação"
          description="Mantida pelo Núcleo de P&D — não há autocadastro na plataforma (RN-A04)."
          readOnly
          hint="Nome e e-mail são credencial de acesso; fale com o Supervisor para alterá-los."
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
          description="Quem gere a rede interna é o Supervisor (RF02)."
          readOnly
          hint="Vínculo e situação na rede são mantidos pelo Supervisor."
        >
          <label className="admin-field">
            <span className="admin-field__label">Instituição</span>
            <input type="text" className="admin-input" value={VINCULO.instituicao} readOnly />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Papel na rede</span>
            <input type="text" className="admin-input" value={VINCULO.papel} readOnly />
          </label>
        </Secao>

        <Secao
          title="Formação e titulação"
          description="A titulação pesa no matching de supervisão (RF07)."
        >
          <label className="admin-field">
            <span className="admin-field__label">Titulação</span>
            <select
              className="admin-input"
              value={perfil.titulacao}
              onChange={alterarCampo('titulacao')}
            >
              {TITULACOES.map((titulacao) => (
                <option key={titulacao.id} value={titulacao.id}>{titulacao.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Formação</span>
            <input
              type="text"
              className="admin-input"
              value={perfil.formacao}
              onChange={alterarCampo('formacao')}
              placeholder="Curso, instituição e ano"
            />
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
      </div>

      <p className="perfil-page__footer">
        Titulação atual: <strong>{titulacaoLabel(perfil.titulacao)}</strong>. Os campos
        mantidos pelo Núcleo de P&amp;D aparecem em leitura para que você saiba o
        que está registrado — para alterá-los, fale com seu Supervisor.
      </p>

      <AdminToast toast={toast} />
    </div>
  )
}
