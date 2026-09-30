import { useEffect, useState } from 'react'
import { obterIndicadores } from '../../../services/pdConnectApi'
import './IndicadoresPage.scss'

function Barra({ item, maior }) {
  const largura = maior > 0 ? Math.round((item.total / maior) * 100) : 0

  return (
    <li className="indicador-barra" aria-label={item.rotulo}>
      <span className="indicador-barra__rotulo">{item.rotulo}</span>

      <span className="indicador-barra__trilho" aria-hidden="true">
        <span className="indicador-barra__preenchida" style={{ width: `${largura}%` }} />
      </span>

      <span className="indicador-barra__total">{item.total}</span>
    </li>
  )
}

function Bloco({ titulo, descricao, total, grupos }) {
  const rotuloId = `indicador-${titulo.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <section className="indicador-card" aria-labelledby={rotuloId}>
      <header className="indicador-card__header">
        <h2 className="indicador-card__title" id={rotuloId}>
          {titulo}
        </h2>
        <p className="indicador-card__total">{total}</p>
      </header>

      <p className="indicador-card__description">{descricao}</p>

      {grupos.map((grupo) => (
        <div className="indicador-grupo" key={grupo.titulo}>
          <h3 className="indicador-grupo__titulo">{grupo.titulo}</h3>

          <ul className="indicador-grupo__lista">
            {grupo.itens.map((item) => (
              <Barra
                key={item.valor}
                item={item}
                maior={Math.max(...grupo.itens.map((i) => i.total), 0)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default function IndicadoresPage() {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    obterIndicadores()
      .then((resposta) => {
        setDados(resposta)
        setErro('')
      })
      .catch(() => setErro('Não foi possível carregar os indicadores. Tente novamente.'))
      .finally(() => setCarregando(false))
  }, [])

  if (carregando) {
    return (
      <div className="container indicadores-page">
        <p className="oportunidade-bloco__vazio">Carregando indicadores…</p>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="container indicadores-page">
        <p className="login-message" role="alert">
          {erro}
        </p>
      </div>
    )
  }

  const semOportunidade = dados.oportunidades.total === 0

  return (
    <div className="container indicadores-page">
      <header className="console-section__header">
        <div>
          <h1 className="console-section__title">Indicadores</h1>
          <p className="console-section__description">
            Os números do fluxo, no que você acompanha.
          </p>
        </div>
      </header>

      {semOportunidade ? (
        <p className="oportunidade-bloco__vazio">
          Nenhuma oportunidade no seu acompanhamento ainda. Os números aparecem
          assim que a primeira entrar no fluxo.
        </p>
      ) : (
        <div className="indicadores-grade">
          <Bloco
            titulo="Oportunidades"
            descricao="Onde estão e de onde vieram."
            total={dados.oportunidades.total}
            grupos={[
              { titulo: 'Por etapa', itens: dados.oportunidades.por_situacao },
              { titulo: 'Por origem', itens: dados.oportunidades.por_origem },
            ]}
          />

          <Bloco
            titulo="Decisões"
            descricao="Encaminhamentos já registrados."
            total={dados.decisoes.total}
            grupos={[{ titulo: 'Por encaminhamento', itens: dados.decisoes.por_tipo }]}
          />

          {dados.rede ? (
            <Bloco
              titulo="Rede interna"
              descricao="Quem está cadastrado."
              total={dados.rede.total}
              grupos={[{ titulo: 'Por papel', itens: dados.rede.por_papel }]}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
