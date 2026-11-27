import { useCallback, useEffect, useId, useState } from 'react'
import AdminModal from '../../../components/console/AdminModal'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import { separarDescricao } from '../../../lib/lacunas'
import {
  gravarContatosSuporte,
  importarCriteriosPreAnalise,
  lerContatosSuporte,
  lerSituacaoDaBasePipe,
  listarCriteriosPreAnalise,
  restaurarContatosSuporte,
} from '../../../services/pdConnectApi'

const NORMAS_DO_PIPE = 'https://fapesp.br/pipe/normas'

const ORDEM_DAS_DIMENSOES = [
  'desafio_tecnologico',
  'inovacao',
  'plano_pesquisa',
  'equipe_supervisao',
  'infraestrutura',
  'viabilidade',
]

const BLOCOS_DA_CHAMADA = {
  A: { rotulo: 'Projeto', resumo: 'O projeto em si: objetivos, plano, método, prazo e propriedade intelectual.' },
  B: { rotulo: 'Equipe', resumo: 'Quem vai executar: liderança, capacidade técnica e complementaridade.' },
  C: { rotulo: 'Mercado', resumo: 'Quem se beneficia, quem compraria a solução e como ela chega ao mercado.' },
  D: { rotulo: 'Bolsas', resumo: 'As bolsas pedidas: justificativa, quantidade e elegibilidade.' },
  E: { rotulo: 'Orçamento', resumo: 'Se o orçamento combina com os objetivos e paga pesquisa, não produção.' },
  F: { rotulo: 'Empresa', resumo: 'A empresa proponente: infraestrutura, equipe própria e histórico.' },
}

function plural(total, singular, varios) {
  return `${total} ${total === 1 ? singular : varios}`
}

function posicaoDaDimensao(dimensao) {
  const posicao = ORDEM_DAS_DIMENSOES.indexOf(dimensao)

  return posicao === -1 ? ORDEM_DAS_DIMENSOES.length : posicao
}

function agruparPorDimensao(criterios) {
  const grupos = new Map()

  criterios.forEach((criterio) => {
    if (!grupos.has(criterio.dimensao)) {
      grupos.set(criterio.dimensao, {
        dimensao: criterio.dimensao,
        rotulo: criterio.dimensao_rotulo,
        itens: [],
      })
    }

    grupos.get(criterio.dimensao).itens.push(criterio)
  })

  return [...grupos.values()]
    .sort((a, b) => posicaoDaDimensao(a.dimensao) - posicaoDaDimensao(b.dimensao))
    .map((grupo) => ({
      ...grupo,
      itens: [...grupo.itens].sort((a, b) =>
        a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })
      ),
    }))
}

function blocosPresentes(criterios) {
  return [...new Set(criterios.map((criterio) => criterio.codigo.charAt(0).toUpperCase()))]
    .filter((letra) => BLOCOS_DA_CHAMADA[letra])
    .sort()
}

function LegendaDosCodigos({ criterios }) {
  const letras = blocosPresentes(criterios)

  if (letras.length === 0) return null

  return (
    <details className="criterios__painel">
      <summary className="criterios__painel-resumo">
        <Icone icon={appIcons.info} />
        O que significam os códigos A1, B2…?
        <Icone icon={appIcons.disclosure} className="criterios__painel-seta" />
      </summary>

      <div className="criterios__legenda-corpo">
        <p>
          A letra corresponde aos itens a) a f) dos critérios de análise das normas
          do PIPE, e o número é a ordem dentro de cada item.
        </p>

        <dl className="criterios__legenda-letras">
          {letras.map((letra) => (
            <div key={letra}>
              <dt>{`${letra} · ${BLOCOS_DA_CHAMADA[letra].rotulo}`}</dt>
              <dd>{BLOCOS_DA_CHAMADA[letra].resumo}</dd>
            </div>
          ))}
        </dl>

        <p>
          O código está aqui porque a pré-análise o usa para ligar cada lacuna ao
          critério certo. Nas lacunas e no relatório ele aparece entre parênteses,
          depois do nome, como em <em>Metodologia adequada (A3)</em>.
        </p>

        <p>
          Esta tela agrupa os critérios pelas seis dimensões da pré-análise, e não
          pelas partes da chamada. Por isso letras diferentes podem cair no mesmo
          grupo.
        </p>
      </div>
    </details>
  )
}

function formatarData(iso) {
  const [ano, mes, dia] = String(iso || '').split('-')

  return dia ? `${dia}/${mes}/${ano}` : ''
}

function rotuloDaAtivacao({ versao_do_arquivo: arquivo, versao_em_uso: emUso }) {
  return arquivo === emUso ? `Aplicar mudanças da ${arquivo}` : `Ativar versão ${arquivo}`
}

function textoDaPendencia({ versao_do_arquivo: arquivo, versao_em_uso: emUso }) {
  if (!emUso) {
    return `A versão ${arquivo} dos critérios está pronta para ativar. Enquanto não houver versão ativa, a pré-análise fica indisponível.`
  }

  if (arquivo !== emUso) {
    return `A versão ${arquivo} dos critérios está pronta para ativar. Até você ativar, as pré-análises continuam usando a ${emUso}.`
  }

  return `Há correções no texto dos critérios da ${emUso} prontas para aplicar. Até você aplicar, vale o texto anterior.`
}


function SituacaoDaBase({ situacao, onAtivar }) {
  if (!situacao.disponivel) {
    return (
      <div className="admin-callout admin-callout--alerta" role="status">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">
          Os critérios não estão disponíveis no sistema. Avise a equipe de
          desenvolvimento do P&amp;D Connect.
        </p>
      </div>
    )
  }

  if (situacao.pendente) {
    return (
      <div className="admin-callout admin-callout--alerta" role="status">
        <Icone icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">{textoDaPendencia(situacao)}</p>
        <button type="button" className="admin-btn" onClick={onAtivar}>
          <Icone icon={appIcons.sync} />
          {rotuloDaAtivacao(situacao)}
        </button>
      </div>
    )
  }

  const revisao = situacao.revisao_prevista

  if (revisao?.data && revisao.vencida) {
    return (
      <div className="admin-callout admin-callout--alerta" role="status">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <div className="admin-callout__text">
          <p className="criterios__previsao">Revisão pendente desde {formatarData(revisao.data)}</p>
          <p>
            Os critérios em uso podem não refletir as regras mais recentes do PIPE.
            Quem faz a revisão é a equipe de desenvolvimento do P&amp;D Connect;
            quando ela ficar pronta, a versão nova aparece aqui para você ativar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-callout">
      <Icone icon={appIcons.info} className="admin-callout__icon" />
      <div className="admin-callout__text">
        <p>
          A equipe de desenvolvimento do P&amp;D Connect atualiza estes critérios
          quando a FAPESP muda as regras do PIPE. Você não precisa editar nada: a
          versão nova aparece aqui para você ativar.
        </p>
      </div>
    </div>
  )
}

function ConfirmacaoDeAtivacao({ situacao, ativando, onCancelar, onConfirmar }) {
  const {
    versao_do_arquivo: arquivo,
    versao_em_uso: emUso,
    novos,
    alterados,
    removidos,
    sem_dimensao: semDimensao,
  } = situacao

  const efeito = arquivo === emUso
    ? `O texto dos critérios da ${arquivo} é atualizado, inclusive no relatório das pré-análises já feitas com ela.`
    : emUso
      ? `As próximas pré-análises passam a usar a versão ${arquivo}. As pré-análises já feitas continuam com a ${emUso}, como foram feitas.`
      : `As pré-análises passam a usar a versão ${arquivo}.`

  const mudancas = [
    ['Entra', 'Entram', novos],
    ['Muda de texto', 'Mudam de texto', alterados],
    ['Sai', 'Saem', removidos],
  ].filter(([, , itens]) => itens.length > 0)

  const nomes = (itens) => itens.map(({ codigo, titulo }) => (titulo ? `${titulo} (${codigo})` : codigo)).join(', ')

  return (
    <AdminModal
      title={`${rotuloDaAtivacao(situacao)}?`}
      description={efeito}
      size="sm"
      onClose={onCancelar}
      footer={
        <>
          <button type="button" className="admin-btn admin-btn--outline" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={onConfirmar}
            disabled={ativando || semDimensao.length > 0}
          >
            {ativando ? 'Ativando...' : rotuloDaAtivacao(situacao)}
          </button>
        </>
      }
    >
      {mudancas.map(([singular, varios, itens]) => (
        <p key={singular} className="guarda-saida__nota">
          {emUso
            ? `${itens.length === 1 ? singular : varios} ${itens.length}: ${nomes(itens)}`
            : `${itens.length === 1 ? singular : varios} ${plural(itens.length, 'critério', 'critérios')}.`}
        </p>
      ))}

      {semDimensao.length > 0 ? (
        <div className="admin-callout admin-callout--alerta criterios__bloqueio" role="alert">
          <Icone icon={appIcons.warning} className="admin-callout__icon" />
          <p className="admin-callout__text">
            {`${semDimensao.join(', ')} ainda não ${semDimensao.length === 1 ? 'tem' : 'têm'} dimensão na pré-análise e ${semDimensao.length === 1 ? 'ficaria' : 'ficariam'} de fora. Peça à equipe de desenvolvimento do P&D Connect para ajustar o sistema antes de ativar.`}
          </p>
        </div>
      ) : null}
    </AdminModal>
  )
}

function CriteriosDaPreAnalise({ showToast }) {
  const [criterios, setCriterios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [situacao, setSituacao] = useState(null)
  const [erroDaSituacao, setErroDaSituacao] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [ativando, setAtivando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')

    try {
      setCriterios(await listarCriteriosPreAnalise())
    } catch (falha) {
      setErro(falha?.message || 'Não foi possível ler os critérios.')
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarSituacao = useCallback(async () => {
    try {
      setSituacao(await lerSituacaoDaBasePipe())
      setErroDaSituacao('')
    } catch (falha) {
      setSituacao(null)
      setErroDaSituacao(falha?.message || 'Não foi possível verificar se há versão nova dos critérios.')
    }
  }, [])

  useEffect(() => {
    carregar()
    carregarSituacao()
  }, [carregar, carregarSituacao])

  const fecharConfirmacao = useCallback(() => setConfirmando(false), [])

  const ativar = async () => {
    const mesmaVersao = situacao.versao_do_arquivo === situacao.versao_em_uso
    setAtivando(true)

    try {
      const { versao } = await importarCriteriosPreAnalise()
      setConfirmando(false)
      await Promise.all([carregar(), carregarSituacao()])
      showToast(
        mesmaVersao
          ? `Texto dos critérios da ${versao} atualizado.`
          : `Versão ${versao} ativada. As próximas pré-análises passam a usá-la.`
      )
    } catch (falha) {
      setConfirmando(false)
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível ativar a versão.', 'error')
    } finally {
      setAtivando(false)
    }
  }

  const versao = criterios[0]?.versao || null
  const grupos = agruparPorDimensao(criterios)

  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h3 className="perfil-card__title">Critérios da pré-análise PIPE/FAPESP</h3>
          <p className="perfil-card__description">
            Perguntas que a pré-análise usa para avaliar cada oportunidade. Seguem
            as regras do PIPE, da FAPESP, e não são editados nesta tela.
          </p>
          <p className="perfil-card__description">
            <a
              className="criterios__link"
              href={NORMAS_DO_PIPE}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver as normas do PIPE no site da FAPESP
              <Icone icon={appIcons.external} />
            </a>
          </p>
        </div>
      </header>

      <div className="perfil-card__body">
        {carregando ? (
          <p className="console-vazio" role="status">
            Carregando os critérios...
          </p>
        ) : null}

        {erro ? (
          <p className="console-vazio" role="alert">
            {erro}
          </p>
        ) : null}

        {!carregando && !erro && criterios.length === 0 ? (
          <p className="console-vazio">
            Nenhum critério carregado. A pré-análise só fica disponível depois
            de ativar uma versão.
          </p>
        ) : null}

        {versao ? (
          <p className="criterios__resumo">
            <span className="criterios__versao">Versão {versao} em uso</span>
            <span>
              {plural(criterios.length, 'critério', 'critérios')} em{' '}
              {plural(grupos.length, 'dimensão', 'dimensões')}
            </span>
            {situacao?.chamada ? <span>Baseada na {situacao.chamada}</span> : null}
          </p>
        ) : null}

        {situacao ? (
          <SituacaoDaBase situacao={situacao} onAtivar={() => setConfirmando(true)} />
        ) : null}

        {erroDaSituacao ? (
          <p className="console-vazio" role="alert">
            {erroDaSituacao}
          </p>
        ) : null}

        {versao ? (
          <details className="criterios__painel">
            <summary className="criterios__painel-resumo">
              <Icone icon={appIcons.view} />
              {criterios.length === 1
                ? `Ver o critério da ${versao}`
                : `Ver os ${criterios.length} critérios da ${versao}`}
              <Icone icon={appIcons.disclosure} className="criterios__painel-seta" />
            </summary>

            <div className="criterios__painel-corpo">
              <LegendaDosCodigos criterios={criterios} />

              <div className="criterios__grupos">
                {grupos.map((grupo) => (
                  <section key={grupo.dimensao} className="criterios__grupo">
                    <h4 className="criterios__grupo-titulo">
                      {grupo.rotulo}
                      <span className="criterios__grupo-total">{grupo.itens.length}</span>
                    </h4>

                    <ul className="criterios__lista">
                      {grupo.itens.map((criterio) => {
                        const { titulo, pergunta } = separarDescricao(criterio.descricao)

                        return (
                          <li key={criterio.id_criterio} className="criterios__item">
                            <div className="criterios__cabeca">
                              <p className="criterios__titulo">{titulo}</p>
                              <span className="criterios__codigo">{criterio.codigo}</span>
                            </div>
                            {pergunta ? <p className="criterios__pergunta">{pergunta}</p> : null}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </div>

      {confirmando && situacao ? (
        <ConfirmacaoDeAtivacao
          situacao={situacao}
          ativando={ativando}
          onCancelar={fecharConfirmacao}
          onConfirmar={ativar}
        />
      ) : null}
    </section>
  )
}

const CONTATO_VAZIO = { nome: '', email: '', papel: '' }

function assinatura(contatos) {
  return JSON.stringify(contatos.map(({ nome, email, papel }) => [nome, email, papel]))
}

function indiceDoEncarregado(contatos) {
  return contatos.findIndex((contato) => /encarregad/i.test(contato.papel || ''))
}

function validar(contatos) {
  const erros = {}

  contatos.forEach((contato, indice) => {
    if (!contato.nome.trim()) {
      erros[indice] = { campo: 'nome', mensagem: 'Informe o nome do contato.' }
    } else if (!contato.email.trim()) {
      erros[indice] = { campo: 'email', mensagem: 'Informe o e-mail.' }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email.trim())) {
      erros[indice] = { campo: 'email', mensagem: 'E-mail inválido.' }
    }
  })

  return erros
}

export default function ParametrosSection() {
  const { toast, showToast } = useToast()
  const idDoErro = useId()

  const [contatos, setContatos] = useState([])
  const [salvos, setSalvos] = useState([])
  const [carregandoContatos, setCarregandoContatos] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [erros, setErros] = useState({})
  const [confirmandoRestauro, setConfirmandoRestauro] = useState(false)

  useEffect(() => {
    let ativo = true

    lerContatosSuporte()
      .then((lista) => {
        if (!ativo) return
        setContatos(lista)
        setSalvos(lista)
      })
      .catch((falha) => {
        if (ativo) showToast(falha?.message || 'Não foi possível carregar os contatos.', 'error')
      })
      .finally(() => {
        if (ativo) setCarregandoContatos(false)
      })

    return () => {
      ativo = false
    }
  }, [showToast])

  const alterado = assinatura(contatos) !== assinatura(salvos)
  const listaPadrao = salvos.length > 0 && salvos.every((contato) => contato.padrao)
  const encarregado = indiceDoEncarregado(contatos)
  const encarregadoSalvo = salvos[indiceDoEncarregado(salvos)]

  const alterar = (indice, campo) => (event) => {
    const { value } = event.target

    setContatos((atual) =>
      atual.map((contato, i) => (i === indice ? { ...contato, [campo]: value } : contato))
    )
    setErros((atual) => ({ ...atual, [indice]: undefined }))
  }

  const adicionar = () => setContatos((atual) => [...atual, { ...CONTATO_VAZIO }])

  const remover = (indice) => {
    setContatos((atual) => atual.filter((_, i) => i !== indice))
    setErros({})
  }

  const descartar = () => {
    setContatos(salvos)
    setErros({})
    showToast('Alterações descartadas. Os contatos salvos continuam valendo.', 'info')
  }

  const salvar = async (event) => {
    event.preventDefault()

    if (contatos.length === 0) {
      showToast('Deixe ao menos um contato: é o que a tela de acesso restrito oferece.', 'error')
      return
    }

    const encontrados = validar(contatos)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    setGravando(true)

    try {
      const gravados = await gravarContatosSuporte(
        contatos.map(({ nome, email, papel }) => ({
          nome: nome.trim(),
          email: email.trim(),
          papel: papel.trim(),
        }))
      )
      setContatos(gravados)
      setSalvos(gravados)
      showToast('Contatos de suporte atualizados.')
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível salvar os contatos.', 'error')
    } finally {
      setGravando(false)
    }
  }

  const fecharConfirmacao = useCallback(() => setConfirmandoRestauro(false), [])

  const restaurar = async () => {
    setConfirmandoRestauro(false)
    setGravando(true)

    try {
      const padrao = await restaurarContatosSuporte()
      setContatos(padrao)
      setSalvos(padrao)
      setErros({})
      showToast('Contatos restaurados para o padrão da AC2.')
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível restaurar os contatos.', 'error')
    } finally {
      setGravando(false)
    }
  }

  const campoInvalido = (indice, campo) => erros[indice]?.campo === campo

  const descricaoDoCampo = (indice, campo) =>
    campoInvalido(indice, campo) ? `${idDoErro}-${indice}` : undefined

  return (
    <div className="admin-section">
      <header className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Parâmetros</h2>
          <p className="admin-section__description">
            Informações que aparecem em várias telas da plataforma. O que você
            salvar aqui passa a valer na hora para todos.
          </p>
        </div>
      </header>

      <form className="perfil-card" onSubmit={salvar} noValidate>
        <header className="perfil-card__header">
          <div>
            <h3 className="perfil-card__title">Contatos de suporte</h3>
            <p className="perfil-card__description">
              É o que a tela de <strong>Acesso restrito</strong> oferece a quem
              esbarra numa área fora do seu perfil. Sem contato ali, a pessoa fica
              sem saída.
            </p>
            <p className="perfil-card__description">
              O encarregado de dados é um Administrador da AC2. Para publicar o nome
              e o e-mail dele, escreva &quot;Encarregado de dados&quot; em{' '}
              <strong>Do que cuida</strong>. O contato passa a aparecer na página de
              privacidade.
            </p>
          </div>

          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => setConfirmandoRestauro(true)}
            disabled={gravando || carregandoContatos || listaPadrao}
            title={listaPadrao ? 'Os contatos já são os padrão da AC2.' : undefined}
          >
            <Icone icon={appIcons.reset} />
            Restaurar contatos padrão
          </button>
        </header>

        <div className="perfil-card__body">
          {carregandoContatos ? (
            <p className="console-vazio" role="status">
              Carregando os contatos...
            </p>
          ) : null}

          {contatos.map((contato, indice) => (
            <fieldset className="parametros-contato" key={indice}>
              <legend className="parametros-contato__legenda">
                Contato {indice + 1}
                {indice === encarregado ? (
                  <>
                    {' '}
                    <span className="parametros-contato__selo">
                      <Icone icon={appIcons.view} />
                      Aparece na página de privacidade
                    </span>
                  </>
                ) : null}
              </legend>

              <label className="admin-field">
                <span className="admin-field__label">Nome</span>
                <input
                  type="text"
                  className="admin-input"
                  value={contato.nome}
                  onChange={alterar(indice, 'nome')}
                  placeholder="Ex.: Núcleo de P&D — AC2"
                  aria-invalid={campoInvalido(indice, 'nome')}
                  aria-describedby={descricaoDoCampo(indice, 'nome')}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">E-mail</span>
                <input
                  type="email"
                  className="admin-input"
                  value={contato.email}
                  onChange={alterar(indice, 'email')}
                  placeholder="suporte@ac2microbiologia.com.br"
                  aria-invalid={campoInvalido(indice, 'email')}
                  aria-describedby={descricaoDoCampo(indice, 'email')}
                />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">Do que cuida</span>
                <input
                  type="text"
                  className="admin-input"
                  value={contato.papel}
                  onChange={alterar(indice, 'papel')}
                  placeholder="Ex.: Contas, perfis e permissões"
                />
              </label>

              <button
                type="button"
                className="admin-btn admin-btn--ghost parametros-contato__remover"
                onClick={() => remover(indice)}
                aria-label={`Remover contato ${contato.nome || indice + 1}`}
                title="Remover contato"
              >
                <Icone icon={appIcons.remove} />
              </button>

              {erros[indice] ? (
                <span
                  id={`${idDoErro}-${indice}`}
                  className="admin-field__error parametros-contato__erro"
                  role="alert"
                >
                  {erros[indice].mensagem}
                </span>
              ) : null}
            </fieldset>
          ))}

          {!carregandoContatos && contatos.length === 0 ? (
            <p className="console-vazio">
              Nenhum contato cadastrado. A tela de acesso restrito ficaria sem
              ninguém a quem recorrer.
            </p>
          ) : null}

          {alterado ? (
            <div className="admin-callout" role="status">
              <Icone icon={appIcons.warning} className="admin-callout__icon" />
              <p className="admin-callout__text">
                Há alterações não salvas nos contatos. Até você salvar, a tela de
                acesso restrito continua mostrando a lista anterior.
              </p>
            </div>
          ) : null}

          <div className="console-form__footer">
            <button type="button" className="admin-btn admin-btn--outline" onClick={adicionar}>
              <Icone icon={appIcons.addUser} />
              Adicionar contato
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--outline"
              onClick={descartar}
              disabled={!alterado || gravando}
              title="Voltar para os contatos que estão salvos."
            >
              Descartar
            </button>
            <button
              type="submit"
              className="admin-btn"
              disabled={!alterado || gravando || carregandoContatos}
            >
              <Icone icon={appIcons.save} />
              {gravando ? 'Salvando...' : 'Salvar contatos'}
            </button>
          </div>
        </div>
      </form>

      <CriteriosDaPreAnalise showToast={showToast} />

      {confirmandoRestauro ? (
        <AdminModal
          title="Restaurar contatos padrão?"
          description={
            'A lista gravada é apagada e a tela de acesso restrito volta a mostrar ' +
            'os contatos padrão da AC2. Vale na hora, sem passar pelo Salvar.'
          }
          size="sm"
          onClose={fecharConfirmacao}
          footer={
            <>
              <button type="button" className="admin-btn admin-btn--outline" onClick={fecharConfirmacao}>
                Cancelar
              </button>
              <button type="button" className="admin-btn admin-btn--danger" onClick={restaurar}>
                Restaurar contatos padrão
              </button>
            </>
          }
        >
          {encarregadoSalvo ? (
            <p className="guarda-saida__nota">
              O contato do encarregado de dados, {encarregadoSalvo.nome}, sai da
              página de privacidade.
            </p>
          ) : null}
          {alterado ? (
            <p className="guarda-saida__nota">
              O que você mudou e ainda não salvou também se perde.
            </p>
          ) : null}
        </AdminModal>
      ) : null}

      <AdminToast toast={toast} />
    </div>
  )
}
