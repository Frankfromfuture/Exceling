import type { WhatIfDelta, WhatIfScenario } from '../../types'

export function getScenarioValue(
  scenario: WhatIfScenario | null | undefined,
  cellId: string,
  fallback: number | string | null,
): number | string | null {
  const nextValue = scenario?.recomputed[cellId.toUpperCase()]
  return nextValue === undefined ? fallback : nextValue
}

export function getScenarioDelta(
  scenario: WhatIfScenario | null | undefined,
  cellId: string,
): WhatIfDelta | null {
  return scenario?.delta[cellId.toUpperCase()] ?? null
}

export function valuesRemainUniform(values: Array<number | string | null>): boolean {
  if (values.length <= 1) return true
  const first = values[0]
  return values.every(value => {
    if (typeof first === 'number' && typeof value === 'number') {
      return Math.abs(first - value) < 1e-9
    }
    return value === first
  })
}
