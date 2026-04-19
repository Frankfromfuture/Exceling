import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Plus,
  Upload,
} from 'lucide-react'
import { accent, ink, status } from '../../design'
import { parseExcelFile } from '../../lib/excel/parseXlsx'
import { exportExcel } from '../../lib/export/exportExcel'
import { buildFlowGraph } from '../../lib/formula/buildGraph'
import { applyDagreLayout } from '../../lib/layout/autoLayout'
import { simulateWhatIf } from '../../lib/whatif/simulate'
import {
  SCENARIOS,
  computeAll,
  deriveScenarioEdges,
  fmt,
  formulaToExcel,
  kindColor,
  kindLabel,
  scenarioLayout,
} from '../../lib/scenarios/model'
import type { ScenarioNode, NodeKind } from '../../lib/scenarios/model'
import { useFlowHistory, useFlowStore } from '../../store/flowStore'
import type { FlowEdge, FlowNode, Operator, ParsedCell, WhatIfScenario } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'canvas' | 'excel'
type Direction = 'n' | 'e' | 's' | 'w'
type AppMode = 'scenario' | 'excel'

type VisualNodeKind = 'input' | 'computed' | 'output'

type VisualNode = {
  id: string
  kind: VisualNodeKind
  label: string
  address: string
  formula: string | null
  isPercent: boolean
  isMarked: boolean
  isCollapsedModifier: boolean
}

type VisualModifier = {
  op: '*' | '/'
  kind: 'value' | 'node' | 'wrap'
  value?: number
  nodeId?: string
  label?: string
  sign?: '+' | '-'
}

type VisualEdge = {
  id: string
  source: string
  target: string
  op: '+' | '-'
  modifiers: VisualModifier[]
}

type UnifiedGraph = {
  nodes: VisualNode[]
  edges: VisualEdge[]
}

type FocusGraph = {
  nodeIds: Set<string>
  edgeIds: Set<string>
  startId: string | null
  endId: string | null
}

type PositionedNode = {
  x: number
  y: number
  w: number
  h: number
}

type PickerState = {
  sourceId: string
  angle: number
  x: number
  y: number
}

type PendingOperatorState = PickerState & {
  operator: Operator
}

type OperatorSpec = {
  operator: Operator
  label: string
  glyph: string
  needsLiteral: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_NODE_WIDTH = 168
const PRIMARY_NODE_HEIGHT = 82

const PRIMARY_OPERATOR_SPECS: OperatorSpec[] = [
  { operator: '+', label: 'Add',      glyph: '+', needsLiteral: true },
  { operator: '-', label: 'Subtract', glyph: '−', needsLiteral: true },
  { operator: '*', label: 'Multiply', glyph: '×', needsLiteral: true },
  { operator: '/', label: 'Divide',   glyph: '÷', needsLiteral: true },
]
const SECONDARY_OPERATOR_SPECS: OperatorSpec[] = [
  { operator: '%',     label: 'Percent', glyph: '%',  needsLiteral: true },
  { operator: 'pow',   label: 'Power',   glyph: 'xⁿ', needsLiteral: true },
  { operator: 'min',   label: 'Min',     glyph: '▼',  needsLiteral: true },
  { operator: 'max',   label: 'Max',     glyph: '▲',  needsLiteral: true },
  { operator: 'round', label: 'Round',   glyph: '≈',  needsLiteral: false },
]
const ALL_OPERATOR_SPECS = [...PRIMARY_OPERATOR_SPECS, ...SECONDARY_OPERATOR_SPECS]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.endsWith('%')
    ? String(parseFloat(trimmed.slice(0, -1)) / 100)
    : trimmed.replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDisplayValue(value: number | string | null | undefined, isPercent = false) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string') return value
  if (isPercent) return `${(value * 100).toFixed(2)}%`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  if (Number.isInteger(value)) return value.toLocaleString()
  return Number(value.toFixed(4)).toString()
}

function nodeAccentFromKind(kind: VisualNodeKind): string {
  if (kind === 'output') return accent.mauve
  if (kind === 'input') return accent.sage
  return accent.slate
}

function nodeRoleLabel(kind: VisualNodeKind) {
  if (kind === 'output') return 'OUTPUT'
  if (kind === 'input') return 'INPUT'
  return 'COMPUTED'
}

function edgeStrokeColor(op: '+' | '-'): string {
  return op === '-' ? accent.mauve : accent.sage
}

function edgeMarkerColor(op: '+' | '-'): string {
  return op === '-' ? 'mauve' : 'sage'
}

function edgeDash(op: '+' | '-'): string | undefined {
  return op === '-' ? '5 3' : undefined
}

function normalizeFormula(formula: string | null | undefined) {
  return formula?.trim().replace(/^=/, '').replace(/\$/g, '') ?? null
}

function tokenizeVisualFormula(formula: string) {
  const tokens: Array<
    | { type: 'op'; value: string }
    | { type: 'id'; value: string }
    | { type: 'num'; value: number }
  > = []
  const source = formula.replace(/\s+/g, '')
  const pattern = /([+\-*/()])|([A-Za-z_][A-Za-z0-9_]*)|(\d+\.?\d*)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) tokens.push({ type: 'op', value: match[1] })
    else if (match[2]) tokens.push({ type: 'id', value: match[2] })
    else if (match[3]) tokens.push({ type: 'num', value: Number(match[3]) })
  }
  return tokens
}

function isCollapsedModifierNode(node: FlowNode, outgoingCount: number) {
  if (node.type !== 'cellNode') return false
  if (node.data.isMarked || node.data.isOutput || !node.data.isInput) return false
  if (outgoingCount !== 1) return false
  const numeric = parseNumericValue(node.data.value)
  return Boolean(node.data.isPercent || (numeric != null && numeric > 0 && numeric < 1))
}

function getCellNodes(nodes: FlowNode[]) {
  return nodes.filter((node): node is Extract<FlowNode, { type: 'cellNode' }> => node.type === 'cellNode')
}

// ─── Excel-mode graph builder ─────────────────────────────────────────────────

function buildUnifiedGraph(nodes: FlowNode[], edges: FlowEdge[]): UnifiedGraph {
  const cellNodes = getCellNodes(nodes)
  const outgoingCount = new Map<string, number>()
  edges.forEach((edge) => {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1)
  })
  const collapsedIds = new Set(
    cellNodes
      .filter((node) => isCollapsedModifierNode(node, outgoingCount.get(node.id) ?? 0))
      .map((node) => node.id),
  )

  const visualNodes: VisualNode[] = cellNodes
    .map((node) => ({
      id: node.id,
      kind: (node.data.isOutput ? 'output' : node.data.isInput ? 'input' : 'computed') as VisualNodeKind,
      label: node.data.label ?? node.id,
      address: node.data.address,
      formula: normalizeFormula(node.data.machineFormula ?? node.data.formula ?? node.data.computedFormula),
      isPercent: node.data.isPercent,
      isMarked: node.data.isMarked,
      isCollapsedModifier: collapsedIds.has(node.id),
    }))
    .filter((node) => !node.isCollapsedModifier)

  const visualById = new Map(visualNodes.map((node) => [node.id, node]))
  const cellById = new Map(cellNodes.map((node) => [node.id, node]))
  const visualEdges: VisualEdge[] = []

  const pushRecipeEdge = (node: Extract<FlowNode, { type: 'cellNode' }>) => {
    const recipe = node.data.visualRecipe
    if (!recipe || !visualById.has(recipe.sourceId)) return false
    const modifiers: VisualModifier[] = []
    if (recipe.operator === 'round') {
      modifiers.push({ op: '*', kind: 'node', label: 'ROUND' })
    } else if (recipe.operator === '%') {
      modifiers.push({ op: '*', kind: 'value', value: recipe.literal ?? 0 })
      modifiers.push({ op: '*', kind: 'node', label: '% of' })
    } else if (recipe.literal != null) {
      modifiers.push({ op: recipe.operator === '/' ? '/' : '*', kind: 'value', value: recipe.literal })
    }
    visualEdges.push({
      id: `${recipe.sourceId}->${node.id}:recipe`,
      source: recipe.sourceId,
      target: node.id,
      op: recipe.operator === '-' ? '-' : '+',
      modifiers,
    })
    return true
  }

  visualNodes.forEach((targetNode) => {
    const storeNode = cellById.get(targetNode.id)
    if (!storeNode) return
    if (pushRecipeEdge(storeNode)) return
    if (!targetNode.formula) return
    const tokens = tokenizeVisualFormula(targetNode.formula)
    if (tokens.length === 0) return
    const primaryIds = new Set(visualNodes.map((node) => node.id))
    const depthState = { depth: 0, op: '+' as '+' | '-' }
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (token.type === 'op' && token.value === '(') { depthState.depth += 1; continue }
      if (token.type === 'op' && token.value === ')') { depthState.depth -= 1; continue }
      if (token.type === 'op' && depthState.depth === 0 && (token.value === '+' || token.value === '-')) {
        depthState.op = token.value; continue
      }
      if (token.type !== 'id' || !primaryIds.has(token.value)) continue
      const modifiers: VisualModifier[] = []
      let pointer = i + 1
      let localDepth = depthState.depth
      while (pointer < tokens.length) {
        const next = tokens[pointer]
        if (next.type === 'op' && next.value === '(') { localDepth += 1; pointer += 1; continue }
        if (next.type === 'op' && next.value === ')') { localDepth -= 1; pointer += 1; continue }
        if (next.type === 'op' && localDepth === depthState.depth && (next.value === '+' || next.value === '-')) break
        if (next.type === 'op' && (next.value === '*' || next.value === '/')) {
          const operator = next.value as '*' | '/'
          const lookAhead = tokens[pointer + 1]
          const signToken = tokens[pointer + 3]
          const modifierToken = tokens[pointer + 4]
          if (lookAhead?.type === 'op' && lookAhead.value === '(' && tokens[pointer + 2]?.type === 'num' &&
              signToken?.type === 'op' && (signToken.value === '+' || signToken.value === '-') &&
              modifierToken?.type === 'id' && collapsedIds.has(modifierToken.value)) {
            const collapsedNode = cellById.get(modifierToken.value)
            modifiers.push({ op: operator, kind: 'wrap', nodeId: modifierToken.value, label: collapsedNode?.data.label ?? modifierToken.value, sign: signToken.value as '+' | '-' })
            pointer += 6; continue
          }
          if (lookAhead?.type === 'id' && collapsedIds.has(lookAhead.value)) {
            const collapsedNode = cellById.get(lookAhead.value)
            modifiers.push({ op: operator, kind: 'node', nodeId: lookAhead.value, label: collapsedNode?.data.label ?? lookAhead.value })
            pointer += 2; continue
          }
          if (lookAhead?.type === 'num') {
            modifiers.push({ op: operator, kind: 'value', value: lookAhead.value }); pointer += 2; continue
          }
        }
        pointer += 1
      }
      visualEdges.push({ id: `${token.value}->${targetNode.id}:${i}`, source: token.value, target: targetNode.id, op: depthState.op, modifiers })
    }
  })

  return { nodes: visualNodes, edges: dedupeVisualEdges(visualEdges) }
}

function dedupeVisualEdges(edges: VisualEdge[]) {
  const seen = new Set<string>()
  return edges.filter((edge) => {
    const sig = `${edge.source}:${edge.target}:${edge.op}:${edge.modifiers.map((m) => `${m.kind}:${m.label ?? m.value ?? m.nodeId ?? ''}:${m.op}:${m.sign ?? ''}`).join('|')}`
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })
}

// ─── Scenario-mode graph builder ──────────────────────────────────────────────

function buildScenarioUnifiedGraph(nodes: ScenarioNode[]): UnifiedGraph {
  const constIds = new Set(nodes.filter((n) => n.kind === 'const').map((n) => n.id))

  // Primary nodes: non-const. Const nodes are absorbed into edge labels.
  const primaryNodes: VisualNode[] = nodes
    .filter((n) => n.kind !== 'const')
    .map((n) => ({
      id: n.id,
      kind: (n.kind === 'output' ? 'output' : n.kind === 'input' ? 'input' : 'computed') as VisualNodeKind,
      label: n.label,
      address: n.cell,
      formula: n.formula ?? null,
      isPercent: false,
      isMarked: n.kind === 'input' || n.kind === 'output',
      isCollapsedModifier: false,
    }))

  const primaryIds = new Set(primaryNodes.map((n) => n.id))
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

  const edges = deriveScenarioEdges(nodes)
  const visualEdges: VisualEdge[] = []

  edges.forEach((e) => {
    if (!primaryIds.has(e.source) || !primaryIds.has(e.target)) return

    // Collect const modifiers for this edge (const nodes in the formula for target)
    const targetNode = byId[e.target]
    if (!targetNode?.formula) {
      visualEdges.push({ id: e.id, source: e.source, target: e.target, op: (e.op === '-' ? '-' : '+') as '+' | '-', modifiers: [] })
      return
    }

    // Rough const-labeling: find const nodes used in the target's formula
    const modifiers: VisualModifier[] = []
    const formula = targetNode.formula
    const tokenRe = /([+\-*/()])|([a-z_][a-z0-9_]*)|(\d+\.?\d*)/gi
    const tokens: Array<{ type: 'op' | 'id' | 'num'; val: string | number }> = []
    let m: RegExpExecArray | null
    while ((m = tokenRe.exec(formula)) !== null) {
      if (m[1]) tokens.push({ type: 'op', val: m[1] })
      else if (m[2]) tokens.push({ type: 'id', val: m[2] })
      else tokens.push({ type: 'num', val: parseFloat(m[3]) })
    }

    // Find source token index and walk forward for const tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'id' && tokens[i].val === e.source) {
        let j = i + 1
        while (j < tokens.length) {
          const tj = tokens[j]
          if (tj.type === 'op' && (tj.val === '+' || tj.val === '-')) break
          if (tj.type === 'op' && (tj.val === '*' || tj.val === '/')) {
            const rawOp = tj.val as '*' | '/'
            const next = tokens[j + 1]
            if (!next) { j++; continue }
            // Check "(1 - constId)" pattern
            if (next.type === 'op' && next.val === '(' &&
                tokens[j+2]?.type === 'num' &&
                tokens[j+3]?.type === 'op' && (tokens[j+3].val === '-' || tokens[j+3].val === '+') &&
                tokens[j+4]?.type === 'id' && constIds.has(tokens[j+4].val as string) &&
                tokens[j+5]?.type === 'op' && tokens[j+5].val === ')') {
              const constId = tokens[j+4].val as string
              const c = byId[constId]
              modifiers.push({
                op: rawOp,
                kind: 'wrap',
                nodeId: constId,
                label: c?.label ?? constId,
                sign: (tokens[j+3].val as '+' | '-'),
              })
              j += 6; continue
            }
            if (next.type === 'id' && constIds.has(next.val as string)) {
              const constId = next.val as string
              const c = byId[constId]
              modifiers.push({ op: rawOp, kind: 'node', nodeId: constId, label: c?.label ?? constId })
              j += 2; continue
            }
            if (next.type === 'num') {
              modifiers.push({ op: rawOp, kind: 'value', value: next.val as number })
              j += 2; continue
            }
          }
          j++
        }
        break
      }
    }

    visualEdges.push({ id: e.id, source: e.source, target: e.target, op: (e.op === '-' ? '-' : '+') as '+' | '-', modifiers })
  })

  return { nodes: primaryNodes, edges: visualEdges }
}

// ─── Layout ────────────────────────────────────────────────────────────────────

function layoutUnifiedGraph(graph: UnifiedGraph) {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  graph.nodes.forEach((node) => { incoming.set(node.id, []); outgoing.set(node.id, []) })
  graph.edges.forEach((edge) => {
    incoming.get(edge.target)?.push(edge.source)
    outgoing.get(edge.source)?.push(edge.target)
  })

  const level = new Map<string, number>()
  const visit = (nodeId: string, visiting = new Set<string>()): number => {
    if (level.has(nodeId)) return level.get(nodeId) ?? 0
    if (visiting.has(nodeId)) return 0
    visiting.add(nodeId)
    const sources = incoming.get(nodeId) ?? []
    const nextLevel = sources.length === 0 ? 0 : 1 + Math.max(...sources.map((s) => visit(s, visiting)))
    level.set(nodeId, nextLevel)
    visiting.delete(nodeId)
    return nextLevel
  }
  graph.nodes.forEach((node) => visit(node.id))

  const columns = new Map<number, string[]>()
  graph.nodes.forEach((node) => {
    const l = level.get(node.id) ?? 0
    const group = columns.get(l) ?? []
    group.push(node.id)
    columns.set(l, group)
  })

  const sortedLevels = [...columns.keys()].sort((a, b) => a - b)
  const colH = new Map<number, number>()
  sortedLevels.forEach((l) => {
    const count = columns.get(l)?.length ?? 0
    colH.set(l, Math.max(0, count * (PRIMARY_NODE_HEIGHT + 40) - 40))
  })
  const maxHeight = Math.max(520, ...colH.values())

  const positions = new Map<string, PositionedNode>()
  const stableHash = (v: string) =>
    v.split('').reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)

  sortedLevels.forEach((l) => {
    const ids = columns.get(l) ?? []
    ids.sort((a, b) => {
      const na = graph.nodes.find((node) => node.id === a)
      const nb = graph.nodes.find((node) => node.id === b)
      const order = { input: 0, computed: 1, output: 2 }
      return (order[na?.kind ?? 'computed'] ?? 1) - (order[nb?.kind ?? 'computed'] ?? 1)
    })
    const colHeight = colH.get(l) ?? 0
    const yOffset = 48 + (maxHeight - colHeight) / 2
    ids.forEach((id, idx) => {
      const jx = (stableHash(id) % 7) - 3
      const jy = (stableHash(`${id}:y`) % 7) - 3
      positions.set(id, {
        x: 48 + l * (PRIMARY_NODE_WIDTH + 96) + jx,
        y: yOffset + idx * (PRIMARY_NODE_HEIGHT + 40) + jy,
        w: PRIMARY_NODE_WIDTH,
        h: PRIMARY_NODE_HEIGHT,
      })
    })
  })

  return {
    positions,
    width: Math.max(960, sortedLevels.length * (PRIMARY_NODE_WIDTH + 96) + 240),
    height: Math.max(560, maxHeight + 96),
  }
}

// ─── Path tracing ──────────────────────────────────────────────────────────────

function buildMainPath(graph: UnifiedGraph): FocusGraph {
  if (graph.nodes.length === 0) return { nodeIds: new Set(), edgeIds: new Set(), startId: null, endId: null }
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  graph.nodes.forEach((n) => { incoming.set(n.id, 0); outgoing.set(n.id, 0) })
  graph.edges.forEach((e) => {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1)
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1)
  })
  const startId = graph.nodes.find((n) => n.kind === 'input' && n.isMarked && (incoming.get(n.id) ?? 0) === 0)?.id
    ?? graph.nodes.find((n) => n.kind === 'input' && (incoming.get(n.id) ?? 0) === 0)?.id
    ?? graph.nodes[0]?.id ?? null
  const endId = [...graph.nodes].reverse().find((n) => n.kind === 'output')?.id
    ?? [...graph.nodes].reverse().find((n) => (outgoing.get(n.id) ?? 0) === 0)?.id
    ?? graph.nodes.at(-1)?.id ?? null

  if (!startId || !endId) return { nodeIds: new Set(), edgeIds: new Set(), startId, endId }

  const queue = [startId]
  const prev = new Map<string, string | null>([[startId, null]])
  const prevEdge = new Map<string, string>()
  let ptr = 0
  while (ptr < queue.length) {
    const cur = queue[ptr]; ptr++
    if (cur === endId) break
    graph.edges.filter((e) => e.source === cur).forEach((e) => {
      if (prev.has(e.target)) return
      prev.set(e.target, cur)
      prevEdge.set(e.target, e.id)
      queue.push(e.target)
    })
  }

  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  let walk: string | null = endId
  while (walk) {
    nodeIds.add(walk)
    const via = prevEdge.get(walk)
    if (via) edgeIds.add(via)
    walk = prev.get(walk) ?? null
  }
  if (!nodeIds.has(startId)) nodeIds.add(startId)
  return { nodeIds, edgeIds, startId, endId }
}

function buildFocusFromTarget(graph: UnifiedGraph, targetId: string): FocusGraph {
  const nodeIds = new Set<string>([targetId])
  const edgeIds = new Set<string>()
  const stack = [targetId]
  while (stack.length > 0) {
    const cur = stack.pop()!
    graph.edges.filter((e) => e.target === cur).forEach((e) => {
      edgeIds.add(e.id)
      if (!nodeIds.has(e.source)) { nodeIds.add(e.source); stack.push(e.source) }
    })
  }
  return { nodeIds, edgeIds, startId: null, endId: targetId }
}

function getNodeValueMap(nodes: FlowNode[], scenario: WhatIfScenario | null) {
  const valueMap = new Map<string, number | string | null>()
  nodes.forEach((node) => {
    if (node.type !== 'cellNode') return
    const sv = scenario?.recomputed[node.id.toUpperCase()]
    valueMap.set(node.id, sv === undefined ? node.data.computedValue ?? node.data.value ?? null : sv)
  })
  return valueMap
}

// ─── Edge chip text ───────────────────────────────────────────────────────────

function buildEdgeChipText(
  edge: VisualEdge,
  valueByNodeId: Map<string, number | string | null>,
  scenarioValues?: Record<string, number>,
) {
  const parts: string[] = [edge.op === '-' ? '−' : '+']
  const detailParts: string[] = []

  edge.modifiers.forEach((modifier) => {
    if (modifier.kind === 'value' && modifier.value != null) {
      parts.push(`${modifier.op === '/' ? '÷' : '×'} ${formatDisplayValue(modifier.value)}`)
      return
    }
    if (modifier.kind === 'node' && modifier.nodeId) {
      const value = scenarioValues ? scenarioValues[modifier.nodeId] : valueByNodeId.get(modifier.nodeId)
      if (modifier.label === 'ROUND') { parts.push('ROUND'); return }
      if (modifier.label === '% of') { detailParts.push('% of'); return }
      parts.push(`${modifier.op === '/' ? '÷' : '×'} ${formatDisplayValue(value)}`)
      if (modifier.label) detailParts.push(modifier.label)
      return
    }
    if (modifier.kind === 'wrap' && modifier.nodeId) {
      const value = scenarioValues ? scenarioValues[modifier.nodeId] : valueByNodeId.get(modifier.nodeId)
      parts.push(`${modifier.op === '/' ? '÷' : '×'} (1 ${modifier.sign ?? '−'} ${formatDisplayValue(value)})`)
      if (modifier.label) detailParts.push(modifier.label)
    }
  })

  return { text: parts.join(' '), detail: detailParts.join(' · ') }
}

// ─── Derived nodes ────────────────────────────────────────────────────────────

function buildDerivedLabel(sourceLabel: string, operator: Operator, literal: number | null) {
  switch (operator) {
    case '+': return `${sourceLabel} + ${formatDisplayValue(literal)}`
    case '-': return `${sourceLabel} − ${formatDisplayValue(literal)}`
    case '*': return `${sourceLabel} × ${formatDisplayValue(literal)}`
    case '/': return `${sourceLabel} ÷ ${formatDisplayValue(literal)}`
    case '%': return `${formatDisplayValue(literal)}% of ${sourceLabel}`
    case 'pow': return `${sourceLabel}^${formatDisplayValue(literal)}`
    case 'min': return `Min(${sourceLabel}, ${formatDisplayValue(literal)})`
    case 'max': return `Max(${sourceLabel}, ${formatDisplayValue(literal)})`
    case 'round': return `${sourceLabel} rounded`
    default: return sourceLabel
  }
}

function buildMachineFormula(sourceId: string, operator: Operator, literal: number | null) {
  switch (operator) {
    case '+': case '-': case '*': case '/':
      return literal == null ? sourceId : `${sourceId} ${operator} ${literal}`
    case '%': return `${sourceId} * (${literal ?? 0} / 100)`
    case 'pow': return `POWER(${sourceId}, ${literal ?? 1})`
    case 'min': return `MIN(${sourceId}, ${literal ?? 0})`
    case 'max': return `MAX(${sourceId}, ${literal ?? 0})`
    case 'round': return `ROUND(${sourceId})`
    default: return sourceId
  }
}

// ─── Narration ────────────────────────────────────────────────────────────────

function buildNarration(
  graph: UnifiedGraph,
  focus: FocusGraph,
  valueByNodeId: Map<string, number | string | null>,
) {
  const incoming = new Map<string, string[]>()
  graph.nodes.forEach((n) => incoming.set(n.id, []))
  graph.edges.forEach((e) => {
    if (!focus.edgeIds.has(e.id)) return
    incoming.get(e.target)?.push(e.source)
  })
  const order = [...graph.nodes]
    .filter((n) => focus.nodeIds.has(n.id))
    .sort((a, b) => (incoming.get(a.id)?.length ?? 0) - (incoming.get(b.id)?.length ?? 0))
  return order
    .filter((n) => n.kind !== 'input')
    .slice(0, 4)
    .map((n) => `${n.label} = ${formatDisplayValue(valueByNodeId.get(n.id), n.isPercent)}`)
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function getDirectionAngle(direction: Direction) {
  if (direction === 'n') return -Math.PI / 2
  if (direction === 's') return Math.PI / 2
  if (direction === 'w') return Math.PI
  return 0
}

function truncateLabel(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`
}

function useContainerPoint(containerRef: React.RefObject<HTMLDivElement | null>) {
  return useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: clientX, y: clientY }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])
}

function useHiddenFileInput(onFile: (file: File) => void) {
  const ref = useRef<HTMLInputElement | null>(null)
  const open = useCallback(() => ref.current?.click(), [])
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".xlsx,.xls"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) return
        onFile(file)
        event.currentTarget.value = ''
      }}
    />
  )
  return { input, open }
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <rect x="2" y="2" width="7" height="7" rx="1" fill="none" stroke={ink[900]} strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1" fill={ink[900]} />
      <rect x="2" y="11" width="7" height="7" rx="1" fill={ink[900]} />
      <rect x="11" y="11" width="7" height="7" rx="1" fill="none" stroke={ink[900]} strokeWidth="1.5" />
    </svg>
  )
}

// ─── Operator Picker ──────────────────────────────────────────────────────────

function OperatorPicker({
  picker, onClose, onPick,
}: {
  picker: PickerState
  onClose: () => void
  onPick: (operator: Operator) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Mount animation — re-trigger when switching primary ↔ secondary
  useEffect(() => {
    setMounted(false)
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [expanded])

  // Keyboard close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (expanded) setExpanded(false); else onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, expanded])

  // Build item list: primary = 4 ops + "···"; secondary = 5 ops
  const items: Array<OperatorSpec & { isMore?: boolean }> = expanded
    ? SECONDARY_OPERATOR_SPECS
    : [
        ...PRIMARY_OPERATOR_SPECS,
        { operator: 'round' as Operator, label: 'More', glyph: '···', needsLiteral: false, isMore: true },
      ]

  const n = items.length  // always 5
  const radius = 80
  const span = Math.PI
  // Center the arc so the middle button (index 2) is directly in the direction of picker.angle
  const start = picker.angle - span / 2

  return (
    <div className="absolute inset-0 z-40" onClick={onClose}>
      {/* Anchor puck — stays at click position, is the center of the arc */}
      <div
        style={{
          position: 'absolute',
          left: picker.x - 16, top: picker.y - 16,
          width: 32, height: 32, borderRadius: '50%',
          background: ink[1000], color: ink[0],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 1,
        }}
        onClick={(e) => { e.stopPropagation(); if (expanded) setExpanded(false); else onClose() }}
      >
        <Plus
          style={{
            width: 14, height: 14,
            transform: mounted ? (expanded ? 'rotate(180deg)' : 'rotate(45deg)') : 'rotate(0deg)',
            transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
          }}
          strokeWidth={1.8}
        />
      </div>

      {/* Operator buttons fan out from puck center */}
      {items.map((spec, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1)
        const angle = start + t * span
        const tx = picker.x + Math.cos(angle) * radius
        const ty = picker.y + Math.sin(angle) * radius
        const delay = i * 22
        return (
          <button
            key={`${expanded ? 'sec' : 'pri'}-${spec.operator}-${i}`}
            type="button"
            title={spec.label}
            onClick={(e) => {
              e.stopPropagation()
              if (spec.isMore) {
                setExpanded(true)
              } else if (!expanded || spec.operator !== 'round' as Operator) {
                onPick(spec.operator)
              } else {
                onPick(spec.operator)
              }
            }}
            style={{
              position: 'absolute',
              left: (mounted ? tx : picker.x) - 18,
              top: (mounted ? ty : picker.y) - 18,
              width: 36, height: 36,
              borderRadius: '50%',
              border: `1px solid ${ink[spec.isMore ? 400 : 900]}`,
              background: spec.isMore ? ink[100] : ink[0],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: spec.glyph === '···' ? 13 : spec.glyph.length > 1 ? 11 : 15,
              fontWeight: 700,
              color: spec.isMore ? ink[500] : ink[900],
              cursor: 'pointer',
              letterSpacing: spec.glyph === '···' ? '0.1em' : 'normal',
              transition: `left 260ms cubic-bezier(.2,.9,.25,1.2) ${delay}ms, top 260ms cubic-bezier(.2,.9,.25,1.2) ${delay}ms, opacity 150ms ${delay}ms`,
              opacity: mounted ? 1 : 0,
            }}
          >
            {spec.glyph}
          </button>
        )
      })}
    </div>
  )
}

// ─── Operator Literal Input ───────────────────────────────────────────────────

function OperatorLiteralInput({
  pending, onCancel, onCommit,
}: {
  pending: PendingOperatorState
  onCancel: () => void
  onCommit: (value: number) => void
}) {
  const [value, setValue] = useState('')
  const spec = ALL_OPERATOR_SPECS.find((s) => s.operator === pending.operator)
  return (
    <div className="absolute inset-0 z-50" onClick={onCancel}>
      <div className="absolute inset-0 bg-ink-1000/20" />
      <div
        style={{
          position: 'absolute',
          left: pending.x - 110,
          top: pending.y - 36,
          width: 240,
          background: ink[0],
          border: `1px solid ${ink[900]}`,
          borderRadius: 6,
          padding: '8px 12px',
          boxShadow: '0 6px 18px rgba(24,24,27,0.14)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{spec?.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: ink[900], fontWeight: 700 }}>{spec?.glyph}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            autoFocus
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel()
              if (e.key === 'Enter') { const n = Number(value); if (Number.isFinite(n)) onCommit(n) }
            }}
            placeholder="Enter value…"
            style={{
              width: '100%', border: `1px solid ${ink[300]}`, borderRadius: 4,
              padding: '6px 40px 6px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[900],
              background: ink[50], outline: 'none',
            }}
          />
          <button
            onClick={() => { const n = Number(value); if (Number.isFinite(n)) onCommit(n) }}
            style={{
              position: 'absolute', right: 3, top: 3,
              height: 24, padding: '0 8px', background: ink[900], color: ink[0],
              border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >↵</button>
        </div>
      </div>
    </div>
  )
}

// ─── Excel Sheet View ─────────────────────────────────────────────────────────

function ExcelSheetView({
  parsedCells, activeAddress, onSelectAddress, valueByNodeId,
}: {
  parsedCells: ParsedCell[]
  activeAddress: string | null
  onSelectAddress: (address: string) => void
  valueByNodeId: Map<string, number | string | null>
}) {
  const cellMap = useMemo(() => new Map(parsedCells.map((c) => [c.address.toUpperCase(), c])), [parsedCells])
  const cols = parsedCells.map((c) => c.col)
  const rows = parsedCells.map((c) => c.row)
  const minCol = Math.min(...cols), maxCol = Math.max(...cols)
  const minRow = Math.min(...rows), maxRow = Math.max(...rows)
  const activeCell = activeAddress ? cellMap.get(activeAddress.toUpperCase()) ?? null : null

  const colLabel = (col: number) => {
    let n = col + 1, result = ''
    while (n > 0) { n -= 1; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26) }
    return result
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: ink[0] }}>
      {/* Formula bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: `1px solid ${ink[200]}`, background: ink[50] }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, padding: '4px 10px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 4, minWidth: 56, textAlign: 'center' }}>
          {activeCell?.address ?? ''}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[400] }}>ƒ</span>
        <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[800], padding: '4px 10px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 4, minHeight: 28, display: 'flex', alignItems: 'center' }}>
          {activeCell?.formula ? `= ${activeCell.formula}` : activeCell ? formatDisplayValue(valueByNodeId.get(activeCell.address ?? '')) : ''}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 13, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 48, background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500] }} />
              {['A', 'B', 'C', 'D'].map((c) => (
                <th key={c} style={{ width: c === 'A' ? 220 : 160, background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500], textAlign: 'center' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRow - minRow + 3 }, (_, i) => minRow + i).map((row) => (
              <tr key={row}>
                <td style={{ background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500], textAlign: 'center', width: 48 }}>{row + 1}</td>
                {Array.from({ length: maxCol - minCol + 1 }, (_, i) => minCol + i).map((col) => {
                  const address = `${colLabel(col)}${row + 1}`
                  const cell = cellMap.get(address)
                  const active = activeAddress?.toUpperCase() === address
                  return (
                    <td
                      key={address}
                      onClick={() => onSelectAddress(address)}
                      style={{
                        position: 'relative',
                        border: active ? `2px solid ${ink[900]}` : `1px solid ${ink[200]}`,
                        background: active ? ink[50] : ink[0],
                        padding: '6px 12px',
                        fontSize: 13,
                        fontFamily: 'var(--font-mono)',
                        color: ink[800],
                        height: 30,
                        cursor: 'cell',
                      }}
                    >
                      {cell?.isMarked && <span style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: accent.mauve }} />}
                      {cell ? formatDisplayValue(valueByNodeId.get(address), cell.isPercent) : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', borderTop: `1px solid ${ink[200]}`, background: ink[50], padding: '6px 16px', gap: 4 }}>
        <div style={{ padding: '4px 12px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: '4px 4px 0 0', fontSize: 11, color: ink[700], fontWeight: 500 }}>Sheet1</div>
        <div style={{ padding: '4px 12px', fontSize: 11, color: ink[400] }}>+</div>
      </div>
    </div>
  )
}

// ─── Canvas Panel ─────────────────────────────────────────────────────────────

type CanvasContextMenu = { x: number; y: number; svgX: number; svgY: number } | null

function UnifiedCanvasPanel({
  graph, baseLayout, manualPositions, setManualPositions,
  focus, hoveredNodeId, setHoveredNodeId, hoveredEdgeId, setHoveredEdgeId,
  activeNodeId, onSelectNode, onCanvasClick, onOpenPicker,
  valueByNodeId, scenarioValues, editingNodeId, setEditingNodeId, onEditCommit,
  onCreateNodeAt, onRelayout,
}: {
  graph: UnifiedGraph
  baseLayout: ReturnType<typeof layoutUnifiedGraph>
  manualPositions: Record<string, PositionedNode>
  setManualPositions: React.Dispatch<React.SetStateAction<Record<string, PositionedNode>>>
  focus: FocusGraph
  hoveredNodeId: string | null
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>
  hoveredEdgeId: string | null
  setHoveredEdgeId: React.Dispatch<React.SetStateAction<string | null>>
  activeNodeId: string | null
  onSelectNode: (id: string) => void
  onCanvasClick: () => void
  onOpenPicker: (sourceId: string, angle: number, clientX: number, clientY: number) => void
  valueByNodeId: Map<string, number | string | null>
  scenarioValues?: Record<string, number>
  editingNodeId: string | null
  setEditingNodeId: React.Dispatch<React.SetStateAction<string | null>>
  onEditCommit: (nodeId: string, value: number) => void
  onCreateNodeAt: (x: number, y: number) => void
  onRelayout: () => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CanvasContextMenu>(null)
  const lastPanPoint = useRef({ x: 0, y: 0 })

  const positionedNodes = useMemo(() => {
    const map = new Map<string, PositionedNode>()
    graph.nodes.forEach((node) => {
      map.set(node.id, manualPositions[node.id] ?? baseLayout.positions.get(node.id) ?? { x: 0, y: 0, w: PRIMARY_NODE_WIDTH, h: PRIMARY_NODE_HEIGHT })
    })
    return map
  }, [baseLayout.positions, graph.nodes, manualPositions])

  const fitToScreen = useCallback(() => {
    const container = wrapRef.current
    if (!container || positionedNodes.size === 0) return
    const { width: cw, height: ch } = container.getBoundingClientRect()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    positionedNodes.forEach((pos) => {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + pos.w)
      maxY = Math.max(maxY, pos.y + pos.h)
    })
    if (!isFinite(minX)) return
    const pad = 56
    const newZoom = Math.min(cw / (maxX - minX + 2 * pad), ch / (maxY - minY + 2 * pad), 2)
    setZoom(newZoom)
    setPan({ x: minX - pad, y: minY - pad })
  }, [positionedNodes])

  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: clientX, y: clientY }
    const pt = svg.createSVGPoint()
    pt.x = clientX; pt.y = clientY
    const tr = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    return { x: tr.x, y: tr.y }
  }, [])

  const pathFor = useCallback((edge: VisualEdge) => {
    const s = positionedNodes.get(edge.source)
    const t = positionedNodes.get(edge.target)
    if (!s || !t) return null
    const sx = s.x + s.w, sy = s.y + s.h / 2
    const tx = t.x, ty = t.y + t.h / 2
    const mx = (sx + tx) / 2
    const wob = Math.sin((sx + sy) * 0.013) * 4
    const angle = Math.atan2(ty - sy, tx - sx)
    return {
      d: `M ${sx} ${sy} C ${mx} ${sy + wob}, ${mx} ${ty - wob}, ${tx} ${ty}`,
      sx, sy, tx, ty, mx, my: (sy + ty) / 2, angle,
    }
  }, [positionedNodes])

  // Inline editing: open
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingNodeId])

  const handleDoubleClickValue = useCallback((nodeId: string, currentValue: number | string | null) => {
    setEditingNodeId(nodeId)
    setEditValue(String(currentValue ?? ''))
  }, [setEditingNodeId])

  const commitEdit = useCallback(() => {
    if (!editingNodeId) return
    const n = parseFloat(editValue)
    if (Number.isFinite(n)) onEditCommit(editingNodeId, n)
    setEditingNodeId(null)
  }, [editingNodeId, editValue, onEditCommit, setEditingNodeId])

  const svgW = Math.max(baseLayout.width, 960)
  const svgH = Math.max(baseLayout.height, 560)

  const zoomButtonStyle = {
    width: 32, height: 32,
    border: `1px solid ${ink[200]}`,
    borderRadius: 4,
    background: ink[0],
    color: ink[700],
    fontSize: 16,
    fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    lineHeight: 1,
  } as const

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: ink[0] }}>
      <svg
        ref={svgRef}
        viewBox={`${pan.x} ${pan.y} ${svgW / zoom} ${svgH / zoom}`}
        style={{ display: 'block', width: '100%', height: '100%', cursor: isPanning ? 'grabbing' : draggingId ? 'grabbing' : 'default' }}
        onClick={(e) => { if (!isPanning) { onCanvasClick(); setCtxMenu(null) } }}
        onContextMenu={(e) => {
          e.preventDefault()
          const pt = svgPoint(e.clientX, e.clientY)
          setCtxMenu({ x: e.clientX, y: e.clientY, svgX: pt.x, svgY: pt.y })
        }}
        onMouseDown={(e) => {
          // Background pan: only when clicking on empty canvas (not on a node)
          if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect' && (e.target as SVGElement).getAttribute('fill') === 'url(#exceling-dots)') {
            setIsPanning(true)
            lastPanPoint.current = { x: e.clientX, y: e.clientY }
          }
        }}
        onMouseMove={(e) => {
          // Background pan
          if (isPanning) {
            const dx = (e.clientX - lastPanPoint.current.x) / zoom
            const dy = (e.clientY - lastPanPoint.current.y) / zoom
            setPan((prev) => ({ x: prev.x - dx, y: prev.y - dy }))
            lastPanPoint.current = { x: e.clientX, y: e.clientY }
            return
          }
          // Node drag
          if (!draggingId) return
          const pt = svgPoint(e.clientX, e.clientY)
          setManualPositions((prev) => {
            const cur = prev[draggingId] ?? positionedNodes.get(draggingId)
            if (!cur) return prev
            return { ...prev, [draggingId]: { ...cur, x: pt.x - dragOffset.x, y: pt.y - dragOffset.y } }
          })
        }}
        onMouseUp={() => { setDraggingId(null); setIsPanning(false) }}
        onMouseLeave={() => { setDraggingId(null); setIsPanning(false) }}
        onWheel={(e) => {
          e.preventDefault()
          const factor = e.deltaY > 0 ? 0.92 : 1.08
          setZoom((z) => Math.max(0.2, Math.min(4, z * factor)))
        }}
      >
        <defs>
          {/* Dot grid */}
          <pattern id="exceling-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.8" fill={ink[200]} />
          </pattern>

          {/* Rough hand-drawn filter */}
          <filter id="rough-u" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Arrow markers — one per accent color */}
          <marker id="arrow-sage" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={accent.sage} />
          </marker>
          <marker id="arrow-mauve" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={accent.mauve} />
          </marker>
          <marker id="arrow-slate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={accent.slate} />
          </marker>
        </defs>

        <rect width="100%" height="100%" fill="url(#exceling-dots)" />

        {/* ── Edges ── */}
        {graph.edges.map((edge) => {
          const path = pathFor(edge)
          if (!path) return null
          const chip = buildEdgeChipText(edge, valueByNodeId, scenarioValues)
          const dimmed = focus.nodeIds.size > 0 && !(focus.edgeIds.has(edge.id) && focus.nodeIds.has(edge.source) && focus.nodeIds.has(edge.target))
          const edgeHovered = hoveredEdgeId === edge.id
          const col = edgeStrokeColor(edge.op)
          const markerId = `arrow-${edgeMarkerColor(edge.op)}`
          const chipW = Math.max(32, chip.text.length * 7 + 14)
          const chipH = chip.detail ? 30 : 20

          return (
            <g key={edge.id} opacity={dimmed ? 0.18 : 1}>
              {/* Visible path */}
              <path
                d={path.d}
                fill="none"
                stroke={col}
                strokeWidth={edge.modifiers.some((m) => m.op === '*') ? 1.75 : 1.35}
                strokeDasharray={edgeDash(edge.op)}
                markerEnd={`url(#${markerId})`}
                filter="url(#rough-u)"
              />
              {/* Wide hit area */}
              <path
                d={path.d}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId((c) => c === edge.id ? null : c)}
              />

              {/* Edge chip (hidden when hovered) */}
              {!edgeHovered && (
                <g transform={`translate(${path.mx} ${path.my})`} pointerEvents="none">
                  <rect x={-chipW / 2} y={-chipH / 2} width={chipW} height={chipH} rx="4" fill={ink[1000]} opacity="0.94" />
                  <text x="0" y={chip.detail ? -2 : 4} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill={ink[0]} fontWeight="600">{chip.text}</text>
                  {chip.detail && (
                    <text x="0" y="10" textAnchor="middle" fontSize="8" fontFamily="var(--font-sans)" fill={ink[400]} letterSpacing="0.04em">{chip.detail}</text>
                  )}
                </g>
              )}

              {/* Endpoint dots on hover */}
              {edgeHovered && (
                <>
                  <circle cx={path.sx} cy={path.sy} r="3.5" fill={ink[0]} stroke={ink[700]} strokeWidth="1.2" />
                  <circle cx={path.tx} cy={path.ty} r="3.5" fill={ink[0]} stroke={ink[700]} strokeWidth="1.2" />
                </>
              )}

              {/* Mid-point + puck */}
              <g
                transform={`translate(${path.mx} ${path.my})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId((c) => c === edge.id ? null : c)}
                onClick={(e) => { e.stopPropagation(); onOpenPicker(edge.target, path.angle, e.clientX, e.clientY) }}
              >
                <circle
                  r={edgeHovered ? 12 : 3.5}
                  fill={edgeHovered ? ink[1000] : ink[0]}
                  stroke={edgeHovered ? ink[1000] : ink[700]}
                  strokeWidth="1.2"
                  style={{ transition: 'r 180ms cubic-bezier(.2,.8,.2,1), fill 160ms, stroke 160ms' }}
                />
                {edgeHovered && (
                  <>
                    <line x1="-5" y1="0" x2="5" y2="0" stroke={ink[0]} strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="0" y1="-5" x2="0" y2="5" stroke={ink[0]} strokeWidth="1.6" strokeLinecap="round" />
                  </>
                )}
              </g>
            </g>
          )
        })}

        {/* ── Nodes ── */}
        {graph.nodes.map((node) => {
          const position = positionedNodes.get(node.id)
          if (!position) return null
          const rawValue = scenarioValues ? scenarioValues[node.id] : valueByNodeId.get(node.id)
          const displayVal = scenarioValues
            ? fmt(rawValue as number)
            : formatDisplayValue(rawValue, node.isPercent)
          const selected = activeNodeId === node.id
          const dimmed = focus.nodeIds.size > 0 && !focus.nodeIds.has(node.id)
          const hovered = hoveredNodeId === node.id
          const showPorts = hovered || selected
          const accentCol = nodeAccentFromKind(node.kind)
          const isEditing = editingNodeId === node.id
          const isInputNode = node.kind === 'input'

          return (
            <g
              key={node.id}
              transform={`translate(${position.x} ${position.y})`}
              opacity={dimmed ? 0.28 : 1}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId((c) => c === node.id ? null : c)}
              onMouseDown={(e) => {
                if (isEditing) return
                const pt = svgPoint(e.clientX, e.clientY)
                setDraggingId(node.id)
                setDragOffset({ x: pt.x - position.x, y: pt.y - position.y })
                onSelectNode(node.id)
                e.stopPropagation()
              }}
              onClick={() => { if (!isEditing) onSelectNode(node.id) }}
              style={{ cursor: isEditing ? 'default' : 'grab' }}
            >
              {/* Card */}
              <rect
                width={position.w}
                height={position.h}
                rx="6"
                fill={selected ? ink[50] : ink[0]}
                stroke={selected ? ink[900] : hovered ? ink[400] : ink[700]}
                strokeWidth={selected ? 1.6 : 1.1}
                filter="url(#rough-u)"
              />
              {/* Accent bar */}
              <rect x="0" y="0" width="22" height="3" fill={accentCol} filter="url(#rough-u)" />

              {/* Kind badge */}
              <text x="12" y="19" fontSize="9" fontFamily="var(--font-sans)" fill={ink[400]} fontWeight="600" letterSpacing="1.4">
                {nodeRoleLabel(node.kind)}
              </text>
              {/* Cell address */}
              <text x={position.w - 12} y="19" textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={ink[400]}>
                {node.address}
              </text>
              {/* Label */}
              <text x="12" y="38" fontSize="12" fontFamily="var(--font-sans)" fill={ink[800]} fontWeight="600">
                {truncateLabel(node.label, 22)}
              </text>

              {/* Value — show input control if editing, else text */}
              {isEditing ? (
                <foreignObject x="8" y={position.h - 36} width={position.w - 16} height="28">
                  <input
                    ref={editInputRef}
                    type="number"
                    step="any"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditingNodeId(null)
                      e.stopPropagation()
                    }}
                    onBlur={commitEdit}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%', height: '100%',
                      border: `1px solid ${ink[900]}`, borderRadius: 3,
                      background: ink[50], outline: 'none',
                      fontFamily: 'var(--font-mono)', fontSize: 14,
                      fontWeight: 700, color: ink[900],
                      padding: '0 6px', textAlign: 'right',
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x="12"
                  y={position.h - 14}
                  fontSize="18"
                  fontFamily="var(--font-mono)"
                  fill={node.kind === 'output' ? ink[1000] : ink[900]}
                  fontWeight="700"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleDoubleClickValue(node.id, rawValue ?? null)
                  }}
                  style={{ cursor: 'text' }}
                >
                  {displayVal}
                </text>
              )}

              {/* Connection ports — visible on hover / selected */}
              {showPorts && !isEditing && (
                [
                  { dir: 'n' as Direction, x: position.w / 2, y: 0 },
                  { dir: 'e' as Direction, x: position.w, y: position.h / 2 },
                  { dir: 's' as Direction, x: position.w / 2, y: position.h },
                  { dir: 'w' as Direction, x: 0, y: position.h / 2 },
                ].map((port) => (
                  <g
                    key={port.dir}
                    transform={`translate(${port.x} ${port.y})`}
                    style={{ cursor: 'copy' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenPicker(node.id, getDirectionAngle(port.dir), e.clientX, e.clientY)
                    }}
                  >
                    <circle r="6" fill={ink[0]} stroke={ink[900]} strokeWidth="1.2" />
                    <circle r="2.5" fill={ink[900]} />
                  </g>
                ))
              )}
            </g>
          )
        })}
      </svg>

      {/* ── Zoom controls (bottom-right) ── */}
      <div style={{
        position: 'absolute', right: 16, bottom: 16,
        display: 'flex', flexDirection: 'column', gap: 4,
        background: ink[0], border: `1px solid ${ink[200]}`,
        borderRadius: 8, padding: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <button
          type="button"
          title="Zoom in"
          onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
          style={zoomButtonStyle}
        >+</button>
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))}
          style={zoomButtonStyle}
        >−</button>
        <div style={{ height: 1, background: ink[200] }} />
        <button
          type="button"
          title="Fit to screen"
          onClick={fitToScreen}
          style={zoomButtonStyle}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1" />
            <path d="M2 6 L6 6 L6 2 M10 2 L10 6 L14 6 M14 10 L10 10 L10 14 M6 14 L6 10 L2 10" />
          </svg>
        </button>
      </div>

      {/* ── Right-click context menu ── */}
      {ctxMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60 }}
          onClick={() => setCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}
        >
          <div
            style={{
              position: 'absolute',
              left: ctxMenu.x,
              top: ctxMenu.y,
              minWidth: 160,
              background: ink[0],
              border: `1px solid ${ink[200]}`,
              borderRadius: 8,
              padding: '4px 0',
              boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { onCreateNodeAt(ctxMenu.svgX, ctxMenu.svgY); setCtxMenu(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                fontSize: 12, fontWeight: 500, color: ink[800], cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = ink[100] }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>+</span>
              New Node Card
            </button>
            <div style={{ height: 1, margin: '2px 8px', background: ink[200] }} />
            <button
              type="button"
              onClick={() => { onRelayout(); setCtxMenu(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                fontSize: 12, fontWeight: 500, color: ink[800], cursor: 'pointer',
                textAlign: 'left', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = ink[100] }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M2 8h8M2 12h4" />
              </svg>
              Re-layout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WhatIfSlider ─────────────────────────────────────────────────────────────

function WhatIfSlider({
  label, cell, current, baseline, onOverride,
}: {
  label: string
  cell: string
  current: number
  baseline: number
  onOverride: (v: number) => void
}) {
  const min = Math.max(0, current * 0.2)
  const max = current === 0 ? 100 : current * 2.5
  const step = current > 100 ? Math.max(1, Math.round(current / 200)) : current > 1 ? 0.5 : 0.01
  const deltaPct = baseline ? ((current - baseline) / baseline) * 100 : 0

  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${ink[100]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: ink[700] }}>{label}</div>
          <div style={{ fontSize: 10, color: ink[400], fontFamily: 'var(--font-mono)' }}>{cell}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: ink[900] }}>{fmt(current)}</div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={current}
        onChange={(e) => onOverride(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: ink[900] }}
      />
      {Math.abs(deltaPct) > 0.5 && (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: deltaPct > 0 ? status.ok : status.err, marginTop: 2 }}>
          {deltaPct > 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}% vs baseline {fmt(baseline)}
        </div>
      )}
    </div>
  )
}

// ─── Main FlowCanvas ──────────────────────────────────────────────────────────

export function FlowCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // — Store (Excel mode) —
  const fileName = useFlowStore((s) => s.fileName)
  const storeNodes = useFlowStore((s) => s.nodes)
  const storeEdges = useFlowStore((s) => s.edges)
  const parsedCells = useFlowStore((s) => s.parsedCells)
  const error = useFlowStore((s) => s.error)
  const isLoading = useFlowStore((s) => s.isLoading)
  const setFlowData = useFlowStore((s) => s.setFlowData)
  const setLoading = useFlowStore((s) => s.setLoading)
  const setError = useFlowStore((s) => s.setError)
  const addNode = useFlowStore((s) => s.addNode)
  const addEdge = useFlowStore((s) => s.addEdge)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const undo = useFlowStore((s) => s.undo)
  const redo = useFlowStore((s) => s.redo)
  const canUndo = useFlowHistory((s) => s.pastStates.length > 0)
  const canRedo = useFlowHistory((s) => s.futureStates.length > 0)

  // — App mode —
  const [appMode, setAppMode] = useState<AppMode>('excel')
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')

  // — Scenario state —
  const [scenarioKey, setScenarioKey] = useState('revenue')
  const [scenarioOverrides, setScenarioOverrides] = useState<Record<string, number>>({})

  const scenario = SCENARIOS[scenarioKey]
  const [customScenarioNodes, setCustomScenarioNodes] = useState<ScenarioNode[]>([])
  const nodeCounterRef = useRef(0)
  const allScenarioNodes = useMemo(() => [...scenario.nodes, ...customScenarioNodes], [scenario.nodes, customScenarioNodes])
  const scenarioValues = useMemo(
    () => computeAll(allScenarioNodes, scenarioOverrides),
    [allScenarioNodes, scenarioOverrides],
  )

  // — Shared canvas state —
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [manualPositions, setManualPositions] = useState<Record<string, PositionedNode>>({})
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [pendingOperator, setPendingOperator] = useState<PendingOperatorState | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [excelSelection, setExcelSelection] = useState<string | null>(null)
  const [whatIfOverrides, setWhatIfOverrides] = useState<Record<string, number>>({})
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)

  // Reset on scenario change
  useEffect(() => {
    setScenarioOverrides({})
    setActiveNodeId(null)
    setManualPositions({})
    setEditingNodeId(null)
    setCustomScenarioNodes([])
  }, [scenarioKey])

  // — Scenario graph —
  const scenarioGraph = useMemo(() => buildScenarioUnifiedGraph(allScenarioNodes), [allScenarioNodes])
  const scenarioBaseLayout = useMemo(() => {
    const positions = scenarioLayout(allScenarioNodes)
    const ids = Object.keys(positions)
    const maxX = Math.max(...ids.map((id) => positions[id].x + positions[id].w))
    const maxY = Math.max(...ids.map((id) => positions[id].y + positions[id].h))
    return {
      positions: new Map(Object.entries(positions)) as Map<string, PositionedNode>,
      width: Math.max(960, maxX + 80),
      height: Math.max(560, maxY + 80),
    }
  }, [allScenarioNodes])

  // Auto-select output node for formula bar
  useEffect(() => {
    if (!activeNodeId) {
      const output = allScenarioNodes.find((n) => n.kind === 'output')
      if (output) setActiveNodeId(output.id)
    }
  }, [activeNodeId, allScenarioNodes])

  // — Excel-mode graph —
  const deferredNodes = useDeferredValue(storeNodes)
  const deferredEdges = useDeferredValue(storeEdges)
  const excelGraph = useMemo(() => buildUnifiedGraph(deferredNodes, deferredEdges), [deferredNodes, deferredEdges])
  const excelBaseLayout = useMemo(() => layoutUnifiedGraph(excelGraph), [excelGraph])
  const excelMainPath = useMemo(() => buildMainPath(excelGraph), [excelGraph])
  const excelFocus = useMemo(
    () => (activeNodeId ? buildFocusFromTarget(excelGraph, activeNodeId) : excelMainPath),
    [activeNodeId, excelMainPath, excelGraph],
  )
  const whatIfScenario = useMemo(
    () => (parsedCells?.length ? simulateWhatIf(parsedCells, whatIfOverrides) : null),
    [parsedCells, whatIfOverrides],
  )
  const excelValueMap = useMemo(() => getNodeValueMap(storeNodes, whatIfScenario), [storeNodes, whatIfScenario])
  const excelFullNodeMap = useMemo(() => new Map(storeNodes.map((n) => [n.id, n])), [storeNodes])

  useEffect(() => {
    if (appMode === 'excel' && !activeNodeId && excelMainPath.endId) setActiveNodeId(excelMainPath.endId)
  }, [activeNodeId, excelMainPath.endId, appMode])

  // — Active graph (scenario or excel) —
  const graph = appMode === 'scenario' ? scenarioGraph : excelGraph
  const baseLayout = appMode === 'scenario' ? scenarioBaseLayout : excelBaseLayout
  const focus = appMode === 'scenario'
    ? (activeNodeId ? buildFocusFromTarget(scenarioGraph, activeNodeId) : buildMainPath(scenarioGraph))
    : excelFocus

  // Formula bar data
  const activeScenarioNode = appMode === 'scenario' ? scenario.nodes.find((n) => n.id === activeNodeId) ?? null : null
  const activeExcelNode = appMode === 'excel' ? excelFullNodeMap.get(activeNodeId ?? '') ?? null : null
  const activeValue = appMode === 'scenario'
    ? (activeNodeId ? scenarioValues[activeNodeId] : undefined)
    : (activeNodeId ? excelValueMap.get(activeNodeId) : undefined)

  const narrationLines = useMemo(() => {
    if (appMode === 'scenario') {
      const vmap = new Map<string, number | string | null>(
        Object.entries(scenarioValues).map(([k, v]) => [k, v]),
      )
      return buildNarration(scenarioGraph, focus, vmap)
    }
    return buildNarration(excelGraph, excelFocus, excelValueMap)
  }, [appMode, scenarioGraph, excelGraph, scenarioValues, excelValueMap, focus, excelFocus])

  // File import
  const toContainerPoint = useContainerPoint(containerRef)
  const hiddenInput = useHiddenFileInput(async (file) => {
    setLoading(true); setError(null); setWhatIfOverrides({}); setActiveNodeId(null); setExcelSelection(null); setManualPositions({})
    try {
      const parsed = await parseExcelFile(file)
      const built = buildFlowGraph(parsed.cells)
      const laidOut = applyDagreLayout(built.nodes, built.edges)
      setFlowData(file.name, laidOut, built.edges, parsed.cells)
      setAppMode('excel')
      startTransition(() => setViewMode('canvas'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入 Excel 失败。')
    } finally {
      setLoading(false)
    }
  })

  const openPicker = useCallback((sourceId: string, angle: number, clientX: number, clientY: number) => {
    const pt = toContainerPoint(clientX, clientY)
    setPendingOperator(null)
    setPicker({ sourceId, angle, x: pt.x, y: pt.y })
  }, [toContainerPoint])

  const handleCreateDerived = useCallback((sourceId: string, operator: Operator, literal: number | null, angle: number) => {
    if (appMode !== 'excel') return
    const sourceNode = excelFullNodeMap.get(sourceId)
    if (!sourceNode || sourceNode.type !== 'cellNode') return
    const sourceLabel = sourceNode.data.label ?? sourceId
    const resultLabel = buildDerivedLabel(sourceLabel, operator, literal)
    const machineFormula = buildMachineFormula(sourceId, operator, literal)
    const operatorId = addNode('operatorNode', { x: 0, y: 0 }, { operator, literalOperands: operator === 'round' || literal == null ? [] : [{ side: 'right', value: literal, isPercent: false }] })
    const resultId = addNode('cellNode', { x: 0, y: 0 }, { label: resultLabel, isInput: false, isOutput: false, value: 0, formula: machineFormula, machineFormula, visualRecipe: { sourceId, operator, literal } })
    addEdge(sourceId, operatorId); addEdge(operatorId, resultId)
    updateNodeData(resultId, { machineFormula, formula: machineFormula })
    const srcPos = manualPositions[sourceId] ?? baseLayout.positions.get(sourceId)
    if (srcPos) {
      setManualPositions((prev) => ({
        ...prev,
        [resultId]: { x: srcPos.x + Math.cos(angle) * 260, y: srcPos.y + Math.sin(angle) * 180, w: PRIMARY_NODE_WIDTH, h: PRIMARY_NODE_HEIGHT },
      }))
    }
    setActiveNodeId(resultId); setPicker(null); setPendingOperator(null)
  }, [addEdge, addNode, appMode, baseLayout.positions, excelFullNodeMap, manualPositions, updateNodeData])

  const handleEditCommit = useCallback((nodeId: string, value: number) => {
    if (appMode === 'scenario') {
      setScenarioOverrides((prev) => ({ ...prev, [nodeId]: value }))
    } else {
      updateNodeData(nodeId, { value: String(value) })
    }
  }, [appMode, updateNodeData])

  const handleCreateNodeAt = useCallback((x: number, y: number) => {
    if (appMode === 'scenario') {
      const id = `custom_${++nodeCounterRef.current}`
      const newNode: ScenarioNode = { id, kind: 'input', label: 'New', cell: '', value: 0 }
      setCustomScenarioNodes((prev) => [...prev, newNode])
      setManualPositions((prev) => ({
        ...prev,
        [id]: { x, y, w: PRIMARY_NODE_WIDTH, h: PRIMARY_NODE_HEIGHT },
      }))
      setActiveNodeId(id)
    } else {
      const nodeId = addNode('cellNode', { x: 0, y: 0 }, { label: 'New', isInput: true, isOutput: false, value: 0 })
      setManualPositions((prev) => ({
        ...prev,
        [nodeId]: { x, y, w: PRIMARY_NODE_WIDTH, h: PRIMARY_NODE_HEIGHT },
      }))
      setActiveNodeId(nodeId)
      setEditingNodeId(nodeId)
    }
  }, [addNode, appMode])

  const handleRelayout = useCallback(() => {
    setManualPositions({})
  }, [])

  const handleExport = useCallback(async () => {
    try {
      setError(null)
      if (appMode === 'excel') {
        await exportExcel(storeNodes, storeEdges, { sheetName: fileName?.replace(/\.[^.]+$/, '') ?? 'Model', includeLabels: true })
      }
    } catch (err) { setError(err instanceof Error ? err.message : '导出失败。') }
  }, [appMode, fileName, setError, storeEdges, storeNodes])

  // Active scenario node for formula bar and inspector
  const fmtActiveValue = appMode === 'scenario'
    ? fmt(activeValue as number)
    : formatDisplayValue(activeValue, activeExcelNode?.type === 'cellNode' ? activeExcelNode.data.isPercent : false)

  const activeFormula = appMode === 'scenario'
    ? activeScenarioNode?.formula ?? null
    : normalizeFormula(activeExcelNode?.type === 'cellNode' ? (activeExcelNode.data.machineFormula ?? activeExcelNode.data.formula ?? activeExcelNode.data.computedFormula) : null)

  const activeLabel = appMode === 'scenario'
    ? (activeScenarioNode?.label ?? 'Select a node')
    : (activeExcelNode?.type === 'cellNode' ? activeExcelNode.data.label ?? activeExcelNode.id : 'Select a node')

  const activeKind = appMode === 'scenario'
    ? (activeScenarioNode ? kindLabel(activeScenarioNode.kind) : '')
    : (activeExcelNode?.type === 'cellNode' ? (activeExcelNode.data.isOutput ? 'OUTPUT' : activeExcelNode.data.isInput ? 'INPUT' : 'COMPUTED') : '')

  const activeCell = appMode === 'scenario'
    ? (activeScenarioNode?.cell ?? '')
    : (activeExcelNode?.type === 'cellNode' ? activeExcelNode.data.address : '')

  // Substituted formula display
  const substitutedFormula = useMemo(() => {
    if (!activeFormula) return null
    if (appMode === 'scenario') {
      return activeFormula.replace(/[a-z_][a-z0-9_]*/gi, (m) => {
        const n = scenario.nodes.find((x) => x.id === m)
        return n ? fmt(scenarioValues[n.id]) : m
      })
    }
    return activeFormula.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => {
      if (!excelFullNodeMap.has(token)) return token
      const n = excelFullNodeMap.get(token)
      return formatDisplayValue(excelValueMap.get(token), n?.type === 'cellNode' ? n.data.isPercent : false)
    })
  }, [activeFormula, appMode, excelFullNodeMap, excelValueMap, scenario.nodes, scenarioValues])

  // Scenario input nodes for inspector sliders
  const scenarioInputs = scenario.nodes.filter((n) => n.kind === 'input' || n.kind === 'const')

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', height: '100%', width: '100%', background: ink[50] }}>
      {hiddenInput.input}

      {/* ── Left palette ── */}
      <aside style={{ width: 200, background: ink[0], borderRight: `1px solid ${ink[200]}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${ink[200]}`, fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Node Library</div>
        <div style={{ padding: '8px 12px', display: 'grid', gap: 6 }}>
          {(['input', 'const', 'computed', 'output'] as NodeKind[]).map((kind) => (
            <div key={kind} style={{ padding: 10, background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 4, cursor: 'grab' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: kindColor(kind) }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: ink[800] }}>{kindLabel(kind).charAt(0) + kindLabel(kind).slice(1).toLowerCase()}</span>
              </div>
              <div style={{ fontSize: 10, color: ink[500], marginTop: 4 }}>
                {kind === 'input' ? 'User value' : kind === 'const' ? 'Fixed number' : kind === 'computed' ? 'Formula' : 'Final result'}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${ink[200]}`, borderBottom: `1px solid ${ink[200]}`, fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginTop: 'auto' }}>
          {appMode === 'scenario' ? 'Nodes in model' : 'Nodes in model'}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px' }}>
          {(appMode === 'scenario' ? scenario.nodes : getCellNodes(storeNodes).map((n) => ({
            id: n.id, label: n.data.label ?? n.id, cell: n.data.address,
            kind: (n.data.isOutput ? 'output' : n.data.isInput ? 'input' : 'computed') as NodeKind,
            value: excelValueMap.get(n.id) ?? n.data.value,
          }))).map((n: any) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNodeId(n.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                background: activeNodeId === n.id ? ink[100] : 'transparent', border: 'none',
                borderRadius: 4, cursor: 'pointer', marginBottom: 2,
                borderLeft: `3px solid ${kindColor(n.kind)}`,
              }}
              onMouseEnter={(e) => { if (activeNodeId !== n.id) (e.currentTarget as HTMLElement).style.background = ink[50] }}
              onMouseLeave={(e) => { if (activeNodeId !== n.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, color: ink[800], fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                <span style={{ fontSize: 10, color: ink[400], fontFamily: 'var(--font-mono)' }}>{n.cell}</span>
              </div>
              <div style={{ fontSize: 11, color: ink[500], fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {appMode === 'scenario'
                  ? fmt(scenarioValues[n.id])
                  : formatDisplayValue(n.value)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>

        {/* ── Top bar ── */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, background: ink[0], borderBottom: `1px solid ${ink[200]}`, flexShrink: 0 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark />
            <span style={{ fontWeight: 700, fontSize: 14, color: ink[900], letterSpacing: '-0.01em' }}>Exceling</span>
            <span style={{ fontSize: 11, color: ink[400], fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>sketch ↔ workflow ↔ excel</span>
          </div>

          <div style={{ width: 1, height: 20, background: ink[200] }} />

          {/* Scenario selector / file name */}
          {appMode === 'scenario' ? (
            <>
              <select
                value={scenarioKey}
                onChange={(e) => { setScenarioKey(e.target.value); setActiveNodeId(null) }}
                style={{
                  height: 32, padding: '0 10px', background: ink[0],
                  border: `1px solid ${ink[300]}`, borderRadius: 4,
                  fontSize: 13, fontWeight: 500, color: ink[900],
                  fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
                }}
              >
                {Object.entries(SCENARIOS).map(([k, s]) => (
                  <option key={k} value={k}>{s.title}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: ink[500] }}>{scenario.subtitle}</span>
              {Object.keys(scenarioOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setScenarioOverrides({})}
                  style={{ fontSize: 11, color: ink[500], background: 'none', border: `1px solid ${ink[200]}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
                >
                  Reset overrides
                </button>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, color: ink[600] }}>{fileName ?? '未导入文件'}</span>
          )}

          <div style={{ flex: 1 }} />

          {/* View switcher */}
          <div style={{ display: 'flex', background: ink[100], borderRadius: 6, padding: 2, border: `1px solid ${ink[200]}` }}>
            {[{ k: 'canvas', label: 'Canvas' }, { k: 'excel', label: 'Excel' }].map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setViewMode(t.k as ViewMode)}
                style={{
                  height: 26, padding: '0 12px', border: 'none', borderRadius: 4,
                  background: viewMode === t.k ? ink[0] : 'transparent',
                  color: viewMode === t.k ? ink[900] : ink[500],
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* New Canvas */}
          <button
            type="button"
            onClick={() => {
              setAppMode('excel')
              setFlowData(null, [], [], [])
              setManualPositions({})
              setActiveNodeId(null)
              setEditingNodeId(null)
            }}
            style={{ height: 32, padding: '0 12px', background: ink[900], color: ink[0], border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <Plus style={{ width: 14, height: 14 }} strokeWidth={2} />
            新建画布
          </button>

          {/* Import */}
          <button
            type="button"
            onClick={hiddenInput.open}
            style={{ height: 32, padding: '0 12px', background: ink[0], color: ink[900], border: `1px solid ${ink[300]}`, borderRadius: 4, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <Upload style={{ width: 14, height: 14 }} strokeWidth={1.5} />
            Import .xlsx
          </button>
          {/* Export */}
          <button
            type="button"
            onClick={handleExport}
            style={{ height: 32, padding: '0 14px', background: ink[900], color: ink[0], border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <Download style={{ width: 14, height: 14 }} strokeWidth={1.5} />
            Export .xlsx
          </button>
        </div>

        {/* ── Formula bar ── */}
        {viewMode === 'canvas' && (
          <div style={{ padding: '14px 20px', background: ink[50], borderBottom: `1px solid ${ink[200]}`, display: 'flex', alignItems: 'baseline', gap: 24, flexShrink: 0 }}>
            {/* Left: kind + label */}
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                {activeKind}{activeCell ? ` · ${activeCell}` : ''}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: ink[900], marginTop: 2 }}>{activeLabel}</div>
            </div>
            {/* Center: formula */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {activeFormula ? (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[700] }}>{activeFormula}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[500], marginTop: 2 }}>{substitutedFormula}</div>
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: ink[400] }}>— raw input —</div>
              )}
            </div>
            {/* Right: result */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>result</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: ink[1000], lineHeight: 1.1, marginTop: 2 }}>
                = {fmtActiveValue}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ borderBottom: `1px solid ${ink[200]}`, background: ink[50], padding: '8px 16px', fontSize: 12, color: status.err }}>
            {error}
          </div>
        )}

        {/* ── Main canvas / excel area ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {viewMode === 'excel' && appMode === 'excel' && parsedCells?.length ? (
              <ExcelSheetView
                parsedCells={parsedCells}
                activeAddress={excelSelection ?? activeNodeId}
                onSelectAddress={(addr) => { setExcelSelection(addr); setActiveNodeId(addr) }}
                valueByNodeId={excelValueMap}
              />
            ) : viewMode === 'excel' && appMode === 'scenario' ? (
              // Scenario "Excel" view
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: ink[0] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: `1px solid ${ink[200]}`, background: ink[50] }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, padding: '4px 10px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 4, minWidth: 56, textAlign: 'center' }}>
                    {activeScenarioNode?.cell ?? ''}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[400] }}>ƒ</span>
                  <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: ink[800], padding: '4px 10px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 4 }}>
                    {activeScenarioNode?.formula ? `= ${formulaToExcel(activeScenarioNode.formula, scenario.nodes)}` : fmt(scenarioValues[activeScenarioNode?.id ?? ''])}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 13, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 48, background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500] }} />
                        {['A', 'B'].map((c) => <th key={c} style={{ width: c === 'A' ? 220 : 160, background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500], textAlign: 'center' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.nodes.map((n) => {
                        const m = n.cell.match(/([A-Z]+)(\d+)/)
                        const row = m ? parseInt(m[2], 10) : 0
                        const isActive = activeNodeId === n.id
                        return (
                          <tr key={n.id} onClick={() => setActiveNodeId(n.id)}>
                            <td style={{ background: ink[100], border: `1px solid ${ink[200]}`, padding: '4px 8px', fontSize: 11, fontWeight: 500, color: ink[500], textAlign: 'center' }}>{row}</td>
                            <td style={{ border: `1px solid ${ink[200]}`, padding: '6px 12px', color: ink[500] }}>{n.label}{n.unit ? ` (${n.unit})` : ''}</td>
                            <td style={{ position: 'relative', border: isActive ? `2px solid ${ink[900]}` : `1px solid ${ink[200]}`, background: isActive ? ink[50] : ink[0], padding: '6px 12px', fontFamily: 'var(--font-mono)', cursor: 'cell' }}>
                              <span style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: kindColor(n.kind) }} />
                              {n.formula ? `= ${formulaToExcel(n.formula, scenario.nodes)}` : fmt(scenarioValues[n.id])}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <UnifiedCanvasPanel
                graph={graph}
                baseLayout={baseLayout}
                manualPositions={manualPositions}
                setManualPositions={setManualPositions}
                focus={focus}
                hoveredNodeId={hoveredNodeId}
                setHoveredNodeId={setHoveredNodeId}
                hoveredEdgeId={hoveredEdgeId}
                setHoveredEdgeId={setHoveredEdgeId}
                activeNodeId={activeNodeId}
                onSelectNode={setActiveNodeId}
                onCanvasClick={() => setActiveNodeId(null)}
                onOpenPicker={openPicker}
                valueByNodeId={appMode === 'excel' ? excelValueMap : new Map()}
                scenarioValues={appMode === 'scenario' ? scenarioValues : undefined}
                editingNodeId={editingNodeId}
                setEditingNodeId={setEditingNodeId}
                onEditCommit={handleEditCommit}
                onCreateNodeAt={handleCreateNodeAt}
                onRelayout={handleRelayout}
              />
            )}

            {/* Canvas overlay: status bar + narration */}
            {viewMode === 'canvas' && (
              <>
                {/* Canvas label */}
                <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: ink[0], border: `1px solid ${ink[200]}`, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Canvas</span>
                  <span style={{ width: 1, height: 12, background: ink[200] }} />
                  <span style={{ fontSize: 10, color: ink[400], fontFamily: 'var(--font-mono)' }}>
                    {graph.nodes.length} cards · {graph.edges.length} connectors
                  </span>
                </div>

                {/* Narration bubble */}
                <div style={{ position: 'absolute', left: 16, bottom: 16, maxWidth: 440, background: ink[1000], color: ink[0], borderRadius: 8, padding: '14px 16px', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ fontSize: 9, color: ink[400], letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                    Narration {Object.keys(appMode === 'scenario' ? scenarioOverrides : whatIfOverrides).length > 0 ? '· what-if active' : ''}
                  </div>
                  <div style={{ color: ink[0], fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                    {activeLabel} evaluates to <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtActiveValue}</span>.
                  </div>
                  {narrationLines.length > 0 && (
                    <div style={{ color: ink[300], fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {narrationLines.slice(0, 4).join('  →  ')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Inspector / What-if sidebar (collapsible) ── */}
          {inspectorCollapsed ? (
            <aside style={{ width: 36, background: ink[0], borderLeft: `1px solid ${ink[200]}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, flexShrink: 0 }}>
              <button
                type="button"
                title="Expand inspector"
                onClick={() => setInspectorCollapsed(false)}
                style={{ width: 28, height: 28, border: `1px solid ${ink[200]}`, borderRadius: 4, background: ink[0], color: ink[600], fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >‹</button>
            </aside>
          ) : (
            <aside style={{ width: 280, background: ink[0], borderLeft: `1px solid ${ink[200]}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${ink[200]}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Inspector</div>
                  {activeScenarioNode || (activeExcelNode?.type === 'cellNode') ? (
                    <>
                      <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>{activeCell}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: ink[900], marginTop: 4 }}>{activeLabel}</div>
                    </>
                  ) : (
                    <div style={{ color: ink[400], fontSize: 12 }}>Click any node to inspect & simulate.</div>
                  )}
                </div>
                <button
                  type="button"
                  title="Collapse inspector"
                  onClick={() => setInspectorCollapsed(true)}
                  style={{ width: 24, height: 24, border: `1px solid ${ink[200]}`, borderRadius: 4, background: ink[0], color: ink[500], fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >›</button>
              </div>

              {(activeScenarioNode || activeExcelNode?.type === 'cellNode') && (
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${ink[200]}` }}>
                  <div style={{ padding: 12, background: ink[50], border: `1px solid ${ink[200]}`, borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Value</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: ink[1000], marginTop: 2 }}>{fmtActiveValue}</div>
                  </div>
                  {activeFormula && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Formula</div>
                      <div style={{ padding: '8px 10px', background: ink[50], border: `1px solid ${ink[200]}`, borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: ink[800] }}>= {activeFormula}</div>
                      <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: ink[500] }}>= {substitutedFormula}</div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: ink[500], letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>Quick What-if</div>
                {appMode === 'scenario' ? (
                  scenarioInputs.map((n) => (
                    <WhatIfSlider
                      key={n.id}
                      label={n.label}
                      cell={n.cell}
                      current={scenarioOverrides[n.id] ?? n.value ?? 0}
                      baseline={n.value ?? 0}
                      onOverride={(v) => setScenarioOverrides((prev) => ({ ...prev, [n.id]: v }))}
                    />
                  ))
                ) : (
                getCellNodes(storeNodes).filter((n) => n.data.isInput).slice(0, 6).map((n) => {
                  const cur = whatIfOverrides[n.id.toUpperCase()] ?? parseNumericValue(n.data.value) ?? 0
                  const baseline = parseNumericValue(n.data.value) ?? cur
                  return (
                    <WhatIfSlider
                      key={n.id}
                      label={n.data.label ?? n.id}
                      cell={n.data.address}
                      current={cur}
                      baseline={baseline}
                      onOverride={(v) => setWhatIfOverrides((prev) => ({ ...prev, [n.id.toUpperCase()]: v }))}
                    />
                  )
                })
              )}
            </div>

            {appMode === 'excel' && (
              <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${ink[200]}` }}>
                <button type="button" onClick={undo} disabled={!canUndo} style={{ flex: 1, height: 32, background: 'none', border: `1px solid ${ink[200]}`, borderRadius: 4, fontSize: 12, color: ink[600], cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.4 }}>Undo</button>
                <button type="button" onClick={redo} disabled={!canRedo} style={{ flex: 1, height: 32, background: 'none', border: `1px solid ${ink[200]}`, borderRadius: 4, fontSize: 12, color: ink[600], cursor: canRedo ? 'pointer' : 'not-allowed', opacity: canRedo ? 1 : 0.4 }}>Redo</button>
                <button
                  type="button"
                  onClick={() => { setAppMode('scenario'); setActiveNodeId(null) }}
                  style={{ height: 32, padding: '0 10px', background: 'none', border: `1px solid ${ink[200]}`, borderRadius: 4, fontSize: 11, color: ink[500], cursor: 'pointer' }}
                >
                  ← Scenarios
                </button>
              </div>
            )}
          </aside>
          )}
        </div>
      </div>

      {/* ── Operator picker ── */}
      {picker && !pendingOperator && (
        <OperatorPicker
          picker={picker}
          onClose={() => setPicker(null)}
          onPick={(operator) => {
            const spec = ALL_OPERATOR_SPECS.find((s) => s.operator === operator)
            if (!spec?.needsLiteral) { handleCreateDerived(picker.sourceId, operator, null, picker.angle); return }
            setPendingOperator({ ...picker, operator })
            setPicker(null)
          }}
        />
      )}
      {pendingOperator && (
        <OperatorLiteralInput
          pending={pendingOperator}
          onCancel={() => setPendingOperator(null)}
          onCommit={(v) => handleCreateDerived(pendingOperator.sourceId, pendingOperator.operator, v, pendingOperator.angle)}
        />
      )}

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(250,250,250,0.7)', pointerEvents: 'none' }}>
          <div style={{ padding: '14px 20px', background: ink[1000], color: ink[0], borderRadius: 8, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner />
            正在解析 Excel…
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="none" stroke={ink[600]} strokeWidth="2" />
      <path d="M 8 2 A 6 6 0 0 1 14 8" fill="none" stroke={ink[0]} strokeWidth="2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}
