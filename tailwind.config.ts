import type { Config } from 'tailwindcss'
import { focus, ink, accent, motion, radius, space, status, type } from './src/design/tokens'

const spacing = Object.fromEntries(
  Object.entries(space).map(([token, value]) => [token, `${value}px`]),
)

const borderRadius = Object.fromEntries(
  Object.entries(radius).map(([token, value]) => [token, `${value}px`]),
)

const transitionDuration = Object.fromEntries(
  Object.entries(motion.duration).map(([token, value]) => [token, `${value}ms`]),
)

const fontSize = Object.fromEntries(
  Object.entries(type.size).map(([token, value]) => [token, `${value}px`]),
)

const lineHeight = Object.fromEntries(
  Object.entries(type.leading).map(([token, value]) => [token, `${value}`]),
)

const config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink,
        accent,
        status,
        focus: {
          ring: focus.ring,
          selection: focus.selection,
        },
      },
      fontFamily: {
        sans: type.family.sans,
        mono: type.family.mono,
      },
      fontSize,
      fontWeight: type.weight,
      letterSpacing: type.tracking,
      lineHeight,
      spacing,
      borderRadius,
      transitionDuration,
    },
  },
  plugins: [],
} satisfies Config

export default config
