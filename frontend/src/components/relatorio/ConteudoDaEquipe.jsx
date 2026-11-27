import { useId } from 'react'
import { PARCELAS_DA_NOTA, TERMOS, rotuloDaEstrategia } from '../../lib/glossario'
import { Campo, porcentagem } from './partesDoRelatorio'

const COLUNAS = ['Pessoa', 'Titulação', 'Dedicação', 'Compatibilidade', PARCELAS_DA_NOTA.semantico]

function gruposDaComposicao(membros) {
  return [
    { rotulo: 'Supervisão', membros: membros.filter((membro) => membro.papel === 'supervisor') },
    { rotulo: 'Pesquisa', membros: membros.filter((membro) => membro.papel !== 'supervisor') },
  ].filter((grupo) => grupo.membros.length > 0)
}

function afinidadeDe(membro) {
  if (!membro.score_features) return '—'

  const valor = membro.score_features.semantico

  return valor === null || valor === undefined ? 'indisponível' : porcentagem(valor)
}

function motivosQueNaoEstaoNaTabela(membro) {
  const repetidos = new Set([
    `Titulação: ${membro.titulacao}.`,
    `Disponibilidade declarada: ${membro.disponibilidade}.`,
    'Integra a rede como Supervisor.',
  ])

  return (membro.match_reasons || []).filter(
    (motivo) => !repetidos.has(motivo) && !motivo.startsWith(PARCELAS_DA_NOTA.semantico),
  )
}

function TabelaDaComposicao({ rotulo, membros, NivelDoTitulo }) {
  const id = useId()

  return (
    <div className="relatorio-tabela-bloco">
      <NivelDoTitulo id={id} className="relatorio-tabela__titulo">{rotulo}</NivelDoTitulo>

      <div className="relatorio-tabela-rolagem">
        <table className="relatorio-tabela" aria-labelledby={id}>
          <thead>
            <tr>
              {COLUNAS.map((coluna) => (
                <th key={coluna} scope="col">{coluna}</th>
              ))}
            </tr>
          </thead>

          {membros.map((membro) => {
            const motivos = motivosQueNaoEstaoNaTabela(membro)
            const detalhe = [
              membro.papel_rotulo,
              membro.origem_rotulo,
              membro.validada ? 'validada' : null,
            ].filter(Boolean).join(' · ')

            return (
              <tbody key={membro.id_membro_equipe}>
                <tr>
                  <th scope="row">
                    <span className="relatorio-tabela__nome">{membro.nome}</span>
                    {detalhe ? (
                      <span className="relatorio-tabela__detalhe">{detalhe}</span>
                    ) : null}
                  </th>
                  <td>{membro.titulacao || '—'}</td>
                  <td>{membro.disponibilidade || '—'}</td>
                  <td className="relatorio-tabela__numero">
                    {porcentagem(membro.score_compatibilidade)}
                  </td>
                  <td className="relatorio-tabela__numero">{afinidadeDe(membro)}</td>
                </tr>
                {motivos.length > 0 ? (
                  <tr className="relatorio-tabela__motivos">
                    <td colSpan={COLUNAS.length}>{motivos.join(' ')}</td>
                  </tr>
                ) : null}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}

/**
 * O resultado do matching como documento: as lacunas primeiro, a composição
 * em tabela, as competências comparadas e, por fim, como a nota foi
 * calculada. O relatório da equipe e o da oportunidade mostram o mesmo
 * conteúdo; `Bloco` decide se cada parte vira seção do sumário ou subtítulo
 * dentro de uma seção.
 */
export default function ConteudoDaEquipe({
  equipe,
  comoFoiCalculado = [],
  competencias = null,
  Bloco,
  nivelDosGrupos = 'h4',
}) {
  const execucao = equipe.execucao
  const incluidos = equipe.membros.filter((membro) => membro.incluido)
  const mostrarPesos = comoFoiCalculado.length === 0 && Boolean(execucao?.pesos?.componentes)
  const afinidadeNaRodada = execucao?.fallback_usado
    ? 'indisponível nesta rodada'
    : 'aplicada nesta rodada'

  return (
    <>
      {equipe.lacunas.length > 0 ? (
        <Bloco titulo="Lacunas da composição">
          <ul className="relatorio-lista relatorio-lista--destaque">
            {equipe.lacunas.map((lacuna) => (
              <li key={lacuna.id_lacuna_equipe}>{lacuna.descricao}</li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      <Bloco titulo="Composição sugerida">
        {incluidos.length > 0 ? (
          <>
            <p className="relatorio-nota">
              Compatibilidade é a nota do matching. {PARCELAS_DA_NOTA.semantico} é uma
              das quatro parcelas dessa nota.
            </p>
            {gruposDaComposicao(incluidos).map((grupo) => (
              <TabelaDaComposicao
                key={grupo.rotulo}
                rotulo={grupo.rotulo}
                membros={grupo.membros}
                NivelDoTitulo={nivelDosGrupos}
              />
            ))}
          </>
        ) : (
          <p className="relatorio-vazio">
            Nenhuma pessoa na composição atual. As lacunas acima dizem quais
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
            <Campo rotulo={TERMOS.revisaoDaIa}>
              {execucao.usou_rerank
                ? 'sim: a IA reordenou as sugestões'
                : 'não: a ordem é a do cálculo'}
            </Campo>
            {mostrarPesos ? null : (
              <Campo rotulo={PARCELAS_DA_NOTA.semantico}>{afinidadeNaRodada}</Campo>
            )}
            <Campo rotulo="Executada por">
              {execucao.executado_por_nome || execucao.executado_por}
            </Campo>
          </dl>

          {mostrarPesos ? (
            <dl className="relatorio-campos">
              {Object.entries(execucao.pesos.componentes).map(([nome, peso]) => (
                <Campo key={nome} rotulo={PARCELAS_DA_NOTA[nome] || nome}>
                  {nome === 'semantico'
                    ? `peso ${porcentagem(peso)} · ${afinidadeNaRodada}`
                    : `peso ${porcentagem(peso)}`}
                </Campo>
              ))}
            </dl>
          ) : null}
        </Bloco>
      ) : null}
    </>
  )
}
