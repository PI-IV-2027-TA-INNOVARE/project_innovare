export const ROTULOS_DAS_DIMENSOES = {
  desafio_tecnologico: 'Desafio tecnológico',
  inovacao: 'Inovação',
  plano_pesquisa: 'Plano de pesquisa',
  equipe_supervisao: 'Equipe e supervisão',
  infraestrutura: 'Infraestrutura',
  viabilidade: 'Viabilidade',
}

export const SEM_EVIDENCIA = 'Sem evidência na proposta'

export function agruparPorLacuna(lacunas = [], recomendacoes = []) {
  const porLacuna = new Map(lacunas.map((lacuna) => [lacuna.id_lacuna, []]))
  const soltas = []

  recomendacoes.forEach((recomendacao) => {
    const grupo = porLacuna.get(recomendacao.id_lacuna)

    if (grupo) grupo.push(recomendacao)
    else soltas.push(recomendacao)
  })

  return {
    grupos: lacunas.map((lacuna) => ({
      lacuna,
      recomendacoes: porLacuna.get(lacuna.id_lacuna),
    })),
    soltas,
  }
}

export function rotuloDoCriterio(item) {
  if (!item?.criterio_codigo) return SEM_EVIDENCIA

  return item.criterio_rotulo
    ? `${item.criterio_codigo} · ${item.criterio_rotulo}`
    : item.criterio_codigo
}
