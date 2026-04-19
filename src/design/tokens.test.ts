import { describe, expect, it } from 'vitest'
import { accent, ink } from './tokens'

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value

  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  }
}

function toHsl(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { saturation: 0, lightness }
  }

  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)

  return { saturation, lightness }
}

describe('design tokens', () => {
  it('keeps accent saturation at or below 25%', () => {
    Object.values(accent).forEach((color) => {
      const { saturation } = toHsl(color)
      expect(saturation).toBeLessThanOrEqual(0.25)
    })
  })

  it('keeps ink lightness strictly descending', () => {
    const lightnessScale = Object.values(ink).map((color) => toHsl(color).lightness)

    for (let index = 1; index < lightnessScale.length; index += 1) {
      expect(lightnessScale[index - 1]).toBeGreaterThan(lightnessScale[index])
    }
  })
})
