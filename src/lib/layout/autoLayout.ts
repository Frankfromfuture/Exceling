import Dagre from '@dagrejs/dagre'
import type { FlowNode, FlowEdge } from '../../types'

const CELL_W     = 200
const CELL_H     = 90
const OP_W       = 72   // operator node — rounded rect, wider than tall
const OP_H       = 56
const CONST_SIZE = 56

interface NodeDims { width: number; height: number }

function getNodeDims(type: string | undefined): NodeDims {
  if (type === 'operatorNode') return { width: OP_W, height: OP_H }
  if (type === 'constantNode')  return { width: CONST_SIZE, height: CONST_SIZE }
  return { width: CELL_W, height: CELL_H }
}

/**
 * Apply dagre left-to-right layout to a set of React Flow nodes and edges.
 * Returns new nodes with updated `position` (edges unchanged).
 */
export function applyDagreLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const g = new Dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    nodesep: 52,    // vertical gap between nodes in the same rank
    ranksep: 96,    // horizontal gap between ranks
    marginx: 40,
    marginy: 40,
  })

  nodes.forEach(node => {
    const { width, height } = getNodeDims(node.type)
    g.setNode(node.id, { width, height })
  })

  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target)
  })

  Dagre.layout(g)

  return nodes.map(node => {
    const { x, y, width, height } = g.node(node.id)
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
    }
  })
}
