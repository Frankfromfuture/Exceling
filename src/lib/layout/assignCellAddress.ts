import type { FlowEdge, FlowNode } from '../../types'
import { colIdxToLetter, computeTopoDepth } from '../formula/buildGraph'

export function assignCellAddress(nodes: FlowNode[], edges: FlowEdge[]): Map<string, string> {
  const depthMap = computeTopoDepth(nodes, edges)
  const maxDepth = Math.max(0, ...depthMap.values())

  const columnGroups = new Map<number, FlowNode[]>()

  for (const node of nodes) {
    const baseDepth = depthMap.get(node.id) ?? 0
    const columnDepth = node.type === 'cellNode' && node.data.isOutput ? maxDepth + 1 : baseDepth
    const group = columnGroups.get(columnDepth) ?? []
    group.push(node)
    columnGroups.set(columnDepth, group)
  }

  const assignments = new Map<string, string>()
  const sortedColumns = [...columnGroups.keys()].sort((left, right) => left - right)

  sortedColumns.forEach((columnDepth) => {
    const nodesInColumn = (columnGroups.get(columnDepth) ?? []).toSorted((left, right) => {
      if (left.position.y !== right.position.y) return left.position.y - right.position.y
      return left.id.localeCompare(right.id)
    })

    nodesInColumn.forEach((node, index) => {
      assignments.set(node.id, `${colIdxToLetter(columnDepth)}${index + 1}`)
    })
  })

  return assignments
}
