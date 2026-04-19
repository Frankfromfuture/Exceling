export const ink = {
  0: '#FFFFFF',
  50: '#FAFAFA',
  100: '#F4F4F5',
  200: '#E4E4E7',
  300: '#D4D4D8',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#27272A',
  900: '#18181B',
  1000: '#0A0A0A',
} as const

export const accent = {
  sage: '#8CA291',
  mauve: '#BB8F96',
  slate: '#8195A6',
  sand: '#AE9F7E',
} as const

export const status = {
  ok: '#6B8E6B',
  warn: '#B89968',
  err: '#A85856',
  info: '#6B8195',
} as const

export const focus = {
  ring: ink[1000],
  offset: 2,
  selection: ink[900],
} as const

export const type = {
  family: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    mono: ['JetBrains Mono', 'Geist Mono', 'SF Mono', 'Consolas', 'monospace'],
  },
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"JetBrains Mono", "Geist Mono", "SF Mono", Consolas, monospace',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 16,
    lg: 20,
    xl: 28,
    '2xl': 40,
    '3xl': 56,
  },
  weight: {
    regular: 400,
    medium: 500,
    bold: 700,
  },
  tracking: {
    display: '-0.02em',
    body: '0',
    label: '0.06em',
    mono: '0',
  },
  leading: {
    display: 1.1,
    title: 1.25,
    body: 1.5,
    compact: 1.2,
  },
} as const

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 128,
} as const

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const

export const motion = {
  duration: {
    instant: 100,
    default: 200,
    slow: 300,
  },
  easing: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    linear: 'linear',
  },
} as const
