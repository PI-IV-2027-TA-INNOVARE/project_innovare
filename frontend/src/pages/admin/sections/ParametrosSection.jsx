import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import {
  gravarContatosSuporte,
  importarCriteriosPreAnalise,
  lerContatosSuporte,
  listarCriteriosPreAnalise,
  restaurarContatosSuporte,
} from '../../../services/pdConnectApi'

const ORDEM_DAS_DIMENSOES = [
  'desafio_tecnologico',
  'inovacao',
  'plano_pesquisa',
  'equipe_supervisao',
  'infraestrutura',
  'viabilidade',
]

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

function separarDescricao(descricao) {
  const [titulo, ...pergunta] = descricao.split(' — ')

  return { titulo, pergunta: pergunta.join(' — ') }
}

function resumirImportacao({ versao, criados, atualizados }) {
  const mudancas = [
    criados ? plural(criados, 'novo', 'novos') : null,
    atualizados ? plural(atualizados, 'revisado', 'revisados') : null,
  ].filter(Boolean)

  if (mudancas.length === 0) {
    return `Os critérios já estavam na versão ${versao}.`
  }

  return `Critérios atualizados para a versão ${versao}: ${mudancas.join(' e ')}.`
}

function CriteriosDaPreAnalise({ showToast }) {
  const [criterios, setCriterios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [importando, setImportando] = useState(false)

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

  useEffect(() => {
    carregar()
  }, [carregar])

  const importar = async () => {
    setImportando(true)

    try {
      const resultado = await importarCriteriosPreAnalise()
      await carregar()
      showToast(resumirImportacao(resultado))
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível atualizar os critérios.')
    } finally {
      setImportando(false)
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
            Perguntas que a pré-análise usa para avaliar cada oportunidade. Vêm
            da base de conhecimento PIPE e não são editados nesta tela.
          </p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={importar}
          disabled={importando}
        >
          <Icone icon={appIcons.reset} />
          {importando ? 'Atualizando...' : 'Atualizar critérios'}
        </button>
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
            de atualizar os critérios.
          </p>
        ) : null}

        {versao ? (
          <p className="criterios__resumo">
            <span className="criterios__versao">Versão {versao}</span>
            <span>
              {plural(criterios.length, 'critério', 'critérios')} em{' '}
              {plural(grupos.length, 'dimensão', 'dimensões')}
            </span>
          </p>
        ) : null}

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
                      <span className="criterios__codigo">{criterio.codigo}</span>
                      <div>
                        <p className="criterios__titulo">{titulo}</p>
                        {pergunta ? <p className="criterios__pergunta">{pergunta}</p> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}

const CONTATO_VAZIO = { nome: '', email: '', papel: '' }

function validar(contatos) {
  const erros = {}

  contatos.forEach((contato, indice) => {
    if (!contato.nome.trim()) {
      erros[indice] = 'Informe o nome do contato.'
    } else if (!contato.email.trim()) {
      erros[indice] = 'Informe o e-mail.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email.trim())) {
      erros[indice] = 'E-mail inválido.'
    }
  })

  return erros
}

export default function ParametrosSection() {
  const { toast, showToast } = useToast()

  const [contatos, setContatos] = useState([])
  const [carregandoContatos, setCarregandoContatos] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [erros, setErros] = useState({})

  useEffect(() => {
    let ativo = true

    lerContatosSuporte()
      .then((lista) => {
        if (ativo) setContatos(lista)
      })
      .catch((falha) => {
        if (ativo) showToast(falha?.message || 'Não foi possível carregar os contatos.')
      })
      .finally(() => {
        if (ativo) setCarregandoContatos(false)
      })

    return () => {
      ativo = false
    }
  }, [showToast])

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

  const salvar = async (event) => {
    event.preventDefault()

    if (contatos.length === 0) {
      showToast('Deixe ao menos um contato: é o que a tela de acesso restrito oferece.')
      return
    }

    const encontrados = validar(contatos)

    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    setGravando(true)

    try {
      setContatos(
        await gravarContatosSuporte(
          contatos.map(({ nome, email, papel }) => ({
            nome: nome.trim(),
            email: email.trim(),
            papel: papel.trim(),
          }))
        )
      )
      showToast('Contatos de suporte atualizados.')
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível salvar os contatos.')
    } finally {
      setGravando(false)
    }
  }

  const restaurar = async () => {
    setGravando(true)

    try {
      setContatos(await restaurarContatosSuporte())
      setErros({})
      showToast('Contatos restaurados para o padrão da AC2.')
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'Não foi possível restaurar os contatos.')
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="admin-section">
      <header className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Parâmetros</h2>
          <p className="admin-section__description">
            Valores que a plataforma consulta em mais de uma tela e que mudam sem
            precisar de deploy.
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
            onClick={restaurar}
            disabled={gravando || carregandoContatos}
          >
            <Icone icon={appIcons.reset} />
            Restaurar padrão
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
              <legend className="sr-only">Contato {indice + 1}</legend>

              <label className="admin-field">
                <span className="admin-field__label">Nome</span>
                <input
                  type="text"
                  className="admin-input"
                  value={contato.nome}
                  onChange={alterar(indice, 'nome')}
                  placeholder="Ex.: Núcleo de P&D — AC2"
                  aria-invalid={Boolean(erros[indice])}
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
                  aria-invalid={Boolean(erros[indice])}
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
              >
                <Icone icon={appIcons.remove} />
              </button>

              {erros[indice] ? (
                <span className="admin-field__error parametros-contato__erro" role="alert">
                  {erros[indice]}
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

          <div className="console-form__footer">
            <button type="button" className="admin-btn admin-btn--outline" onClick={adicionar}>
              <Icone icon={appIcons.addUser} />
              Adicionar contato
            </button>
            <button type="submit" className="admin-btn" disabled={gravando || carregandoContatos}>
              <Icone icon={appIcons.save} />
              {gravando ? 'Salvando...' : 'Salvar contatos'}
            </button>
          </div>
        </div>
      </form>

      <CriteriosDaPreAnalise showToast={showToast} />

      <AdminToast toast={toast} />
    </div>
  )
}
