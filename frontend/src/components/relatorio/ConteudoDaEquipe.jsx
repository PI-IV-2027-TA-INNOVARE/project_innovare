import { PARCELAS_DA_NOTA, TERMOS, rotuloDaEstrategia } from '../../lib/glossario'
import { Campo, porcentagem } from './partesDoRelatorio'

/**
 * O resultado do matching como documento: a explicação da nota, a rodada, a
 * composição e as lacunas. O relatório da equipe e o da oportunidade mostram
 * o mesmo conteúdo; `Bloco` decide se cada parte vira seção do sumário ou
 * subtítulo dentro de uma seção.
 */
export default function ConteudoDaEquipe({
  equipe,
  comoFoiCalculado = [],
  competencias = null,
  Bloco,
}) {
  const execucao = equipe.execucao
  const incluidos = equipe.membros.filter((membro) => membro.incluido)

  return (
    <>
      {comoFoiCalculado.length > 0 ? (
        <Bloco titulo="Como foi calculado">
          {comoFoiCalculado.map((paragrafo) => (
            <p key={paragrafo} className="relatorio-texto">{paragrafo}</p>
          ))}
        </Bloco>
      ) : null}

      {execucao ? (
        <Bloco titulo="Rodada do matching">
          <dl className="relatorio-campos">
            <Campo rotulo="Cálculo da nota">{rotuloDaEstrategia(execucao.estrategia)}</Campo>
            <Campo rotulo={TERMOS.revisaoDaIa}>{execucao.usou_rerank ? 'sim' : 'não'}</Campo>
            <Campo rotulo={PARCELAS_DA_NOTA.semantico}>
              {execucao.fallback_usado ? 'indisponível na rodada' : 'aplicada'}
            </Campo>
            <Campo rotulo="Executada por">
              {execucao.executado_por_nome || execucao.executado_por}
            </Campo>
          </dl>

          {execucao.pesos?.componentes ? (
            <dl className="relatorio-campos">
              {Object.entries(execucao.pesos.componentes).map(([nome, peso]) => (
                <Campo key={nome} rotulo={PARCELAS_DA_NOTA[nome] || nome}>
                  peso {porcentagem(peso)}
                </Campo>
              ))}
            </dl>
          ) : null}
        </Bloco>
      ) : null}

      <Bloco titulo="Composição sugerida">
        {incluidos.length > 0 ? (
          <dl className="relatorio-campos relatorio-campos--coluna">
            {incluidos.map((membro) => (
              <Campo
                key={membro.id_membro_equipe}
                rotulo={`${membro.nome} · ${membro.papel_rotulo} · aderência ${porcentagem(
                  membro.score_compatibilidade,
                )}`}
              >
                <span>
                  {membro.titulacao ? `${membro.titulacao} · ` : ''}
                  {membro.disponibilidade} · {membro.origem_rotulo}
                  {membro.validada ? ' · validada' : ''}
                </span>

                {membro.match_reasons?.length > 0 ? (
                  <ul className="relatorio-lista">
                    {membro.match_reasons.map((motivo, indice) => (
                      <li key={`${membro.id_membro_equipe}-${indice}`}>{motivo}</li>
                    ))}
                  </ul>
                ) : null}
              </Campo>
            ))}
          </dl>
        ) : (
          <p className="relatorio-vazio">
            Nenhuma pessoa na composição atual. As lacunas abaixo dizem quais
            competências ficaram sem cobertura.
          </p>
        )}
      </Bloco>

      {competencias ? (
        <Bloco titulo="Competências comparadas">
          {competencias.length > 0 ? (
            <ul className="relatorio-lista">
              {competencias.map((competencia) => (
                <li key={competencia.id_competencia_necessaria}>
                  {competencia.descricao} · {competencia.nivel_rotulo}
                  {competencia.no_vocabulario ? ' · já cadastrada na rede interna' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="relatorio-vazio">Nenhuma competência necessária registrada.</p>
          )}
        </Bloco>
      ) : null}

      {equipe.lacunas.length > 0 ? (
        <Bloco titulo="Lacunas da composição">
          <ul className="relatorio-lista">
            {equipe.lacunas.map((lacuna) => (
              <li key={lacuna.id_lacuna_equipe}>{lacuna.descricao}</li>
            ))}
          </ul>
        </Bloco>
      ) : null}
    </>
  )
}
