import { describe, expect, it } from 'vitest'
import { graphToFormula } from './serializeGraph'
import type { FlowEdge, FlowNode } from '../../types'

describe('graphToFormula', () => {
  it('serializes a simple input-operator-output chain', () => {
    const nodes: FlowNode[] = [
      {
        id: 'input_1',
        type: 'cellNode',
        position: { x: 0, y: 0 },
        data: {
          address: 'input_1',
          value: 120,
          formula: null,
          label: 'Revenue',
          isInput: true,
          isOutput: false,
          isMarked: false,
          isPercent: false,
        },
      },
      {
        id: 'constant_1',
        type: 'constantNode',
        position: { x: 0, y: 120 },
        data: {
          value: 0.23,
          label: 'Tax',
          isPercent: false,
        },
      },
      {
        id: 'op_1',
        type: 'operatorNode',
        position: { x: 160, y: 60 },
        data: {
          operator: '*',
          literalOperands: [],
        },
      },
      {
        id: 'output_1',
        type: 'cellNode',
        position: { x: 320, y: 60 },
        data: {
          address: 'output_1',
          value: null,
          formula: null,
          label: 'Result',
          isInput: false,
          isOutput: true,
          isMarked: false,
          isPercent: false,
        },
      },
    ]

    const edges: FlowEdge[] = [
      { id: 'e1', source: 'input_1', target: 'op_1', type: 'animatedEdge', data: { operator: '*' } },
      { id: 'e2', source: 'constant_1', target: 'op_1', type: 'animatedEdge', data: { operator: '*' } },
      { id: 'e3', source: 'op_1', target: 'output_1', type: 'animatedEdge', data: { operator: '*' } },
    ]

    const formula = graphToFormula(
      'output_1',
      nodes,
      edges,
      new Map([
        ['input_1', 'A1'],
        ['output_1', 'C1'],
      ]),
    )

    expect(formula).toBe('=(A1*0.23)')
  })

  it('uses assigned addresses for leaf input nodes', () => {
    const nodes: FlowNode[] = [
      {
        id: 'input_a',
        type: 'cellNode',
        position: { x: 0, y: 0 },
        data: {
          address: 'input_a',
          value: 10,
          formula: null,
          label: 'A',
          isInput: true,
          isOutput: false,
          isMarked: false,
          isPercent: false,
        },
      },
      {
        id: 'input_b',
        type: 'cellNode',
        position: { x: 0, y: 80 },
        data: {
          address: 'input_b',
          value: 20,
          formula: null,
          label: 'B',
          isInput: true,
          isOutput: false,
          isMarked: false,
          isPercent: false,
        },
      },
      {
        id: 'op_sum',
        type: 'operatorNode',
        position: { x: 160, y: 40 },
        data: {
          operator: '+',
          literalOperands: [],
        },
      },
    ]

    const edges: FlowEdge[] = [
      { id: 'e1', source: 'input_a', target: 'op_sum', type: 'animatedEdge', data: { operator: '+' } },
      { id: 'e2', source: 'input_b', target: 'op_sum', type: 'animatedEdge', data: { operator: '+' } },
    ]

    const formula = graphToFormula(
      'op_sum',
      nodes,
      edges,
      new Map([
        ['input_a', 'A1'],
        ['input_b', 'A2'],
      ]),
    )

    expect(formula).toBe('=(A1+A2)')
  })
})
