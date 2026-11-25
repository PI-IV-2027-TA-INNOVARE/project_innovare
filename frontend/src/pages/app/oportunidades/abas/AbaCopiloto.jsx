import { useCallback, useEffect, useId, useState } from 'react'
import { AdminToast, useToast } from '../../../../components/console/toast'
import { useAuth } from '../../../../context/AuthContext'
import { LIMITES_DE_GASTO, explicarMotivoSemIa } from '../../../../lib/glossario'
import { Icone, appIcons } from '../../../../lib/icons'
import { ROLES } from '../../../../lib/roles'
import {
  aceitarSugestaoCopiloto,
  atualizarSinteseCopiloto,
  concluirSessaoCopiloto,
  estruturarComCopiloto,
  iniciarSessaoCopiloto,
  obterEstadoCopiloto,
  responderCopiloto,
} from '../../../../services/pdConnectApi'
import { situacaoEncerrada } from '../etapas'
import { ROTULOS_DOS_ELEMENTOS } from '../oportunidadesData'
import BarraDeAcoes, { ContinuarPara } from './BarraDeAcoes'
import EsperaIA from './EsperaIA'
import EtapaEncerrada from './EtapaEncerrada'
import ProximoPasso from './ProximoPasso'
import {
  ehDaEntrada,
  lerMensagem,
  lerResumo,
  respostaDaEntrada,
  respostasDaEntrada,
} from './resumoDaEntrada'
import '../OportunidadesPage.scss'

const TOTAL_DE_ELEMENTOS = Object.keys(ROTULOS_DOS_ELEMENTOS).length

const ACOES_COM_IA = ['ler', 'responder', 'estruturar']

const rotuloDoElemento = (elemento) => ROTULOS_DOS_ELEMENTOS[elemento] || elemento

const plural = (total, singular, varios) => `${total} ${total === 1 ? singular : varios}`

function rotuloDePontos(total) {
  return total === 1 ? '1 ponto' : `${total} pontos`
}

function Progresso({ preenchidos, paraRevisar }) {
  return (
    <div className="copiloto__indicadores">
      <div className="copiloto__progresso">
        <p className="copiloto__contagem">
          {preenchidos} de {TOTAL_DE_ELEMENTOS} elementos preenchidos
        </p>
        <div
          className="copiloto__barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TOTAL_DE_ELEMENTOS}
          aria-valuenow={preenchidos}
          aria-label="Elementos da proposta preenchidos"
        >
          <span style={{ width: `${(preenchidos / TOTAL_DE_ELEMENTOS) * 100}%` }} />
        </div>
      </div>

      {preenchidos > 0 ? (
        <p className={`copiloto__revisar${paraRevisar > 0 ? ' copiloto__revisar--aberto' : ''}`}>
          {paraRevisar > 0 ? <Icone icon={appIcons.warning} className="copiloto__revisar-icone" /> : null}
          <span className="copiloto__revisar-texto">
            <strong className="copiloto__revisar-total">
              {paraRevisar > 0
                ? `${rotuloDePontos(paraRevisar)} para revisar`
                : 'Nenhum ponto para revisar'}
            </strong>{' '}
            <span className="copiloto__revisar-detalhe">
              {paraRevisar > 0
                ? 'No que já está escrito, segundo a última análise do Copiloto. Preencher não quer dizer pronto.'
                : 'O Copiloto não apontou problema no que já está escrito.'}
            </span>
          </span>
        </p>
      ) : null}
    </div>
  )
}

const PASSOS = [
  'Confira o resumo da entrada.',
  'Responda o que souber e peça a estruturação.',
  'Revise e salve o texto na aba Proposta estruturada.',
]

function Passos({ feitos }) {
  return (
    <ol className="copiloto__passos" aria-label="Como usar o Copiloto">
      {PASSOS.map((passo, indice) => {
        let estado = 'depois'
        if (indice < feitos) estado = 'feito'
        else if (indice === feitos) estado = 'agora'

        return (
          <li
            key={passo}
            className={`copiloto__passo copiloto__passo--${estado}`}
            aria-current={estado === 'agora' ? 'step' : undefined}
          >
            <span className="copiloto__passo-marca" aria-hidden="true">
              {estado === 'feito' ? <Icone icon={appIcons.done} /> : indice + 1}
            </span>
            <span>
              {passo}
              {estado === 'feito' ? <span className="sr-only"> Feito.</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function CamposDoResumo({ texto }) {
  const resumo = lerResumo(texto)
  const campos = [
    ['Problema', resumo.problema],
    ['Contexto', resumo.contexto],
  ].filter(([, valor]) => valor)

  if (campos.length === 0 && resumo.faltas.length === 0) {
    return <p className="copiloto__resumo-texto">{texto}</p>
  }

  return (
    <>
      {resumo.livre ? <p className="copiloto__resumo-texto">{resumo.livre}</p> : null}
      <dl className="copiloto__resumo-campos">
        {campos.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
        {resumo.faltas.length > 0 ? (
          <div>
            <dt>O que falta</dt>
            <dd>
              {plural(resumo.faltas.length, 'pergunta', 'perguntas')}, logo abaixo em Sobre a
              entrada.
            </dd>
          </div>
        ) : null}
      </dl>
    </>
  )
}

function ResumoDaEntrada({ sessao, podeConduzir, ocupado, aoLer, aoReler, aoSalvar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  if (!sessao) {
    if (!podeConduzir) return null

    return (
      <div className="copiloto__bloco copiloto__resumo copiloto__resumo--agora">
        <h3 className="copiloto__subtitulo">Resumo da entrada</h3>
        <p className="copiloto__nota">
          O Copiloto lê a descrição da oportunidade e resume o problema, o
          contexto e o que falta. Você confere e corrige antes de seguir.
        </p>
        <div className="copiloto__acoes">
          <button type="button" className="admin-btn" onClick={aoLer} disabled={ocupado}>
            <Icone icon={appIcons.view} />
            Ler a entrada
          </button>
        </div>
      </div>
    )
  }

  const abrirEdicao = () => {
    setTexto(sessao.sintese || '')
    setEditando(true)
  }

  const salvar = async (event) => {
    event.preventDefault()

    if (await aoSalvar(texto.trim())) setEditando(false)
  }

  const corrigir = (rotulo, classe) => (
    <button type="button" className={classe} onClick={abrirEdicao} disabled={ocupado}>
      <Icone icon={appIcons.edit} />
      {rotulo}
    </button>
  )

  const lerDeNovo = (
    <button
      type="button"
      className="admin-btn admin-btn--outline"
      onClick={aoReler}
      disabled={ocupado}
    >
      <Icone icon={appIcons.sync} />
      Ler a entrada de novo
    </button>
  )

  if (sessao.sintese && sessao.sintese_conferida && !editando) {
    return (
      <details className="copiloto__bloco copiloto__resumo copiloto__detalhes">
        <summary className="copiloto__resumo-cabeca">
          <h3 className="copiloto__subtitulo">Resumo da entrada</h3>
          <span className="copiloto__conferido">
            <Icone icon={appIcons.done} />
            Conferido
          </span>
          <Icone icon={appIcons.disclosure} className="copiloto__seta" />
        </summary>

        <div className="copiloto__elemento-corpo">
          <CamposDoResumo texto={sessao.sintese} />
          <p className="copiloto__nota">
            É deste resumo que o Copiloto parte ao estruturar. Se a entrada mudou, peça
            que ele a leia de novo.
          </p>
          {podeConduzir ? (
            <div className="copiloto__acoes">
              {corrigir('Corrigir o resumo', 'admin-btn admin-btn--outline')}
              {lerDeNovo}
            </div>
          ) : null}
        </div>
      </details>
    )
  }

  const semResumo = !sessao.sintese
  const aConferir = podeConduzir && !sessao.sintese_conferida

  let conteudo = <CamposDoResumo texto={sessao.sintese} />
  if (editando) {
    conteudo = (
      <form className="copiloto__resumo-forma" onSubmit={salvar}>
        <label className="admin-field">
          <span className="admin-field__label">Resumo da entrada</span>
          <textarea
            className="admin-input admin-input--area"
            rows={8}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
          />
          <span className="admin-field__hint">
            O Copiloto usa este resumo para escrever a proposta. Em O que falta, cada
            linha que começa com um traço vira uma pergunta em Sobre a entrada.
          </span>
        </label>
        <div className="copiloto__acoes">
          <button type="submit" className="admin-btn" disabled={ocupado}>
            <Icone icon={appIcons.save} />
            Salvar o resumo
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => setEditando(false)}
            disabled={ocupado}
          >
            Cancelar
          </button>
        </div>
      </form>
    )
  } else if (semResumo) {
    conteudo = (
      <p className="copiloto__nota">
        {podeConduzir
          ? 'O Copiloto não conseguiu ler a entrada. Tente de novo ou escreva você mesmo o problema, o contexto e o que falta.'
          : 'Ainda não há resumo.'}
      </p>
    )
  }

  let acoes = null
  if (podeConduzir && !editando && semResumo) {
    acoes = (
      <div className="copiloto__acoes">
        {corrigir('Escrever o resumo', 'admin-btn')}
        {lerDeNovo}
      </div>
    )
  } else if (aConferir && !editando) {
    acoes = (
      <>
        <p className="copiloto__nota">
          Confira antes de seguir: o Copiloto parte deste resumo para escrever a proposta.
        </p>
        <div className="copiloto__acoes">
          <button
            type="button"
            className="admin-btn"
            onClick={() => aoSalvar(sessao.sintese)}
            disabled={ocupado}
          >
            <Icone icon={appIcons.done} />
            Está certo, usar este resumo
          </button>
          {corrigir('Corrigir o resumo', 'admin-btn admin-btn--outline')}
        </div>
      </>
    )
  }

  return (
    <div className={`copiloto__bloco copiloto__resumo${aConferir ? ' copiloto__resumo--agora' : ''}`}>
      <h3 className="copiloto__subtitulo">Resumo da entrada</h3>
      {conteudo}
      {acoes}
    </div>
  )
}

const chaveDa = (pergunta) => `${pergunta.id}-${pergunta.elemento}`

function semRascunho(rascunhos, chave) {
  return Object.fromEntries(Object.entries(rascunhos).filter(([atual]) => atual !== chave))
}

function elementosDoCopiloto(pendentes, lacunas, perguntas) {
  const ordem = Object.keys(ROTULOS_DOS_ELEMENTOS)
  const citados = [
    ...pendentes,
    ...lacunas.map((lacuna) => lacuna.campo_afetado),
    ...perguntas.map((pergunta) => pergunta.elemento),
  ]
  const fora = citados.filter(
    (elemento, posicao) => !ordem.includes(elemento) && citados.indexOf(elemento) === posicao,
  )

  return [...ordem.filter((elemento) => citados.includes(elemento)), ...fora].map((elemento) => ({
    elemento,
    vazio: pendentes.includes(elemento),
    lacuna: lacunas.find((lacuna) => lacuna.campo_afetado === elemento) || null,
    perguntas: perguntas.filter((pergunta) => pergunta.elemento === elemento),
  }))
}

function Pergunta({ pergunta, rascunho, repetida, podeConduzir, bloqueada, ocupado, aoEscrever }) {
  const chave = chaveDa(pergunta)

  return (
    <li className="copiloto__pergunta">
      {pergunta.origem === 'copiloto' ? (
        <span className="copiloto__origem">Pergunta do Copiloto</span>
      ) : null}
      <p id={`pergunta-${chave}`} className="copiloto__pergunta-texto">
        {pergunta.pergunta}
      </p>
      {pergunta.motivo && !repetida ? (
        <p className="copiloto__pergunta-motivo">{pergunta.motivo}</p>
      ) : null}
      {pergunta.respondida ? (
        <p className="copiloto__respondida">
          <Icone icon={appIcons.done} />
          Respondida: {pergunta.respondida}
        </p>
      ) : null}
      {podeConduzir && !pergunta.respondida ? (
        <textarea
          className="admin-input admin-input--area copiloto__resposta"
          rows={2}
          value={rascunho || ''}
          onChange={(event) => aoEscrever(chave, event.target.value)}
          aria-labelledby={`pergunta-${chave}`}
          placeholder="Sua resposta, se souber. Pode ser curta."
          disabled={ocupado || bloqueada}
        />
      ) : null}
    </li>
  )
}

function ElementoDoCopiloto({
  item,
  abrir,
  rascunhos,
  podeConduzir,
  podeResponder,
  ocupado,
  irPara,
  aoEscrever,
}) {
  const { elemento, vazio, lacuna, perguntas } = item
  const rotulo = rotuloDoElemento(elemento)
  const prontas = perguntas.filter((pergunta) => (rascunhos?.[chaveDa(pergunta)] || '').trim()).length

  let problema = 'O Copiloto tem perguntas sobre o que já está escrito.'
  if (lacuna?.descricao) problema = lacuna.descricao
  else if (vazio) problema = ''

  const contagem = [
    perguntas.length > 0 ? plural(perguntas.length, 'pergunta', 'perguntas') : null,
    prontas > 0 ? plural(prontas, 'resposta pronta', 'respostas prontas') : null,
  ].filter(Boolean).join(' · ')

  return (
    <li className="copiloto__elemento">
      <details className="copiloto__detalhes" open={abrir}>
        <summary className="copiloto__elemento-cabeca">
          {lacuna ? (
            <span className={`copiloto__selo copiloto__selo--${lacuna.severidade}`}>
              {lacuna.severidade_rotulo || 'Lacuna'}
            </span>
          ) : null}
          <span className="copiloto__elemento-texto">
            <span className="copiloto__elemento-nome">
              {rotulo}
              {lacuna?.natureza_rotulo ? ` · ${lacuna.natureza_rotulo}` : ''}
            </span>
            {problema ? <span className="copiloto__elemento-problema">{problema}</span> : null}
          </span>
          {contagem ? <span className="copiloto__elemento-contagem">{contagem}</span> : null}
          <Icone icon={appIcons.disclosure} className="copiloto__seta" />
        </summary>

        <div className="copiloto__elemento-corpo">
          {lacuna?.recomendacao ? (
            <p className="copiloto__lacuna-recomendacao">
              <span className="copiloto__lacuna-rotulo">O que fazer: </span>
              {lacuna.recomendacao}
            </p>
          ) : null}

          {perguntas.length > 0 ? (
            <ul className="copiloto__perguntas">
              {perguntas.map((pergunta) => (
                <Pergunta
                  key={chaveDa(pergunta)}
                  pergunta={pergunta}
                  rascunho={rascunhos?.[chaveDa(pergunta)]}
                  repetida={Boolean(lacuna) && pergunta.motivo === lacuna.descricao}
                  podeConduzir={podeConduzir}
                  bloqueada={!podeResponder}
                  ocupado={ocupado}
                  aoEscrever={aoEscrever}
                />
              ))}
            </ul>
          ) : null}

          {irPara ? (
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--outline copiloto__editar"
              onClick={() => irPara('proposta', elemento)}
              disabled={ocupado}
            >
              <Icone icon={podeConduzir ? appIcons.edit : appIcons.view} />
              {podeConduzir ? 'Editar na proposta' : 'Ver na proposta'}{' '}
              <span className="sr-only">({rotulo})</span>
            </button>
          ) : null}
        </div>
      </details>
    </li>
  )
}

function Elementos({
  itens,
  perguntasDaEntrada,
  baseDisponivel,
  podeConduzir,
  podeResponder,
  ocupado,
  rascunhos,
  irPara,
  aoEscrever,
}) {
  const idDaEntrada = useId()
  const idDaFalta = useId()
  const idDaRevisao = useId()

  if (itens.length === 0 && perguntasDaEntrada.length === 0) return null

  const faltam = itens.filter((item) => item.vazio)
  const paraRevisar = itens.filter((item) => !item.vazio)
  const entradaPendente = perguntasDaEntrada.some((pergunta) => !pergunta.respondida)
  const aberto = podeResponder && !entradaPendente
    ? [...faltam, ...paraRevisar].find((item) => item.perguntas.length > 0)?.elemento
    : null

  const lista = (grupo, id) => (
    <ul className="copiloto__elementos" aria-labelledby={id}>
      {grupo.map((item) => (
        <ElementoDoCopiloto
          key={item.elemento}
          item={item}
          abrir={item.elemento === aberto}
          rascunhos={rascunhos}
          podeConduzir={podeConduzir}
          podeResponder={podeResponder}
          ocupado={ocupado}
          irPara={irPara}
          aoEscrever={aoEscrever}
        />
      ))}
    </ul>
  )

  return (
    <div className="copiloto__bloco">
      <h3 className="copiloto__subtitulo">O que falta e o que revisar</h3>

      {podeConduzir ? (
        <p className="copiloto__nota">
          {podeResponder
            ? 'O Copiloto escreve os elementos mesmo sem respostas. Responda o que só você sabe, como números, prazos e nomes. Nenhuma é obrigatória, e todas vão juntas no envio.'
            : 'Você já pode ler as perguntas. Para responder, confira antes o resumo da entrada.'}
        </p>
      ) : null}

      {!baseDisponivel ? (
        <p className="copiloto__nota" role="status">
          As perguntas orientadoras não estão disponíveis no momento. Você ainda
          pode pedir a estruturação: o Copiloto usa a descrição da oportunidade.
        </p>
      ) : null}

      {perguntasDaEntrada.length > 0 ? (
        <div className="copiloto__apontados">
          <h4 id={idDaEntrada} className="copiloto__apontados-titulo">Sobre a entrada</h4>
          <ul className="copiloto__perguntas copiloto__entrada" aria-labelledby={idDaEntrada}>
            {perguntasDaEntrada.map((pergunta) => (
              <Pergunta
                key={chaveDa(pergunta)}
                pergunta={pergunta}
                rascunho={rascunhos?.[chaveDa(pergunta)]}
                podeConduzir={podeConduzir}
                bloqueada={!podeResponder}
                ocupado={ocupado}
                aoEscrever={aoEscrever}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {faltam.length > 0 ? (
        <div className="copiloto__apontados">
          <h4 id={idDaFalta} className="copiloto__apontados-titulo">Falta escrever</h4>
          {lista(faltam, idDaFalta)}
        </div>
      ) : null}

      {paraRevisar.length > 0 ? (
        <div className="copiloto__apontados">
          <h4 id={idDaRevisao} className="copiloto__apontados-titulo">
            Para revisar no que já está escrito
          </h4>
          {lista(paraRevisar, idDaRevisao)}
        </div>
      ) : null}
    </div>
  )
}

function Sugestoes({ sugestoes, podeConduzir, ocupado, aoAceitar, aoRecusar }) {
  if (sugestoes.length === 0) return null

  return (
    <div className="copiloto__bloco">
      <h3 className="copiloto__subtitulo">Sugestões para o que já está escrito</h3>
      <p className="copiloto__nota">Nada muda na proposta até você aceitar.</p>

      <ul className="copiloto__sugestoes">
        {sugestoes.map((sugestao) => (
          <li key={sugestao.elemento} className="copiloto__sugestao">
            <h4 className="copiloto__grupo-titulo">
              {sugestao.elemento_rotulo || rotuloDoElemento(sugestao.elemento)}
            </h4>
            {sugestao.motivo ? (
              <p className="copiloto__pergunta-motivo">{sugestao.motivo}</p>
            ) : null}
            <p className="copiloto__sugestao-texto">{sugestao.texto_sugerido}</p>

            {podeConduzir ? (
              <div className="copiloto__acoes">
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => aoAceitar(sugestao)}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.done} />
                  Aceitar
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--outline"
                  onClick={() => aoRecusar(sugestao)}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.clear} />
                  Recusar
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const DATA_DA_FALA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function Fala({ mensagem }) {
  const humana = mensagem.autor === 'humano'
  const { origem, pergunta, resposta } = humana
    ? lerMensagem(mensagem.conteudo)
    : { origem: '', pergunta: '', resposta: mensagem.conteudo }

  let sobre = origem || 'Outra informação'
  if (ehDaEntrada(origem)) sobre = 'Sobre a entrada'

  return (
    <li className={`copiloto__fala copiloto__fala--${humana ? 'humano' : 'copiloto'}`}>
      <p className="copiloto__fala-cabeca">
        <span className="copiloto__autor">{humana ? 'Supervisor' : 'Copiloto'}</span>
        {mensagem.criado_em ? (
          <time dateTime={mensagem.criado_em}>{DATA_DA_FALA.format(new Date(mensagem.criado_em))}</time>
        ) : null}
      </p>
      {humana ? (
        <p className="copiloto__pergunta-motivo">{pergunta ? `${sobre}: ${pergunta}` : sobre}</p>
      ) : null}
      <p className="copiloto__conteudo">{resposta}</p>
    </li>
  )
}

function Conversa({ mensagens }) {
  if (mensagens.length === 0) return null

  return (
    <details className="copiloto__bloco copiloto__detalhes">
      <summary className="copiloto__resumo-cabeca">
        <h3 className="copiloto__subtitulo">Conversa com o Copiloto</h3>
        <span className="copiloto__enviadas-total">
          {plural(mensagens.length, 'mensagem', 'mensagens')}
        </span>
        <Icone icon={appIcons.disclosure} className="copiloto__seta" />
      </summary>

      <div className="copiloto__elemento-corpo">
        <ul className="copiloto__conversa">
          {mensagens.map((mensagem) => (
            <Fala key={mensagem.id_mensagem} mensagem={mensagem} />
          ))}
        </ul>
      </div>
    </details>
  )
}

function Resultado({ resultado, irPara }) {
  if (!resultado) return null

  if (resultado.indisponivel && LIMITES_DE_GASTO.includes(resultado.motivo)) {
    return (
      <div className="admin-callout admin-callout--alerta" role="alert">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O Copiloto não foi chamado: {explicarMotivoSemIa(resultado.motivo)}. Escreva
          direto na aba Proposta estruturada.
        </p>
      </div>
    )
  }

  if (resultado.indisponivel) {
    return (
      <div className="admin-callout admin-callout--alerta" role="alert">
        <Icone icon={appIcons.warning} className="admin-callout__icon" />
        <p className="admin-callout__text">
          O Copiloto não respondeu e nada foi preenchido. Tente de novo em alguns
          minutos ou escreva direto na aba Proposta estruturada.
        </p>
      </div>
    )
  }

  if (resultado.preenchidos.length === 0) {
    let texto = 'O Copiloto não encontrou informação suficiente para preencher novos elementos. Responda as perguntas abaixo e tente de novo.'

    if (resultado.sugeriu) {
      texto = 'O Copiloto não preencheu elementos novos. Veja abaixo o que ele sugere mudar no que já está escrito.'
    } else if (resultado.completa) {
      texto = 'A proposta foi reavaliada e o Copiloto não sugeriu mudanças. Confira as lacunas abaixo, se houver.'
    }

    return (
      <div className="admin-callout" role="status">
        <Icone icon={appIcons.info} className="admin-callout__icon" />
        <p className="admin-callout__text">{texto}</p>
      </div>
    )
  }

  return (
    <ProximoPasso
      etapa="proposta"
      irPara={irPara}
      rotulo="Revisar a proposta"
      texto={`O Copiloto preencheu ${resultado.preenchidos.map(rotuloDoElemento).join(', ')}. Leia, ajuste o que precisar e salve na aba Proposta estruturada.`}
    />
  )
}

export default function AbaCopiloto({
  oportunidadeId,
  situacao,
  aoEstruturar,
  aoOcupar,
  aoAlterar,
  irPara,
}) {
  const { user } = useAuth()
  const { toast, showToast } = useToast()
  const idDaExplicacao = useId()

  const encerrada = situacaoEncerrada(situacao)
  const podeConduzir = user?.role === ROLES.SUPERVISOR && !encerrada

  const [estado, setEstado] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [resposta, setResposta] = useState('')
  const [outraAberta, setOutraAberta] = useState(false)
  const [rascunhos, setRascunhos] = useState({})
  const [emAcao, setEmAcao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [sugestoes, setSugestoes] = useState([])
  const idDaOutra = useId()

  const jaRespondidas = respostasDaEntrada(estado?.mensagens || [])
  const perguntasDaEntrada = lerResumo(estado?.sessao?.sintese).faltas.map((pergunta, indice) => ({
    id: `entrada-${indice}`,
    elemento: 'entrada',
    pergunta,
    motivo: '',
    origem: 'entrada',
    respondida: jaRespondidas.get(pergunta) || '',
  }))

  const respondidas = [...perguntasDaEntrada, ...(estado?.perguntas || [])].filter(
    (pergunta) => !pergunta.respondida && (rascunhos[chaveDa(pergunta)] || '').trim(),
  )
  const respostasProntas = respondidas.length + (resposta.trim() ? 1 : 0)
  const temRascunho = respostasProntas > 0

  useEffect(() => {
    aoAlterar?.(temRascunho)
  }, [temRascunho, aoAlterar])

  useEffect(() => () => aoAlterar?.(false), [aoAlterar])

  useEffect(() => {
    if (!temRascunho) return undefined

    const avisar = (evento) => {
      evento.preventDefault()
      evento.returnValue = ''
    }

    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [temRascunho])

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregando(true)
    setErroCarga('')

    try {
      setEstado(await obterEstadoCopiloto(oportunidadeId))
    } catch (falha) {
      if (!silencioso) {
        setErroCarga(falha?.message || 'Não foi possível carregar o Copiloto.')
      }
    } finally {
      setCarregando(false)
    }
  }, [oportunidadeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    aoOcupar?.(ACOES_COM_IA.includes(emAcao))
  }, [emAcao, aoOcupar])

  useEffect(() => () => aoOcupar?.(false), [aoOcupar])

  const estruturar = async () => {
    setEmAcao('estruturar')
    setResultado(null)
    setSugestoes([])

    try {
      const saida = await estruturarComCopiloto(oportunidadeId)
      const novas = saida.sugestoes || []

      setResultado({
        indisponivel: Boolean(saida.fallback_usado) && (saida.preenchidos || []).length === 0,
        motivo: saida.motivo_fallback || null,
        preenchidos: saida.preenchidos || [],
        sugeriu: novas.length > 0,
        completa: (estado?.elementos_vazios || []).length === 0,
      })
      setSugestoes(novas)
      await carregar({ silencioso: true })
      aoEstruturar?.()
    } catch (falha) {
      showToast(falha?.message || 'A estruturação não foi concluída.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const lerEntrada = async () => {
    setEmAcao('ler')

    try {
      await iniciarSessaoCopiloto(oportunidadeId)
      await carregar({ silencioso: true })
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível ler a entrada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const salvarResumo = async (sintese) => {
    setEmAcao('resumo')

    try {
      await atualizarSinteseCopiloto(oportunidadeId, sintese)
      await carregar({ silencioso: true })
      showToast('Resumo salvo. Ele orienta a próxima estruturação.')
      return true
    } catch (falha) {
      showToast(falha?.message || 'O resumo não foi salvo.', 'error')
      return false
    } finally {
      setEmAcao('')
    }
  }

  const escreverResposta = (chave, texto) => {
    setRascunhos((atuais) =>
      texto ? { ...atuais, [chave]: texto } : semRascunho(atuais, chave),
    )
  }

  const enviarRespostas = async () => {
    const lote = respondidas.map((pergunta) => {
      const chave = chaveDa(pergunta)
      const texto = rascunhos[chave].trim()

      if (pergunta.origem === 'entrada') {
        return { chave, texto: respostaDaEntrada(pergunta.pergunta, texto), contexto: {} }
      }

      return {
        chave,
        texto,
        contexto: { elemento: pergunta.elemento, pergunta: pergunta.pergunta },
      }
    })

    if (resposta.trim()) lote.push({ chave: null, texto: resposta.trim(), contexto: {} })

    if (lote.length === 0) return

    setEmAcao('responder')

    let enviadas = 0

    try {
      for (const item of lote) {
        await responderCopiloto(oportunidadeId, item.texto, item.contexto)
        enviadas += 1

        if (item.chave) {
          setRascunhos((atuais) => semRascunho(atuais, item.chave))
        } else {
          setResposta('')
        }
      }
    } catch (falha) {
      showToast(
        enviadas > 0
          ? `${enviadas} de ${lote.length} respostas registradas. As outras continuam nos campos para você tentar de novo.`
          : falha?.message || 'A resposta não foi registrada.',
        'error',
      )
      if (enviadas > 0) await carregar({ silencioso: true })
      setEmAcao('')
      return
    }

    await estruturar()
  }

  const enviar = async (event) => {
    event.preventDefault()
    setEnviando(true)

    try {
      if (temRascunho) await enviarRespostas()
      else await estruturar()
    } finally {
      setEnviando(false)
    }
  }

  const aceitar = async (sugestao) => {
    setEmAcao('aceitar')

    try {
      await aceitarSugestaoCopiloto(oportunidadeId, sugestao.elemento, sugestao.texto_sugerido)
      setSugestoes((atuais) => atuais.filter((item) => item.elemento !== sugestao.elemento))
      showToast(`Sugestão aceita em ${rotuloDoElemento(sugestao.elemento)}.`)
      await carregar({ silencioso: true })
      aoEstruturar?.()
    } catch (falha) {
      showToast(falha?.message || 'A sugestão não foi gravada.', 'error')
    } finally {
      setEmAcao('')
    }
  }

  const recusar = (sugestao) => {
    setSugestoes((atuais) => atuais.filter((item) => item.elemento !== sugestao.elemento))
  }

  const lerDeNovo = async () => {
    const confirmou = window.confirm(
      'O Copiloto vai ler a entrada outra vez e escrever um resumo novo, que você confere de novo. As respostas já enviadas deixam de ser usadas. O texto da proposta não muda.',
    )

    if (!confirmou) return

    setEmAcao('ler')
    setResultado(null)
    setSugestoes([])

    try {
      await concluirSessaoCopiloto(oportunidadeId)
      await iniciarSessaoCopiloto(oportunidadeId)
    } catch (falha) {
      showToast(falha?.message || 'Não foi possível ler a entrada de novo.', 'error')
    } finally {
      await carregar({ silencioso: true })
      setEmAcao('')
    }
  }

  if (carregando) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio" role="status">
          Carregando o Copiloto...
        </p>
      </section>
    )
  }

  if (erroCarga) {
    return (
      <section className="perfil-card">
        <p className="oportunidade-page__vazio">{erroCarga}</p>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => carregar()}
        >
          Tentar de novo
        </button>
      </section>
    )
  }

  const sessao = estado?.sessao || null
  const pendentes = estado?.elementos_vazios || []
  const perguntas = estado?.perguntas || []
  const lacunas = estado?.lacunas || []
  const preenchidos = TOTAL_DE_ELEMENTOS - pendentes.length
  const completa = pendentes.length === 0
  const paraRevisar = lacunas.filter((lacuna) => !pendentes.includes(lacuna.campo_afetado)).length
  const ocupado = Boolean(emAcao)
  const resumoConferido = Boolean(estado?.sessao?.sintese_conferida)
  const podeResponder = podeConduzir && resumoConferido
  const podeReavaliar = podeResponder && completa
  const podeEnviar = podeResponder && (!completa || temRascunho || enviando)

  const elementos = (
    <Elementos
      itens={elementosDoCopiloto(pendentes, lacunas, perguntas)}
      perguntasDaEntrada={perguntasDaEntrada}
      baseDisponivel={Boolean(estado?.base_disponivel)}
      podeConduzir={podeConduzir}
      podeResponder={podeResponder}
      ocupado={ocupado}
      rascunhos={rascunhos}
      irPara={irPara}
      aoEscrever={escreverResposta}
    />
  )

  let passosFeitos = 2
  if (!resumoConferido) passosFeitos = 0
  else if (preenchidos === 0) passosFeitos = 1

  let estadoDoEnvio = completa
    ? 'Nenhuma resposta escrita ainda.'
    : 'Nenhuma resposta escrita: o Copiloto usa a descrição e o resumo.'
  if (!resumoConferido) estadoDoEnvio = 'Primeiro confira o resumo da entrada.'
  else if (respostasProntas === 1) estadoDoEnvio = '1 resposta pronta para enviar.'
  else if (respostasProntas > 1) estadoDoEnvio = `${respostasProntas} respostas prontas para enviar.`

  const depoisDoEnvio = completa ? 'reavaliar' : 'estruturar'
  let rotuloDoEnvio = preenchidos === 0 ? 'Estruturar com o Copiloto' : 'Estruturar o que falta'
  if (emAcao === 'responder') rotuloDoEnvio = 'Enviando...'
  else if (emAcao === 'estruturar') rotuloDoEnvio = completa ? 'Reavaliando...' : 'Estruturando...'
  else if (respostasProntas === 1) rotuloDoEnvio = `Enviar a resposta e ${depoisDoEnvio}`
  else if (respostasProntas > 1) {
    rotuloDoEnvio = `Enviar as ${respostasProntas} respostas e ${depoisDoEnvio}`
  }

  const envioPrincipal = temRascunho || enviando || preenchidos === 0

  return (
    <section className="perfil-card copiloto">
      <header className="perfil-card__header">
        <div>
          <h2 className="perfil-card__title">Copiloto de Estruturação</h2>
          <p className="perfil-card__description">
            O Copiloto lê a descrição da oportunidade, o resumo e as suas
            respostas e escreve uma primeira versão dos elementos vazios. No que
            você já escreveu, ele só sugere: a mudança entra se você aceitar.
          </p>
          <Progresso preenchidos={preenchidos} paraRevisar={paraRevisar} />
          {podeReavaliar ? (
            <p id={idDaExplicacao} className="copiloto__nota copiloto__explicacao">
              Reavaliar a proposta: o Copiloto relê os oito elementos e atualiza os
              pontos para revisar. O texto só muda se você aceitar uma sugestão.
            </p>
          ) : null}
        </div>

        {podeReavaliar ? (
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={estruturar}
            disabled={ocupado}
            aria-describedby={idDaExplicacao}
          >
            <Icone icon={appIcons.flow} />
            {emAcao === 'estruturar' ? 'Reavaliando...' : 'Reavaliar a proposta'}
          </button>
        ) : null}

        {!podeConduzir ? (
          <span
            className="perfil-card__lock"
            title={
              encerrada
                ? 'A oportunidade foi encerrada: o Copiloto não roda mais nesta oportunidade.'
                : 'Conduzir a estruturação é do Supervisor.'
            }
          >
            <Icone icon={appIcons.view} />
            Somente leitura
          </span>
        ) : null}
      </header>

      <div className="perfil-card__body copiloto__corpo">
        <EtapaEncerrada situacao={situacao} irPara={irPara} />

        <div className="admin-callout" role="note">
          <Icone icon={appIcons.info} className="admin-callout__icon" />
          <p className="admin-callout__text">
            Tudo o que o Copiloto escreve é sugestão e precisa de revisão humana
            antes de valer como proposta.
          </p>
        </div>

        {emAcao === 'ler' ? (
          <EsperaIA titulo="O Copiloto está lendo a entrada e escrevendo o resumo." />
        ) : null}

        {emAcao === 'estruturar' ? (
          <EsperaIA
            titulo={
              completa
                ? 'O Copiloto está relendo a proposta.'
                : 'O Copiloto está escrevendo os elementos que faltam.'
            }
          />
        ) : null}

        <Resultado resultado={resultado} irPara={irPara} />

        <Sugestoes
          sugestoes={sugestoes}
          podeConduzir={podeConduzir}
          ocupado={ocupado}
          aoAceitar={aceitar}
          aoRecusar={recusar}
        />

        {podeConduzir && (!completa || !resumoConferido) ? <Passos feitos={passosFeitos} /> : null}

        <ResumoDaEntrada
          sessao={sessao}
          podeConduzir={podeConduzir}
          ocupado={ocupado}
          aoLer={lerEntrada}
          aoReler={lerDeNovo}
          aoSalvar={salvarResumo}
        />

        {podeConduzir ? (
          <form className="copiloto__forma" onSubmit={enviar}>
            {elementos}

            {podeResponder && (outraAberta || resposta) ? (
              <div className="admin-field copiloto__livre">
                <label className="admin-field__label" htmlFor={`${idDaOutra}-campo`}>
                  Mais alguma coisa que o Copiloto deve saber?
                </label>
                <textarea
                  id={`${idDaOutra}-campo`}
                  className="admin-input admin-input--area"
                  rows={3}
                  value={resposta}
                  onChange={(event) => setResposta(event.target.value)}
                  aria-describedby={`${idDaOutra}-dica`}
                  autoFocus={!resposta}
                  disabled={ocupado}
                />
                <span id={`${idDaOutra}-dica`} className="admin-field__hint">
                  Opcional. Vai junto com as respostas, para o que nenhuma pergunta cobre.
                  Ex.: o varejo pede 60 dias de validade; hoje são 45.
                </span>
              </div>
            ) : null}

            {podeResponder && !outraAberta && !resposta ? (
              <div className="copiloto__livre">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setOutraAberta(true)}
                  disabled={ocupado}
                >
                  Adicionar outra informação
                </button>
              </div>
            ) : null}

            <BarraDeAcoes estado={estadoDoEnvio}>
              {podeEnviar ? (
                <button
                  type="submit"
                  className={envioPrincipal ? 'admin-btn' : 'admin-btn admin-btn--outline'}
                  disabled={ocupado}
                >
                  <Icone icon={appIcons.flow} />
                  {rotuloDoEnvio}
                </button>
              ) : null}
              {preenchidos > 0 ? (
                <ContinuarPara
                  etapa="proposta"
                  irPara={irPara}
                  secundario={temRascunho || enviando || !resumoConferido}
                />
              ) : null}
            </BarraDeAcoes>
          </form>
        ) : (
          elementos
        )}

        <Conversa mensagens={estado?.mensagens || []} />
      </div>

      <AdminToast toast={toast} />
    </section>
  )
}
