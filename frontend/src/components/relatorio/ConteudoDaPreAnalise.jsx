import { MOTIVOS_DE_FALHA_DA_PREANALISE } from '../../lib/glossario'
import {
  ROTULOS_DAS_DIMENSOES,
  SEM_RECOMENDACAO,
  agruparPorLacuna,
  rotuloDoCriterio,
  separarDescricao,
} from '../../lib/lacunas'
import {
  Campo,
  SeloDeMaturidade,
  TextoFormatado,
  formatarData,
  porGravidade,
} from './partesDoRelatorio'

const ELEMENTOS_DA_PROPOSTA = [
  ['problema_pesquisa', 'Problema de pesquisa'],
  ['objetivo_geral', 'Objetivo geral'],
  ['metodologia', 'Metodologia'],
  ['caracterizacao_inovacao', 'Caracterização da inovação'],
  ['infraestrutura_recursos', 'Infraestrutura e recursos'],
]

const rotuloDaDimensao = (item) => ROTULOS_DAS_DIMENSOES[item.dimensao] || item.dimensao_rotulo

function Recomendacao({ recomendacao }) {
  const estado = recomendacao.acatada ? 'acatada' : 'pendente'

  return (
    <li className="relatorio-recomendacao">
      <span>{recomendacao.texto}</span>{' '}
      <span className={`relatorio-estado relatorio-estado--${estado}`}>
        {recomendacao.acatada ? 'Acatada' : 'Pendente'}
      </span>
    </li>
  )
}

/**
 * A pré-análise como documento: a leitura dos níveis, a execução, cada
 * dimensão, as lacunas com as recomendações e os critérios da versão citada.
 * O relatório da pré-análise e o da oportunidade mostram o mesmo conteúdo;
 * `Bloco` decide se cada parte vira seção do sumário ou subtítulo dentro de
 * uma seção.
 */
export default function ConteudoDaPreAnalise({
  analise,
  comoLer = [],
  criterios = [],
  proposta = null,
  equipe = null,
  mostrarSintese = true,
  Bloco,
}) {
  const emAndamento = ['pendente', 'executando'].includes(analise.status)
  const falhou = analise.status !== 'ok' && !emAndamento
  const motivo = MOTIVOS_DE_FALHA_DA_PREANALISE[analise.erro]
  const { grupos, soltas } = agruparPorLacuna(analise.lacunas, analise.recomendacoes)

  return (
    <>
      {comoLer.length > 0 ? (
        <Bloco titulo="Como ler esta pré-análise">
          {comoLer.map((paragrafo) => (
            <p key={paragrafo} className="relatorio-texto">{paragrafo}</p>
          ))}
        </Bloco>
      ) : null}

      <Bloco titulo="Execução">
        <dl className="relatorio-campos">
          <Campo rotulo="Executada em">{formatarData(analise.executada_em)}</Campo>
          <Campo rotulo="Executada por">
            {analise.executada_por_nome || analise.executada_por}
          </Campo>
          <Campo rotulo="Situação">{analise.status_rotulo}</Campo>
        </dl>

        {emAndamento ? (
          <p className="relatorio-vazio">
            A pré-análise ainda está em andamento. O relatório fica completo
            quando ela terminar.
          </p>
        ) : null}

        {falhou ? (
          <p className="relatorio-vazio">
            A execução não produziu resultado{motivo ? `: ${motivo}` : ''}. Nenhuma
            dimensão é apresentada: um relatório preenchido sem análise diria o
            que o módulo não concluiu.
          </p>
        ) : null}

        {mostrarSintese && analise.sintese ? (
          <TextoFormatado texto={analise.sintese} className="relatorio-campo__valor" />
        ) : null}

        {analise.ai_run_id ? (
          <p className="relatorio-nota">
            Código desta execução da IA, para localizar a análise na auditoria:{' '}
            {analise.ai_run_id}
          </p>
        ) : null}
      </Bloco>

      {analise.dimensoes.length > 0 ? (
        <Bloco titulo="Resultado por dimensão">
          <dl className="relatorio-campos relatorio-campos--coluna">
            {porGravidade(analise.dimensoes).map((dimensao) => (
              <Campo key={dimensao.id_dimensao} rotulo={rotuloDaDimensao(dimensao)}>
                <SeloDeMaturidade nivel={dimensao.nivel} rotulo={dimensao.nivel_rotulo} />
                <TextoFormatado texto={dimensao.avaliacao} />
                {dimensao.evidencias?.length > 0 ? (
                  <ul className="relatorio-lista">
                    {dimensao.evidencias.map((evidencia, indice) => (
                      <li key={`${dimensao.id_dimensao}-${indice}`}>{evidencia}</li>
                    ))}
                  </ul>
                ) : null}
              </Campo>
            ))}
          </dl>
        </Bloco>
      ) : null}

      {grupos.length > 0 ? (
        <Bloco titulo="Lacunas e recomendações">
          <ul className="relatorio-lista">
            {grupos.map(({ lacuna, recomendacoes }) => (
              <li key={lacuna.id_lacuna}>
                <span className="relatorio-lacuna__origem">
                  {[ROTULOS_DAS_DIMENSOES[lacuna.campo_afetado], rotuloDoCriterio(lacuna)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="relatorio-lacuna__texto">{lacuna.descricao}</span>
                {recomendacoes.length > 0 ? (
                  <ul className="relatorio-lista">
                    {recomendacoes.map((recomendacao) => (
                      <Recomendacao key={recomendacao.id_recomendacao} recomendacao={recomendacao} />
                    ))}
                  </ul>
                ) : (
                  <span className="relatorio-lacuna__sem-recomendacao">{SEM_RECOMENDACAO}</span>
                )}
              </li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {soltas.length > 0 ? (
        <Bloco titulo="Outras recomendações">
          <ul className="relatorio-lista">
            {soltas.map((recomendacao) => (
              <Recomendacao key={recomendacao.id_recomendacao} recomendacao={recomendacao} />
            ))}
          </ul>
        </Bloco>
      ) : null}

      {proposta ? (
        <Bloco titulo="Proposta avaliada">
          <dl className="relatorio-campos relatorio-campos--coluna">
            {ELEMENTOS_DA_PROPOSTA.map(([campo, rotulo]) => (
              <Campo key={campo} rotulo={rotulo}>
                {proposta[campo] ? <TextoFormatado texto={proposta[campo]} /> : null}
              </Campo>
            ))}
          </dl>
        </Bloco>
      ) : null}

      {equipe ? (
        <Bloco titulo="Equipe potencial considerada">
          <ul className="relatorio-lista">
            {equipe.membros
              .filter((membro) => membro.incluido)
              .map((membro) => (
                <li key={membro.id_membro_equipe}>
                  {membro.nome} · {membro.papel_rotulo}
                  {membro.titulacao ? ` · ${membro.titulacao}` : ''} ·{' '}
                  {membro.disponibilidade}
                </li>
              ))}
          </ul>
        </Bloco>
      ) : null}

      {criterios.length > 0 ? (
        <Bloco titulo={`Critérios de referência · versão ${analise.versao_criterios}`}>
          <ul className="relatorio-lista">
            {criterios.map((criterio) => {
              const { titulo, pergunta } = separarDescricao(criterio.descricao)

              return (
                <li key={criterio.id_criterio}>
                  <strong>{titulo}</strong> ({criterio.codigo}) · {rotuloDaDimensao(criterio)}
                  {pergunta ? ` — ${pergunta}` : ''}
                </li>
              )
            })}
          </ul>
        </Bloco>
      ) : null}
    </>
  )
}
