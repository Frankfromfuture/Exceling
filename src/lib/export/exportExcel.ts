import { graphToFormula } from '../formula/serializeGraph'
import { assignCellAddress } from '../layout/assignCellAddress'
import type { FlowEdge, FlowNode } from '../../types'

interface ExportExcelOptions {
  sheetName?: string
  includeLabels?: boolean
}

function sanitizeSheetName(sheetName: string) {
  const trimmed = sheetName.trim().slice(0, 31)
  return trimmed || 'Sheet1'
}

function buildFormulaMap(nodes: FlowNode[], edges: FlowEdge[], addressMap: Map<string, string>) {
  const formulaMap: Record<string, string> = {}

  for (const node of nodes) {
    if (node.type === 'operatorNode') {
      formulaMap[node.id] = graphToFormula(node.id, nodes, edges, addressMap)
      continue
    }

    if (node.type === 'cellNode' && !node.data.isInput) {
      const hasIncoming = edges.some((edge) => edge.target === node.id)
      if (hasIncoming) {
        formulaMap[node.id] = graphToFormula(node.id, nodes, edges, addressMap)
      }
    }
  }

  return formulaMap
}

export async function exportExcel(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: ExportExcelOptions = {},
) {
  const cellAddressMap = assignCellAddress(nodes, edges)
  const formulas = buildFormulaMap(nodes, edges, cellAddressMap)

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nodes,
      edges,
      cellAddressMap: Object.fromEntries(cellAddressMap),
      formulas,
      options: {
        sheetName: sanitizeSheetName(options.sheetName ?? 'Model'),
        includeLabels: options.includeLabels ?? true,
      },
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to generate Excel file.')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'exceling-model.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
