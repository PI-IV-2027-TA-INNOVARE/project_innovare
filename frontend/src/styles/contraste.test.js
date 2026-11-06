import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getDefaultBranding } from '../theme/brandTokens'

/**
 * Contraste dos textos auxiliares, medido na fonte dos tokens.
 *
 * Por que isto e teste e nao revisao visual: contraste insuficiente nao
 * quebra nada, nao aparece em nenhum log e some num monitor bom. Quem paga
 * e quem le a tela numa sala clara, num projetor, ou com baixa visao.
 *
 * O caso vale para o `::placeholder` porque nesta plataforma ele **carrega
 * orientacao**, nao decoracao: na tela Meu Perfil os exemplos de competencia,
 * tecnica e linha de pesquisa vivem no placeholder. Texto que instrui precisa
 * dos 4,5:1 da WCAG 2.2 AA para texto normal.
 *
 * A conta e feita a partir do SCSS de verdade - token de cor, fundo e a
 * opacidade aplicada - porque e a combinacao dos tres que o olho recebe. Um
 * token com contraste otimo atras de `opacity: .75` chega ao usuario abaixo
 * do minimo, e foi exatamente o que aconteceu aqui.
 *
 * A cor de Alerta tambem vira texto: o selo "Aguardando revisao", o nivel
 * "Fragil" e o "Recuou" da pre-analise. Esses textos usavam o Laranja claro,
 * que e um fundo, e chegavam perto de 1:1 sobre o cartao. Por isso o Laranja
 * claro so pode pintar fundo, e o teste varre as folhas atras de outro uso.
 *
 * O selo do perfil Administrador tinha texto branco sobre o laranja da marca:
 * 2,99:1 no tema claro. O fundo passou ao laranja de texto
 * (`--accent-primary-text`), que no claro e o laranja escurecido e no escuro e
 * o proprio laranja, sob texto preto.
 *
 * O aviso de alerta morava no estilo das telas de Oportunidade, que so carrega
 * com elas; o Administrador, que nao tem Oportunidades no menu, via os avisos
 * da Saude e de Meus dados sem a cor. Agora mora no estilo comum do console. A
 * linha de quem pediu exclusao ganha um fundo de Alerta, e o texto do pedido,
 * tambem em Alerta, precisa manter 4,5:1 sobre esse fundo.
 *
 * Na tela de Permissoes, "Sim" e um selo cheio de Sucesso, com o texto da cor
 * de destaque por cima, e os valores parciais sao uma tinta de azul-marinho.
 * A tinta de Sucesso com texto verde nao serve: chega a 3,7:1 no tema claro.
 * Na legenda os mesmos valores parciais ficam fora do cartao, entao a conta
 * vale tambem sobre o fundo da pagina.
 * O aviso da tabela de provedores, na Saude, e texto de Alerta sobre uma tinta
 * de Alerta. Os selos de estado da Saude seguem a mesma conta: atencao e texto
 * de Alerta sobre tinta de Alerta, e critico e um selo cheio de Erro com o
 * texto da cor de destaque, porque texto vermelho sobre tinta vermelha fica
 * abaixo de 4,5:1 no tema claro. Os selos de situacao da Auditoria usam a mesma
 * conta, para Negado e Erro se destacarem de Concluido, que e a maioria das
 * linhas e fica discreto. Antes as tres classes nao existiam e os selos saiam
 * iguais, sem cor nenhuma.
 */

const AA_TEXTO_NORMAL = 4.5

function fonte(caminho) {
  return readFileSync(
    fileURLToPath(new URL(caminho, import.meta.url)),
    'utf8'
  )
}

function valorDeVariavel(scss, nome) {
  const prefixo = '$' + nome + ':'
  const linha = scss
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefixo))

  const hex = linha ? linha.match(/#[0-9a-f]{6}/i) : null

  if (!hex) {
    throw new Error(
      'A variavel ' + prefixo + ' saiu de _colors.scss ou deixou de ser hex.'
    )
  }

  return hex[0]
}

function opacidadeDoPlaceholder(scss, seletor) {
  const inicio = scss.indexOf('.' + seletor + ' {')

  if (inicio < 0) {
    throw new Error('Nao achei a regra .' + seletor + ' em _console.scss.')
  }

  const fim = scss.indexOf('\n}', inicio)
  const bloco = scss.slice(inicio, fim < 0 ? undefined : fim)
  const placeholder = bloco.indexOf('::placeholder')

  if (placeholder < 0) {
    throw new Error('A regra .' + seletor + ' perdeu o ::placeholder.')
  }

  const declarada = bloco.slice(placeholder).match(/opacity: *([0-9.]+)/)

  return declarada ? Number(declarada[1]) : 1
}

function luminancia(hex) {
  const canal = (valor) => {
    const v = valor / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }

  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function sobre(frente, fundo, alfa) {
  const canais = [1, 3, 5].map((i) => {
    const f = parseInt(frente.slice(i, i + 2), 16)
    const b = parseInt(fundo.slice(i, i + 2), 16)
    return Math.round(f * alfa + b * (1 - alfa))
  })

  return `#${canais.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function contraste(frente, fundo) {
  const a = luminancia(frente)
  const b = luminancia(fundo)

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const cores = fonte('./variables/_colors.scss')
const console_ = fonte('./components/_console.scss')

const TEMAS = [
  { nome: 'claro', muted: 'color-text-muted', fundo: 'color-surface' },
  { nome: 'escuro', muted: 'color-text-muted-dark', fundo: 'color-surface-dark' },
]

const CAMPOS = ['admin-input', 'admin-search__input']

describe('contraste do placeholder — WCAG 2.2 AA', () => {
  for (const campo of CAMPOS) {
    for (const tema of TEMAS) {
      it(`.${campo} no tema ${tema.nome} entrega 4,5:1 ao usuario`, () => {
        const frente = valorDeVariavel(cores, tema.muted)
        const fundo = valorDeVariavel(cores, tema.fundo)
        const alfa = opacidadeDoPlaceholder(console_, campo)

        const efetiva = sobre(frente, fundo, alfa)
        const razao = contraste(efetiva, fundo)

        expect(
          razao,
          `${frente} a ${alfa} de opacidade sobre ${fundo} chega como ${efetiva} `
            + `= ${razao.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      })
    }
  }
})

const FUNDOS = ['bgPrimary', 'bgSecondary', 'bgCard']

describe('contraste da cor de Alerta — WCAG 2.2 AA', () => {
  for (const tema of ['light', 'dark']) {
    const paleta = getDefaultBranding(tema)

    for (const fundo of FUNDOS) {
      it(`como texto sobre ${fundo} no tema ${tema} entrega 4,5:1`, () => {
        const razao = contraste(paleta.accentWarning, paleta[fundo])

        expect(
          razao,
          `${paleta.accentWarning} sobre ${paleta[fundo]} = ${razao.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      })
    }
  }
})

const globais = fonte('./base/_globals.scss')

function laranjaDeTexto(laranja) {
  const receita = globais.match(
    /--accent-primary-text:\s*color-mix\(in srgb, var\(--accent-primary\) (\d+)%, (#[0-9a-f]{6})\)/i
  )

  if (!receita) throw new Error('O --accent-primary-text do tema claro mudou de receita.')

  return sobre(laranja, receita[2], Number(receita[1]) / 100)
}

describe('selo do perfil Administrador — WCAG 2.2 AA', () => {
  it('pinta o fundo com o laranja de texto, e não com o laranja da marca', () => {
    const inicio = console_.indexOf('\n.role-badge {')
    const bloco = console_.slice(inicio, console_.indexOf('\n}', inicio))

    expect(bloco).toMatch(/&--administrador\s*\{[^}]*background:\s*var\(--accent-primary-text\)/)
  })

  it('o texto do selo entrega 4,5:1 nos dois temas', () => {
    const claro = laranjaDeTexto(getDefaultBranding('light').accentPrimary)
    const escuro = getDefaultBranding('dark').accentPrimary

    expect(contraste(valorDeVariavel(cores, 'color-text-inverse'), claro))
      .toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    expect(contraste(valorDeVariavel(cores, 'color-text-inverse-dark'), escuro))
      .toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
  })
})

describe('selos da tela de Permissões — WCAG 2.2 AA', () => {
  const telaAdmin = fonte('../pages/admin/AdminPage.scss')
  const parcial = telaAdmin.match(
    /\.permissoes__valor--administrativo\s*\{[^}]*color:\s*var\(--accent-secondary\)[^}]*background:\s*color-mix\(in srgb, var\(--accent-secondary\) (\d+)%/
  )

  it('"Sim" é Sucesso cheio, e os valores parciais são tinta de azul-marinho', () => {
    expect(telaAdmin).toMatch(
      /\.permissoes__valor--sim\s*\{[^}]*color:\s*var\(--text-on-accent\)[^}]*background:\s*var\(--accent-green\)/
    )
    expect(parcial).not.toBeNull()
  })

  for (const [tema, textoSobreCor] of [['light', 'color-text-inverse'], ['dark', 'color-text-inverse-dark']]) {
    it(`o texto dos selos entrega 4,5:1 no tema ${tema}`, () => {
      const paleta = getDefaultBranding(tema)
      const fundoParcial = sobre(paleta.accentSecondary, paleta.bgCard, Number(parcial[1]) / 100)

      expect(contraste(valorDeVariavel(cores, textoSobreCor), paleta.accentGreen))
        .toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      expect(contraste(paleta.accentSecondary, fundoParcial)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    })

    for (const fundo of FUNDOS) {
      it(`na legenda, o texto do valor parcial entrega 4,5:1 sobre ${fundo} no tema ${tema}`, () => {
        const paleta = getDefaultBranding(tema)
        const tinta = sobre(paleta.accentSecondary, paleta[fundo], Number(parcial[1]) / 100)

        expect(contraste(paleta.accentSecondary, tinta)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      })
    }
  }
})

describe('aviso da tabela de provedores na Saúde — WCAG 2.2 AA', () => {
  const telaAdmin = fonte('../pages/admin/AdminPage.scss')
  const aviso = telaAdmin.match(
    /\.saude__tabela-aviso\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent-warning\) (\d+)%[^}]*color:\s*var\(--accent-warning\)/
  )

  it('usa a cor de Alerta, e não cores fixas de tema claro', () => {
    expect(aviso).not.toBeNull()
  })

  for (const tema of ['light', 'dark']) {
    it(`o texto do aviso entrega 4,5:1 no tema ${tema}`, () => {
      const paleta = getDefaultBranding(tema)
      const fundo = sobre(paleta.accentWarning, paleta.bgCard, Number(aviso[1]) / 100)

      expect(contraste(paleta.accentWarning, fundo)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    })
  }
})

describe('selos de estado na Saúde — WCAG 2.2 AA', () => {
  const telaAdmin = fonte('../pages/admin/AdminPage.scss')
  const inicio = telaAdmin.indexOf('\n.saude__selo {')
  const selo = telaAdmin.slice(inicio, telaAdmin.indexOf('\n}', inicio))
  const atencao = selo.match(
    /&--atencao\s*\{[^}]*color:\s*var\(--accent-warning\)[^}]*background:\s*color-mix\(in srgb, var\(--accent-warning\) (\d+)%/
  )

  it('atenção é tinta de Alerta, e crítico é Erro cheio com o texto da cor de destaque', () => {
    expect(atencao).not.toBeNull()
    expect(selo).toMatch(/&--critico\s*\{[^}]*color:\s*var\(--text-on-accent\)[^}]*background:\s*var\(--accent-error\)/)
  })

  for (const [tema, textoSobreCor] of [['light', 'color-text-inverse'], ['dark', 'color-text-inverse-dark']]) {
    it(`o texto dos selos de atenção e de crítico entrega 4,5:1 no tema ${tema}`, () => {
      const paleta = getDefaultBranding(tema)
      const fundoAtencao = sobre(paleta.accentWarning, paleta.bgCard, Number(atencao[1]) / 100)

      expect(contraste(paleta.accentWarning, fundoAtencao)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      expect(contraste(valorDeVariavel(cores, textoSobreCor), paleta.accentError))
        .toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    })
  }
})

describe('selos de situação na Auditoria — WCAG 2.2 AA', () => {
  const inicio = console_.indexOf('\n.status-badge {')
  const selo = console_.slice(inicio, console_.indexOf('\n}', inicio))
  const concluido = selo.match(
    /&--ok\s*\{[^}]*color:\s*var\(--accent-secondary\)[^}]*background:\s*color-mix\(in srgb, var\(--accent-secondary\) (\d+)%/
  )
  const negado = selo.match(
    /&--negado\s*\{[^}]*color:\s*var\(--accent-warning\)[^}]*background:\s*color-mix\(in srgb, var\(--accent-warning\) (\d+)%/
  )

  it('concluído é discreto, negado é tinta de Alerta e erro é Erro cheio', () => {
    expect(concluido).not.toBeNull()
    expect(negado).not.toBeNull()
    expect(selo).toMatch(/&--erro\s*\{[^}]*color:\s*var\(--text-on-accent\)[^}]*background:\s*var\(--accent-error\)/)
  })

  for (const [tema, textoSobreCor] of [['light', 'color-text-inverse'], ['dark', 'color-text-inverse-dark']]) {
    it(`o texto dos três selos entrega 4,5:1 no tema ${tema}`, () => {
      const paleta = getDefaultBranding(tema)
      const fundoConcluido = sobre(paleta.accentSecondary, paleta.bgCard, Number(concluido[1]) / 100)
      const fundoNegado = sobre(paleta.accentWarning, paleta.bgCard, Number(negado[1]) / 100)

      expect(contraste(paleta.accentSecondary, fundoConcluido)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      expect(contraste(paleta.accentWarning, fundoNegado)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
      expect(contraste(valorDeVariavel(cores, textoSobreCor), paleta.accentError))
        .toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    })
  }
})

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

const folhas = readdirSync(RAIZ, { recursive: true })
  .filter((arquivo) => arquivo.endsWith('.scss'))
  .map((arquivo) => ({ arquivo, scss: readFileSync(join(RAIZ, arquivo), 'utf8') }))

describe('o Laranja claro é fundo, não alerta', () => {
  it('nenhuma folha usa o Laranja claro em texto, ícone ou borda', () => {
    const usos = folhas.flatMap(({ arquivo, scss }) => scss
      .split('\n')
      .filter((linha) => linha.includes('var(--accent-warm)') && !/^\s*background:/.test(linha))
      .map((linha) => `${arquivo}: ${linha.trim()}`))

    expect(usos).toEqual([])
  })

  it('o aviso de alerta usa a cor de Alerta e mora no estilo comum, que toda tela carrega', () => {
    const inicio = console_.indexOf('\n.admin-callout--alerta {')
    const bloco = console_.slice(inicio, console_.indexOf('\n}', inicio))
    const donos = folhas
      .filter(({ scss }) => scss.includes('.admin-callout--alerta {'))
      .map(({ arquivo }) => arquivo)

    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/border-left-color:\s*var\(--accent-warning\)/)
    expect(donos).toEqual([join('styles', 'components', '_console.scss')])
  })
})

describe('pedido de exclusão em destaque — WCAG 2.2 AA', () => {
  const linha = console_.match(/tbody tr\.is-pedido\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--accent-warning\) (\d+)%/)

  it('a linha de quem pediu exclusão e o texto do pedido usam a cor de Alerta', () => {
    expect(linha).not.toBeNull()
    expect(console_).toMatch(/\.user-cell__pedido\s*\{[^}]*color:\s*var\(--accent-warning\)/)
  })

  for (const tema of ['light', 'dark']) {
    it(`o texto do pedido entrega 4,5:1 sobre a linha destacada no tema ${tema}`, () => {
      const paleta = getDefaultBranding(tema)
      const fundo = sobre(paleta.accentWarning, paleta.bgCard, Number(linha[1]) / 100)

      expect(contraste(paleta.accentWarning, fundo)).toBeGreaterThanOrEqual(AA_TEXTO_NORMAL)
    })
  }
})
