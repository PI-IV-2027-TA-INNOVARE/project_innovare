import { useCallback, useEffect, useState } from 'react'
import { AdminToast, useToast } from '../../../components/console/toast'
import { Icone, appIcons } from '../../../lib/icons'
import {
  importarCriteriosPreAnalise,
  listarCriteriosPreAnalise,
} from '../../../services/pdConnectApi'
import { gravarContatos, lerContatos, restaurarContatos } from '../../system/contatosSuporte'

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
      showToast(
        `Baseline ${resultado.baseline_id} aplicada: ${resultado.criados} critério(s) novo(s) e ${resultado.atualizados} atualizado(s).`,
      )
    } catch (falha) {
      showToast(falha?.data?.detail || falha?.message || 'A importação não foi concluída.')
    } finally {
      setImportando(false)
    }
  }

  const versao = criterios[0]?.versao || null

  return (
    <section className="perfil-card">
      <header className="perfil-card__header">
        <div>
          <h3 className="perfil-card__title">Critérios da pré-análise PIPE/FAPESP</h3>
          <p className="perfil-card__description">
            Desafio tecnológico, inovação, plano de pesquisa, equipe e
            supervisão, infraestrutura e viabilidade — versionados, para que uma
            reavaliação diga contra qual versão foi feita.
          </p>
          <p className="perfil-card__description">
            {versao
              ? `Versão vigente: ${versao} · ${criterios.length} critério(s).`
              : 'Nenhuma versão vigente: a pré-análise recusa executar até a baseline ser importada.'}
          </p>
        </div>

        <button
          type="button"
          className="admin-btn"
          onClick={importar}
          disabled={importando}
        >
          <Icone icon={appIcons.export} />
          {importando ? 'Importando...' : 'Importar da baseline'}
        </button>
      </header>

      <div className="perfil-card__body">
        <p className="etapa-planejada__nota">
          Os critérios não são digitados aqui: eles vêm da Base de Conhecimento
          PIPE versionada, e a importação registra na trilha qual baseline
          entrou. O conteúdo permanece decisão do Product Owner com a AC2.
        </p>

        {carregando ? (
          <p className="oportunidade-page__vazio" role="status">
            Lendo os critérios...
          </p>
        ) : null}

        {erro ? <p className="oportunidade-page__vazio">{erro}</p> : null}

        {criterios.length > 0 ? (
          <ul className="criterios__lista">
            {criterios.map((criterio) => (
              <li key={criterio.id_criterio} className="criterios__item">
                <span className="criterios__codigo">{criterio.codigo}</span>
                <div>
                  <p className="criterios__descricao">{criterio.descricao}</p>
                  <p className="criterios__dimensao">{criterio.dimensao_rotulo}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
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

  const [contatos, setContatos] = useState(() => lerContatos())
  const [erros, setErros] = useState({})

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

  const salvar = (event) => {
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

    gravarContatos(contatos)
    showToast('Contatos de suporte atualizados.')
  }

  const restaurar = () => {
    setContatos(restaurarContatos())
    setErros({})
    showToast('Contatos restaurados para o padrão da AC2.')
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
          </div>

          <button type="button" className="admin-btn admin-btn--outline" onClick={restaurar}>
            <Icone icon={appIcons.reset} />
            Restaurar padrão
          </button>
        </header>

        <div className="perfil-card__body">
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

          {contatos.length === 0 ? (
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
            <button type="submit" className="admin-btn">
              <Icone icon={appIcons.save} />
              Salvar contatos
            </button>
          </div>
        </div>
      </form>

      <CriteriosDaPreAnalise showToast={showToast} />

      <AdminToast toast={toast} />
    </div>
  )
}
