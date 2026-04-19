import { describe, expect, it } from 'vitest'
import { assignCellAddress } from './assignCellAddress'
import type { FlowEdge, FlowNode } from '../../types'

describe('assignCellAddress', () => {
  it('assigns columns by topological depth', () => {
    const nodes: FlowNode[] = [
      {
        id: 'input_1',
        type: 'cellNode',
        position: { x: 0, y: 0 },
        data: {
          address: 'input_1',
          value: 10,
          formula: null,
          label: 'Input 1',
          isInput: true,
          isOutput: false,
          isMarked: false,
          isPercent: false,
        },
      },
      {
        id: 'input_2',
        type: 'cellNode',
        position: { x: 0, y: 100 },
        data: {
          address: 'input_2',
          value: 20,
          formula: null,
          label: 'Input 2',
          isInput: true,
          isOutput: false,
          isMarked: false,
          isPercent: false,
        },
      },
      {
        id: 'operator_1',
        type: 'operatorNode',
        position: { x: 200, y: 40 },
        data: {
          operator: '+',
          literalOperands: [],
        },
      },
      {
        id: 'output_1',
        type: 'cellNode',
        position: { x: 400, y: 40 },
        data: {
          address: 'output_1',
          value: null,
          formula: null,
          label: 'Output',
          isInput: false,
          isOutput: true,
          isMarked: false,
          isPercent: false,
        },
      },
    ]

    const edges: FlowEdge[] = [
      { id: 'e1', source: 'input_1', target: 'operator_1', type: 'animatedEdge', data: { operator: '+' } },
      { id: 'e2', source: 'input_2', target: 'operator_1', type: 'animatedEdge', data: { operator: '+' } },
      { id: 'e3', source: 'operator_1', target: 'output_1', type: 'animatedEdge', data: { operator: '+' } },
    ]

    const addressMap = assignCellAddress(nodes, edges)

    expect(addressMap.get('input_1')).toBe('A1')
    expect(addressMap.get('input_2')).toBe('A2')
    expect(addressMap.get('operator_1')).toBe('B1')
    expect(addressMap.get('output_1')).toBe('D1')
  })
})
