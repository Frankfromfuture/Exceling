import Dagre from '@dagrejs/dagre'
import type { FlowNode, FlowEdge } from '../../types'

const CELL_W     = 200
const CELL_H     = 90
const OP_W       = 76
const OP_H       = 62
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
    rankdir:   'LR',
    acyclicer: 'greedy',
    ranker:    'network-simplex',
    nodesep:   44,   // vertical gap between nodes in the same rank
    edgesep:   12,   // gap between parallel edges
    ranksep:   80,   // horizontal gap between ranks
    marginx:   48,
    marginy:   40,
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

/**
 * Post-processing pass: shift every main-path node so its vertical
 * centre sits at the canvas mid-line. Non-path nodes keep their dagre
 * positions — the main calculation chain runs in a straight horizontal band.
 */
export function centerMainPath(
  nodes: FlowNode[],
  mainPathNodeIds: Set<string>,
): FlowNode[] {
  if (mainPathNodeIds.size === 0) return nodes

  const pathNodes = nodes.filter(n => mainPathNodeIds.has(n.id))
  if (pathNodes.length === 0) return nodes

  // Vertical bounding box of the whole graph
  let minY = Infinity
  let maxY = -Infinity
  nodes.forEach(n => {
    const { height } = getNodeDims(n.type)
    if (n.position.y < minY) minY = n.position.y
    if (n.position.y + height > maxY) maxY = n.position.y + height
  })
  const canvasCenterY = (minY + maxY) / 2

  return nodes.map(n => {
    if (!mainPathNodeIds.has(n.id)) return n
    const { height } = getNodeDims(n.type)
    return {
      ...n,
      position: {
        x: n.position.x,
        y: canvasCenterY - height / 2,
      },
    }
  })
}
