import type { FlowEdge, FlowNode } from '../../types'

function formatConstant(value: number | string, isPercent?: boolean) {
  if (typeof value === 'string') return value
  if (isPercent) return String(value)
  return Number.isInteger(value) ? String(value) : String(value)
}

function buildIncomingMap(edges: FlowEdge[]) {
  const incoming = new Map<string, FlowEdge[]>()
  edges.forEach((edge) => {
    const group = incoming.get(edge.target) ?? []
    group.push(edge)
    incoming.set(edge.target, group)
  })
  return incoming
}

function resolveFormula(
  nodeId: string,
  nodeMap: Map<string, FlowNode>,
  incomingMap: Map<string, FlowEdge[]>,
  cellAddressMap: Map<string, string>,
  visiting: Set<string>,
): string {
  const node = nodeMap.get(nodeId)
  if (!node) throw new Error(`Node "${nodeId}" not found while building formula.`)

  if (visiting.has(nodeId)) {
    throw new Error(`Cycle detected while serializing graph at node "${nodeId}".`)
  }

  if (node.type === 'constantNode') {
    return formatConstant(node.data.value, node.data.isPercent)
  }

  const incomingEdges = incomingMap.get(nodeId) ?? []

  if (node.type === 'cellNode') {
    if (node.data.isInput || incomingEdges.length === 0) {
      const address = cellAddressMap.get(nodeId)
      if (!address) throw new Error(`Missing cell address for input node "${nodeId}".`)
      return address
    }

    visiting.add(nodeId)
    const formula = resolveFormula(incomingEdges[0].source, nodeMap, incomingMap, cellAddressMap, visiting)
    visiting.delete(nodeId)
    return formula
  }

  if (node.type === 'operatorNode') {
    const operands = incomingEdges.map((edge) => edge.source)
    const literalOperands = node.data.literalOperands.map((operand) => formatConstant(operand.value, operand.isPercent))

    visiting.add(nodeId)
    const resolvedOperands = operands.map((operandId) =>
      resolveFormula(operandId, nodeMap, incomingMap, cellAddressMap, visiting),
    )
    visiting.delete(nodeId)

    const allOperands = [...resolvedOperands, ...literalOperands].filter(Boolean)
    if (allOperands.length === 0) return '0'
    if (allOperands.length === 1) return allOperands[0]
    if (node.data.operator === 'round') {
      return `ROUND(${allOperands[0]},0)`
    }
    if (node.data.operator === '%') {
      return `(${allOperands[0]}*(${allOperands[1]}/100))`
    }
    if (node.data.operator === 'pow') {
      return `POWER(${allOperands[0]},${allOperands[1]})`
    }
    if (node.data.operator === 'min') {
      return `MIN(${allOperands[0]},${allOperands[1]})`
    }
    if (node.data.operator === 'max') {
      return `MAX(${allOperands[0]},${allOperands[1]})`
    }

    return allOperands.slice(1).reduce((left, right) => `(${left}${node.data.operator}${right})`, allOperands[0])
  }

  if (node.type === 'branchNode') {
    throw new Error('Branch nodes are not serializable to Excel formulas yet.')
  }

  throw new Error('Unsupported node encountered during serialization.')
}

export function graphToFormula(
  outputNodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  cellAddressMap: Map<string, string>,
): string {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingMap(edges)
  const expression = resolveFormula(outputNodeId, nodeMap, incomingMap, cellAddressMap, new Set())
  return expression.startsWith('=') ? expression : `=${expression}`
}
