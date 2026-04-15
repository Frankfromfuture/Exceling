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
 * Post-processing pass: keep the main-path nodes' natural relative
 * vertical positions from dagre, but compress their total vertical
 * spread so it stays within `maxSpreadPx`, then re-centre the band
 * around the canvas vertical midline.
 *
 * Result: the main chain stays roughly horizontal (no more than
 * ~half a screen of vertical drift) without being forced into one
 * perfectly flat line.
 */
export function alignMainPath(
  nodes: FlowNode[],
  mainPathNodeIds: Set<string>,
  maxSpreadPx = 280,
): FlowNode[] {
  if (mainPathNodeIds.size === 0) return nodes

  const pathNodes = nodes.filter(n => mainPathNodeIds.has(n.id))
  if (pathNodes.length <= 1) return nodes

  // Centre-Y of each main-path node after dagre
  const pathCenters = pathNodes.map(n => {
    const { height } = getNodeDims(n.type)
    return { id: n.id, cy: n.position.y + height / 2 }
  })

  const minCY     = Math.min(...pathCenters.map(p => p.cy))
  const maxCY     = Math.max(...pathCenters.map(p => p.cy))
  const spread    = maxCY - minCY
  const pathMidY  = (minCY + maxCY) / 2

  // Scale factor: compress only if the spread exceeds the limit
  const scale = spread > maxSpreadPx ? maxSpreadPx / spread : 1.0

  // Canvas vertical centre (all nodes)
  let canvasTop = Infinity, canvasBot = -Infinity
  nodes.forEach(n => {
    const { height } = getNodeDims(n.type)
    if (n.position.y < canvasTop) canvasTop = n.position.y
    if (n.position.y + height > canvasBot) canvasBot = n.position.y + height
  })
  const canvasMidY = (canvasTop + canvasBot) / 2

  // Map each path node to its new centre-Y
  const newCY = new Map<string, number>()
  pathCenters.forEach(({ id, cy }) => {
    // Compress relative deviation, then re-centre on canvas mid
    newCY.set(id, canvasMidY + (cy - pathMidY) * scale)
  })

  return nodes.map(n => {
    if (!mainPathNodeIds.has(n.id)) return n
    const { height } = getNodeDims(n.type)
    return {
      ...n,
      position: { x: n.position.x, y: newCY.get(n.id)! - height / 2 },
    }
  })
}
