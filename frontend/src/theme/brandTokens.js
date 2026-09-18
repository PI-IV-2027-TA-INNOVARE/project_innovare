export const AC2_PALETTE = Object.freeze({
  orange: '#E07B1A',
  orangeDark: '#B8610F',
  orangeLight: '#FEF3E7',
  navy: '#0B2545',
  navyDeep: '#060F1E',
  navyLight: '#EDF1F7',
  textMuted: '#536070',
  border: '#DDE4ED',
  background: '#F5F7FA',
  white: '#FFFFFF',
})

export const UI_SURFACES = Object.freeze({
  background: '#E4E9F0',
  backgroundAlt: '#DBE2EC',
  card: '#EFF1F4',
  textPrimary: '#0F1A28',
  border: '#CED6E1',
})

export const BRAND_TOKEN_GROUPS = Object.freeze([
  {
    id: 'marca',
    label: 'Marca',
    description: 'Cores de identidade da AC2 aplicadas a botões, links e destaques.',
    tokens: [
      {
        id: 'accentPrimary',
        label: 'Laranja institucional',
        kind: 'primaria',
        hint: 'Botões, links, foco e destaques da marca.',
        cssVar: '--accent-primary',
        light: AC2_PALETTE.orange,
        dark: '#F0913A',
        derive: (value) => ({
          '--accent-primary-dim': withAlpha(value, 0.14),
          '--border-accent': withAlpha(value, 0.32),
          '--shadow-focus': `0 0 0 4px ${withAlpha(value, 0.18)}`,
          '--shadow-accent': `0 18px 45px ${withAlpha(value, 0.24)}`,
          '--bg-auth-radial': withAlpha(value, 0.12),
        }),
      },
      {
        id: 'accentPrimaryStrong',
        label: 'Laranja escuro (hover)',
        kind: 'hover',
        hint: 'Estado hover e pressionado dos elementos laranja.',
        cssVar: '--accent-primary-strong',
        light: AC2_PALETTE.orangeDark,
        dark: '#FFB068',
      },
      {
        id: 'accentSecondary',
        label: 'Navy institucional',
        kind: 'secundaria',
        hint: 'Painéis institucionais e gradientes de marca.',
        cssVar: '--accent-secondary',
        light: AC2_PALETTE.navy,
        dark: '#6F9AD1',
        derive: (value) => ({
          '--accent-secondary-dim': withAlpha(value, 0.1),
          '--brand-panel-glow': withAlpha(value, 0.18),
        }),
      },
      {
        id: 'accentWarm',
        label: 'Laranja claro (fundo de destaque)',
        kind: 'destaque',
        hint: 'Fundo de avisos e faixas de destaque.',
        cssVar: '--accent-warm',
        light: AC2_PALETTE.orangeLight,
        dark: 'rgba(224, 123, 26, 0.16)',
      },
    ],
  },
  {
    id: 'superficies',
    label: 'Superfícies',
    description: 'Fundo da aplicação e dos cartões.',
    tokens: [
      {
        id: 'bgPrimary',
        label: 'Fundo da página',
        kind: 'superficie',
        hint: 'Fundo da aplicação inteira.',
        cssVar: '--bg-primary',
        light: UI_SURFACES.background,
        dark: AC2_PALETTE.navyDeep,
      },
      {
        id: 'bgSecondary',
        label: 'Fundo secundário',
        kind: 'superficie',
        hint: 'Blocos internos e cabeçalhos de tabela.',
        cssVar: '--bg-secondary',
        light: UI_SURFACES.backgroundAlt,
        dark: '#0B1626',
      },
      {
        id: 'bgCard',
        label: 'Cartões e painéis',
        kind: 'superficie',
        hint: 'Cartões, painéis e menus suspensos.',
        cssVar: '--bg-card',
        light: UI_SURFACES.card,
        dark: '#101C2E',
      },
    ],
  },
  {
    id: 'texto',
    label: 'Texto e bordas',
    description: 'Legibilidade do conteúdo.',
    tokens: [
      {
        id: 'textPrimary',
        label: 'Texto principal',
        kind: 'texto',
        hint: 'Títulos e corpo de texto.',
        cssVar: '--text-primary',
        light: UI_SURFACES.textPrimary,
        dark: AC2_PALETTE.navyLight,
      },
      {
        id: 'textMuted',
        label: 'Texto de apoio',
        kind: 'texto',
        hint: 'Legendas, descrições e placeholders.',
        cssVar: '--text-muted',
        light: AC2_PALETTE.textMuted,
        dark: '#93A3B8',
      },
      {
        id: 'borderColor',
        label: 'Bordas',
        kind: 'borda',
        hint: 'Contorno de cartões, campos e divisórias.',
        cssVar: '--border-color',
        light: UI_SURFACES.border,
        dark: 'rgba(237, 241, 247, 0.14)',
      },
    ],
  },
  {
    id: 'estados',
    label: 'Estados',
    description: 'Feedback de sucesso e de erro.',
    tokens: [
      {
        id: 'accentGreen',
        label: 'Sucesso',
        kind: 'estado',
        hint: 'Confirmações e situações ativas.',
        cssVar: '--accent-green',
        light: '#2F7D5B',
        dark: '#5FB18A',
      },
      {
        id: 'accentError',
        label: 'Erro',
        kind: 'estado',
        hint: 'Erros de validação e ações destrutivas.',
        cssVar: '--accent-error',
        light: '#C6392B',
        dark: '#E2705F',
        derive: (value) => ({ '--bg-danger-soft': withAlpha(value, 0.1) }),
      },
    ],
  },
])

export const TOKEN_KIND_LABELS = Object.freeze({
  primaria: 'Primária',
  hover: 'Hover',
  secundaria: 'Secundária',
  destaque: 'Destaque',
  superficie: 'Superfície',
  texto: 'Texto',
  borda: 'Borda',
  estado: 'Estado',
})

export const BRAND_TOKENS = BRAND_TOKEN_GROUPS.flatMap((group) => group.tokens)

export function getDefaultBranding(theme = 'light') {
  const key = theme === 'dark' ? 'dark' : 'light'

  return BRAND_TOKENS.reduce((accumulator, token) => {
    accumulator[token.id] = token[key]
    return accumulator
  }, {})
}

export function buildCssVariables(branding = {}) {
  const variables = {}

  for (const token of BRAND_TOKENS) {
    const value = branding[token.id]

    if (!value) continue

    variables[token.cssVar] = value

    if (typeof token.derive === 'function') {
      Object.assign(variables, token.derive(value))
    }
  }

  return variables
}

function parseHex(color) {
  const hex = String(color || '').trim().replace('#', '')

  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    }
  }

  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }

  return null
}

export function withAlpha(color, alpha) {
  const rgb = parseHex(color)

  if (!rgb) return color

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function shade(color, factor) {
  const rgb = parseHex(color)

  if (!rgb) return color

  const clamp = (channel) => Math.max(0, Math.min(255, Math.round(channel * factor)))
  const toHex = (channel) => clamp(channel).toString(16).padStart(2, '0')

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export function isValidHex(color) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color || '').trim())
}

export function toRgbaString(color, alpha = 1) {
  const rgb = parseHex(color)

  if (!rgb) return String(color || '')

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function getDerivedVariables(token, value) {
  if (!token || typeof token.derive !== 'function' || !value) return []

  return Object.entries(token.derive(value)).map(([name, derivedValue]) => ({
    name,
    value: derivedValue,
  }))
}
