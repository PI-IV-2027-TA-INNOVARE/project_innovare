import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { appIcons, Icone } from '../../lib/icons'
import { lerPrivacidade } from '../../services/pdConnectApi'
import './PrivacidadePage.scss'

const ATUALIZADO_EM = '20/11/2026'

const RETENCAO_PADRAO = {
  eventos_conta_meses: 12,
  anexos_apos_arquivamento_meses: 24,
}

const RESUMO = [
  {
    icone: appIcons.folder,
    termo: 'O que guardamos',
    texto: 'Sua conta, seu perfil na rede interna e as oportunidades.',
  },
  {
    icone: appIcons.place,
    termo: 'Onde fica',
    texto: 'Os dados e os documentos anexados ficam guardados no Brasil.',
  },
  {
    icone: appIcons.share,
    termo: 'Quem mais recebe',
    texto: 'Serviços de IA, só com o texto do trabalho, sem nome, e-mail ou telefone. E o provedor de e-mail, com os avisos que chegam a você.',
  },
  {
    icone: appIcons.export,
    termo: 'O que você controla',
    texto: 'Baixar uma cópia dos seus dados e pedir a exclusão da conta.',
    levaAosDados: true,
  },
]

const DADOS = [
  ['Conta', 'nome, e-mail, perfil de acesso e último acesso.'],
  ['Empresa demandante', 'nome, CNPJ e, se você informar, telefone.'],
  ['Rede interna', 'formação, titulação, competências, experiência, disponibilidade e se a pessoa está ativa ou inativa na rede. Quem é inativado continua nas equipes já sugeridas.'],
  ['Oportunidades', 'os textos cadastrados e os documentos anexados.'],
  ['Histórico', 'quem fez cada ação e quando.'],
]

const BASES = [
  [
    'Cadastrar e acompanhar os problemas das empresas, a pedido delas',
    'Execução de contrato ou de procedimentos preliminares (art. 7º, V)',
  ],
  [
    'Manter a rede interna, sugerir equipes e pré-analisar as propostas',
    'Legítimo interesse da AC2 (art. 7º, IX)',
  ],
  [
    'Guardar o histórico das ações, para segurança e rastreabilidade',
    'Legítimo interesse e obrigação legal (art. 7º, II e IX)',
  ],
]

const DIREITOS = [
  'Confirmar se tratamos seus dados',
  'Acessar seus dados',
  'Corrigir seus dados',
  'Levar seus dados a outro serviço',
  'Pedir anonimização ou exclusão',
  'Saber com quem seus dados foram compartilhados',
]

const SECOES = [
  ['privacidade-quem', 'Quem é responsável'],
  ['privacidade-quais', 'O que guardamos'],
  ['privacidade-para-que', 'Para que usamos e com que base'],
  ['privacidade-compartilhamento', 'Com quem compartilhamos'],
  ['privacidade-tempo', 'Por quanto tempo'],
  ['privacidade-direitos', 'Seus direitos'],
  ['privacidade-encarregado', 'Encarregado de dados'],
]

const DISTANCIA_DO_TOPO = 120

const PAUSA_APOS_CLIQUE = 1200

function secaoNaTela() {
  const ultima = SECOES[SECOES.length - 1][0]
  const raiz = document.documentElement
  const noFim = window.scrollY > 0 && window.innerHeight + window.scrollY >= raiz.scrollHeight - 2

  if (noFim) return ultima

  return SECOES.reduce((atual, [id]) => {
    const titulo = document.getElementById(id)

    return titulo && titulo.getBoundingClientRect().top <= DISTANCIA_DO_TOPO ? id : atual
  }, SECOES[0][0])
}

function emSequencia(nomes) {
  if (nomes.length < 2) return nomes.join('')

  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}

function servicosDeHoje(servicos = []) {
  const principal = servicos.find((servico) => servico.papel === 'principal')
  const reservas = servicos
    .filter((servico) => servico.papel === 'reserva')
    .map((servico) => servico.nome)

  if (principal && reservas.length === 1) {
    return `Hoje, o serviço principal é o ${principal.nome}; quando ele não responde, entra o ${reservas[0]}.`
  }

  if (principal && reservas.length) {
    return `Hoje, o serviço principal é o ${principal.nome}; quando ele não responde, entram ${emSequencia(reservas)}.`
  }

  if (principal) return `Hoje, o serviço usado é o ${principal.nome}.`

  if (reservas.length === 1) return `Hoje, o serviço usado é o ${reservas[0]}.`

  if (reservas.length) return `Hoje, os serviços usados são ${emSequencia(reservas)}.`

  return ''
}

function Encarregado({ dados, carregando }) {
  if (carregando) {
    return <p role="status">Carregando o contato...</p>
  }

  if (dados?.encarregado) {
    return (
      <p>
        Um Administrador da AC2 responde pelos seus dados na plataforma:{' '}
        <strong>{dados.encarregado.nome}</strong>, pelo e-mail{' '}
        <a href={`mailto:${dados.encarregado.email}`}>{dados.encarregado.email}</a>.
      </p>
    )
  }

  return (
    <>
      <p>
        O encarregado de dados é um Administrador da AC2. Enquanto o nome dele não
        está publicado aqui, fale com:
      </p>
      <ul className="privacidade__contatos">
        {(dados?.contatos || []).map((contato) => (
          <li key={contato.email}>
            {contato.nome}: <a href={`mailto:${contato.email}`}>{contato.email}</a>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function PrivacidadePage() {
  const { isAuthenticated } = useAuth()
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [secaoAtual, setSecaoAtual] = useState(SECOES[0][0])
  const [indiceAberto, setIndiceAberto] = useState(false)
  const pausaAte = useRef(0)

  useEffect(() => {
    const acompanhar = () => {
      if (Date.now() < pausaAte.current) return

      setSecaoAtual(secaoNaTela())
    }

    window.addEventListener('scroll', acompanhar, { passive: true })

    return () => window.removeEventListener('scroll', acompanhar)
  }, [])

  const irParaSecao = (id) => {
    pausaAte.current = Date.now() + PAUSA_APOS_CLIQUE
    setSecaoAtual(id)
    setIndiceAberto(false)
  }

  useEffect(() => {
    let ativo = true

    lerPrivacidade()
      .then((resposta) => {
        if (ativo) setDados(resposta)
      })
      .catch(() => {
        if (ativo) setDados(null)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [])

  const retencao = dados?.retencao ?? RETENCAO_PADRAO
  const hoje = servicosDeHoje(dados?.servicos_de_ia)

  return (
    <main className="privacidade">
      <article className="privacidade__documento">
        <header className="privacidade__cabecalho">
          <p className="privacidade__kicker">
            <Icone icon={appIcons.lock} />
            P&amp;D Connect · AC2 Microbiologia
          </p>
          <h1>Privacidade e seus dados</h1>
          <p className="privacidade__lead">
            O que a AC2 guarda sobre você nesta plataforma, para quê, com quem
            compartilha e o que você pode fazer.
          </p>
          <p className="privacidade__data">Atualizado em {ATUALIZADO_EM}.</p>
        </header>

        <section className="privacidade__resumo" aria-labelledby="privacidade-resumo">
          <h2 id="privacidade-resumo">Em resumo</h2>
          <dl>
            {RESUMO.map((item) => (
              <div key={item.termo} className="privacidade__resumo-item">
                <dt>
                  <span className="privacidade__resumo-icone">
                    <Icone icon={item.icone} />
                  </span>
                  {item.termo}
                </dt>
                <dd>
                  {item.texto}
                  {item.levaAosDados && isAuthenticated ? (
                    <Link className="privacidade__resumo-link" to="/perfil">
                      Ir para Meus dados
                      <Icone icon={appIcons.next} />
                    </Link>
                  ) : null}
                  {item.levaAosDados && !isAuthenticated ? (
                    <a
                      className="privacidade__resumo-link"
                      href="#privacidade-direitos"
                      onClick={() => irParaSecao('privacidade-direitos')}
                    >
                      Como fazer
                      <Icone icon={appIcons.next} />
                    </a>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="privacidade__corpo">
          <nav
            className={`privacidade__indice${indiceAberto ? ' is-aberto' : ''}`}
            aria-label="Nesta página"
          >
            <p className="privacidade__indice-titulo" aria-hidden="true">Nesta página</p>
            <button
              type="button"
              className="privacidade__indice-alternar"
              aria-expanded={indiceAberto}
              aria-controls="privacidade-indice-lista"
              onClick={() => setIndiceAberto((aberto) => !aberto)}
            >
              Nesta página
              <Icone
                icon={appIcons.disclosure}
                className={`disclosure__chevron${indiceAberto ? ' is-open' : ''}`}
              />
            </button>
            <ul id="privacidade-indice-lista" className="privacidade__indice-lista">
              {SECOES.map(([id, titulo]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    aria-current={secaoAtual === id ? 'location' : undefined}
                    onClick={() => irParaSecao(id)}
                  >
                    {titulo}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="privacidade__conteudo">
            <section aria-labelledby="privacidade-quem">
              <h2 id="privacidade-quem">Quem é responsável</h2>
              <p>
                A AC2 Microbiologia decide como os dados são usados. O P&amp;D Connect serve
                ao Núcleo de P&amp;D da AC2 para levar oportunidades de pesquisa da entrada à
                decisão.
              </p>
            </section>

            <section aria-labelledby="privacidade-quais">
              <h2 id="privacidade-quais">O que guardamos</h2>
              <ul className="privacidade__lista">
                {DADOS.map(([termo, texto]) => (
                  <li key={termo}>
                    <strong>{termo}:</strong> {texto}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="privacidade-para-que">
              <h2 id="privacidade-para-que">Para que usamos e com que base</h2>
              <div className="privacidade__tabela">
                <table aria-labelledby="privacidade-para-que">
                  <thead>
                    <tr>
                      <th scope="col">Para quê</th>
                      <th scope="col">Base legal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BASES.map(([finalidade, base]) => (
                      <tr key={finalidade}>
                        <td>{finalidade}</td>
                        <td>{base}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="privacidade-compartilhamento">
              <h2 id="privacidade-compartilhamento">Com quem compartilhamos</h2>
              <dl className="privacidade__destinos">
                <div>
                  <dt>Serviços de IA</dt>
                  <dd>
                    Os serviços de IA ligados à plataforma recebem os textos das propostas, as
                    respostas ao Copiloto e o perfil profissional das pessoas sugeridas, sem
                    nome, e-mail ou telefone. {hoje ? `${hoje} ` : ''}Eles podem processar
                    esses textos fora do Brasil, o que é uma transferência internacional.
                  </dd>
                </div>
                <div>
                  <dt>Hospedagem</dt>
                  <dd>
                    Os dados e os documentos anexados ficam guardados no Brasil, na empresa que
                    hospeda a plataforma.
                  </dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>
                    Os avisos de conta, como convite e redefinição de senha, saem por um
                    provedor de e-mail. A empresa demandante também recebe por e-mail as
                    decisões Revisar, Continuar e Arquivar sobre o problema dela: o aviso
                    leva o nome da pessoa, o código e o título do problema e, no Revisar, o
                    pedido de complementação. O provedor pode guardar a mensagem fora do
                    Brasil.
                  </dd>
                </div>
              </dl>
              <p>Nenhum dado é vendido nem publicado, e a rede interna não é pública.</p>
            </section>

            <section aria-labelledby="privacidade-tempo">
              <h2 id="privacidade-tempo">Por quanto tempo</h2>
              <p>
                Guardamos os registros de acesso à conta por{' '}
                <strong>{retencao.eventos_conta_meses} meses</strong>. Depois desse
                prazo, eles são anonimizados: a data e o tipo do acesso continuam na
                trilha de segurança, mas o vínculo com a sua conta é desfeito.
              </p>
              <p>
                Documentos anexados a uma oportunidade ficam guardados enquanto ela
                existir e por{' '}
                <strong>{retencao.anexos_apos_arquivamento_meses} meses</strong> após o
                arquivamento. Vencido esse prazo, os arquivos são descartados.
              </p>
            </section>

            <section aria-labelledby="privacidade-direitos">
              <h2 id="privacidade-direitos">Seus direitos</h2>
              <p>Você pode:</p>
              <ul className="privacidade__direitos">
                {DIREITOS.map((direito) => (
                  <li key={direito}>
                    <Icone icon={appIcons.done} />
                    {direito}
                  </li>
                ))}
              </ul>
              {isAuthenticated ? (
                <div className="privacidade__acao">
                  <Link className="btn btn-primary" to="/perfil">
                    Abrir Meus dados
                  </Link>
                  <span>Lá você baixa a cópia e pede a exclusão da conta.</span>
                </div>
              ) : (
                <p>
                  Depois de entrar, a seção Meus dados do seu perfil permite baixar a cópia e
                  pedir a exclusão da conta.
                </p>
              )}
            </section>

            <section aria-labelledby="privacidade-encarregado">
              <h2 id="privacidade-encarregado">Encarregado de dados</h2>
              <Encarregado dados={dados} carregando={carregando} />
            </section>

            <p className="privacidade__voltar">
              <Link to={isAuthenticated ? '/painel' : '/login'}>
                <Icone icon={appIcons.back} />
                {isAuthenticated ? 'Voltar para a plataforma' : 'Voltar para a entrada'}
              </Link>
            </p>
          </div>
        </div>
      </article>
    </main>
  )
}
