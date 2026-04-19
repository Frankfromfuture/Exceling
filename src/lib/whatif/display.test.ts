import { describe, expect, it } from 'vitest'
import { valuesRemainUniform } from './display'

describe('valuesRemainUniform', () => {
  it('treats tiny floating-point drift as uniform', () => {
    expect(valuesRemainUniform([0.3, 0.1 + 0.2, 0.3000000001])).toBe(true)
  })

  it('detects real divergence', () => {
    expect(valuesRemainUniform([10, 12, 10])).toBe(false)
  })
})
