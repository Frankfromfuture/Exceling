import { describe, expect, it } from 'vitest'
import { simulateWhatIf } from './simulate'
import type { ParsedCell } from '../../types'

function cell(partial: Partial<ParsedCell> & Pick<ParsedCell, 'address'>): ParsedCell {
  return {
    col: 0,
    row: 0,
    value: null,
    rawValue: null,
    formula: null,
    label: null,
    comment: null,
    isMarked: false,
    isPercent: false,
    ...partial,
  }
}

describe('simulateWhatIf', () => {
  it('recomputes arithmetic chains from overrides', () => {
    const cells: ParsedCell[] = [
      cell({ address: 'A1', value: 100 }),
      cell({ address: 'B1', value: 120, formula: '=A1*1.2' }),
      cell({ address: 'C1', value: 130, formula: '=B1+10' }),
    ]

    const scenario = simulateWhatIf(cells, { A1: 200 })

    expect(scenario.recomputed.A1).toBe(200)
    expect(scenario.recomputed.B1).toBe(240)
    expect(scenario.recomputed.C1).toBe(250)
    expect(scenario.delta.C1.abs).toBe(120)
  })

  it('supports simple IF branches', () => {
    const cells: ParsedCell[] = [
      cell({ address: 'A1', value: 120 }),
      cell({ address: 'B1', value: 12, formula: '=IF(A1>100,A1*0.1,A1*0.05)' }),
    ]

    const scenario = simulateWhatIf(cells, { A1: 80 })

    expect(scenario.recomputed.B1).toBe(4)
  })

  it('falls back to baseline values for unsupported formulas', () => {
    const cells: ParsedCell[] = [
      cell({ address: 'A1', value: 10 }),
      cell({ address: 'B1', value: 99, formula: '=VLOOKUP(A1,C1:D5,2,FALSE)' }),
    ]

    const scenario = simulateWhatIf(cells, { A1: 20 })

    expect(scenario.recomputed.B1).toBe(99)
    expect(scenario.unsupportedCells).toContain('B1')
  })
})
