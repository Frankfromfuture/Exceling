import {
  addEdge as addReactFlowEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { create, useStore, type StoreApi } from 'zustand'
import { temporal, type TemporalState } from 'zundo'
import { applyDagreLayout } from '../lib/layout/autoLayout'
import type {
  ConstantNodeData,
  DisplaySettings,
  FlowEdge,
  FlowNode,
  NodeType,
  Operator,
  ParsedCell,
} from '../types'

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  numberDecimals: 0,
  percentMode: true,
  percentDecimals: 2,
  simplifyOperators: true,
}

type FlowMode = 'view' | 'edit'
type FlowHistorySnapshot = {
  mode: FlowMode
  nodes: FlowNode[]
  edges: FlowEdge[]
}

let nodeCounter = 0
let edgeCounter = 0

function nextNodeId(type: NodeType) {
  nodeCounter += 1
  return `${type}_${nodeCounter}`
}

function nextEdgeId() {
  edgeCounter += 1
  return `edge_${edgeCounter}`
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.endsWith('%')
    ? String(parseFloat(trimmed.slice(0, -1)) / 100)
    : trimmed
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPreviewNumber(value: number | null) {
  if (value == null) return null
  return Number.isInteger(value) ? value : Number(value.toFixed(4))
}

function applyOperator(left: number, right: number, operator: Operator): number | null {
  switch (operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return right === 0 ? null : left / right
    case '%':
      return left * (right / 100)
    case 'pow':
      return left ** right
    case 'min':
      return Math.min(left, right)
    case 'max':
      return Math.max(left, right)
    case 'round':
      return Math.round(left)
    default:
      return null
  }
}

function createCellNode(
  id: string,
  position: XYPosition,
  label: string,
  value: number | string | null,
  options?: {
    isInput?: boolean
    isOutput?: boolean
  },
): FlowNode {
  return {
    id,
    type: 'cellNode',
    position,
    data: {
      address: id,
      value,
      formula: null,
      machineFormula: null,
      visualRecipe: null,
      label,
      computedValue: null,
      computedFormula: null,
      isInput: options?.isInput ?? false,
      isOutput: options?.isOutput ?? false,
      isMarked: false,
      isPercent: false,
    },
  }
}

function createDefaultNode(type: NodeType, position: XYPosition): FlowNode {
  const id = nextNodeId(type)

  switch (type) {
    case 'operatorNode':
      return {
        id,
        type,
        position,
        data: {
          operator: '+',
          literalOperands: [],
        },
      }
    case 'branchNode':
      return {
        id,
        type,
        position,
        data: {
          condition: 'value > 0',
          conditionDeps: [],
          activeBranch: 'unknown',
          trueLabel: 'Yes',
          falseLabel: 'No',
          trueDeps: [],
          falseDeps: [],
        },
      }
    case 'constantNode':
      return {
        id,
        type,
        position,
        data: {
          value: 0,
          label: 'Constant',
          isPercent: false,
        } satisfies ConstantNodeData,
      }
    default:
      return createCellNode(id, position, 'Step', 0, { isInput: false, isOutput: false })
  }
}

function buildPreviewExpression(
  nodeId: string,
  nodeMap: Map<string, FlowNode>,
  incomingMap: Map<string, FlowEdge[]>,
  visiting: Set<string>,
): string | null {
  const node = nodeMap.get(nodeId)
  if (!node || visiting.has(nodeId)) return null

  if (node.type === 'constantNode') {
    return String(node.data.label || node.data.value)
  }

  if (node.type === 'cellNode') {
    const incoming = incomingMap.get(nodeId) ?? []
    if (incoming.length === 0) return node.data.label || String(node.data.value ?? '0')
    visiting.add(nodeId)
    const firstEdge = incoming[0]
    const sourceExpr = buildPreviewExpression(firstEdge.source, nodeMap, incomingMap, visiting)
    visiting.delete(nodeId)
    return sourceExpr
  }

  if (node.type === 'operatorNode') {
    const incoming = incomingMap.get(nodeId) ?? []
    visiting.add(nodeId)
    const sources = incoming
      .map((edge) => buildPreviewExpression(edge.source, nodeMap, incomingMap, visiting))
      .filter((item): item is string => Boolean(item))
    visiting.delete(nodeId)

    const literals = node.data.literalOperands.map((operand) => String(operand.value))
    const parts = [...sources, ...literals]
    if (parts.length === 0) return null
    if (node.data.operator === 'round') return `ROUND(${parts[0]})`
    if (parts.length === 1) return parts[0]
    if (node.data.operator === '%') return `(${parts[0]} * (${parts[1]} / 100))`
    if (node.data.operator === 'pow') return `POWER(${parts[0]}, ${parts[1]})`
    if (node.data.operator === 'min') return `MIN(${parts[0]}, ${parts[1]})`
    if (node.data.operator === 'max') return `MAX(${parts[0]}, ${parts[1]})`
    return parts.slice(1).reduce((left, right) => `(${left} ${node.data.operator} ${right})`, parts[0])
  }

  return node.type === 'branchNode' ? node.data.condition : null
}

function computeGraph(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = new Map<string, FlowEdge[]>()

  edges.forEach((edge) => {
    const group = incomingMap.get(edge.target) ?? []
    group.push(edge)
    incomingMap.set(edge.target, group)
  })

  const numericCache = new Map<string, number | null>()

  const resolveNumeric = (nodeId: string, visiting = new Set<string>()): number | null => {
    if (numericCache.has(nodeId)) return numericCache.get(nodeId) ?? null
    if (visiting.has(nodeId)) return null

    const node = nodeMap.get(nodeId)
    if (!node) return null

    visiting.add(nodeId)

    let result: number | null = null

    if (node.type === 'constantNode') {
      result = parseNumericValue(node.data.value)
    }

    if (node.type === 'cellNode') {
      const incoming = incomingMap.get(node.id) ?? []
      if (incoming.length === 0) {
        result = parseNumericValue(node.data.value)
      } else {
        result = resolveNumeric(incoming[0].source, visiting)
      }
    }

    if (node.type === 'operatorNode') {
      const incoming = incomingMap.get(node.id) ?? []
      const resolved = incoming
        .map((edge) => resolveNumeric(edge.source, visiting))
        .filter((value): value is number => value != null)
      const literals = node.data.literalOperands
        .map((operand) => parseNumericValue(operand.value))
        .filter((value): value is number => value != null)
      const operands = [...resolved, ...literals]
      if (operands.length > 0) {
        if (node.data.operator === 'round') {
          result = operands[0] == null ? null : Math.round(operands[0])
        } else {
          result = operands.slice(1).reduce<number | null>((left, right) => {
            if (left == null) return null
            return applyOperator(left, right, node.data.operator)
          }, operands[0] ?? null)
        }
      }
    }

    visiting.delete(nodeId)
    numericCache.set(nodeId, result)
    return result
  }

  return nodes.map((node) => {
    if (node.type !== 'cellNode') return node
    const incoming = incomingMap.get(node.id) ?? []
    if (incoming.length === 0) {
      return {
        ...node,
        data: {
          ...node.data,
          computedValue: node.data.isInput ? null : node.data.computedValue ?? null,
          computedFormula: null,
          formula: node.data.machineFormula ?? node.data.formula,
        },
      }
    }

    const previewFormula = buildPreviewExpression(node.id, nodeMap, incomingMap, new Set())
    return {
      ...node,
      data: {
        ...node.data,
        computedValue: formatPreviewNumber(resolveNumeric(node.id)),
        computedFormula: previewFormula,
        formula: previewFormula,
        machineFormula: node.data.machineFormula ?? previewFormula,
      },
    }
  })
}

function createStarterCanvas() {
  return {
    nodes: [] as FlowNode[],
    edges: [] as FlowEdge[],
  }
}

function historyEqual(a: FlowHistorySnapshot, b: FlowHistorySnapshot) {
  return (
    a.mode === b.mode &&
    JSON.stringify(a.nodes) === JSON.stringify(b.nodes) &&
    JSON.stringify(a.edges) === JSON.stringify(b.edges)
  )
}

export interface FlowStore {
  mode: FlowMode
  fileName: string | null
  error: string | null
  isLoading: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
  parsedCells: ParsedCell[] | null
  displaySettings: DisplaySettings
  setMode: (mode: FlowMode) => void
  setLoading: (value: boolean) => void
  setError: (message: string | null) => void
  setDisplaySettings: (patch: Partial<DisplaySettings>) => void
  setFlowData: (
    fileName: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    parsedCells: ParsedCell[],
  ) => void
  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: FlowEdge[]) => void
  addNode: (type: NodeType, position: XYPosition, data?: Record<string, unknown>) => string
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
  updateOperator: (id: string, operator: Operator) => void
  addEdge: (
    source: string,
    target: string,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => string | null
  removeEdge: (id: string) => void
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  undo: () => void
  redo: () => void
  relayoutFlow: () => void
  resetFlow: () => void
}

type FlowTemporalStore = StoreApi<TemporalState<FlowHistorySnapshot>>

let flowTemporalStore: FlowTemporalStore | null = null

const starterCanvas = createStarterCanvas()

export const useFlowStore = create<FlowStore>()(
  temporal(
    (set, get) => ({
      mode: 'edit',
      fileName: null,
      error: null,
      isLoading: false,
      nodes: starterCanvas.nodes,
      edges: starterCanvas.edges,
      parsedCells: null,
      displaySettings: DEFAULT_DISPLAY_SETTINGS,

      setMode: (mode) => set({ mode }),
      setLoading: (value) => set({ isLoading: value }),
      setError: (message) => set({ error: message, isLoading: false }),
      setDisplaySettings: (patch) =>
        set((state) => ({
          displaySettings: {
            ...state.displaySettings,
            ...patch,
          },
        })),
      setFlowData: (fileName, nodes, edges, parsedCells) => {
        set({
          fileName,
          nodes: computeGraph(nodes, edges),
          edges,
          parsedCells,
          error: null,
          isLoading: false,
          mode: 'edit',
        })
        flowTemporalStore?.getState().clear()
      },
      setNodes: (nodes) => set({ nodes: computeGraph(nodes, get().edges) }),
      setEdges: (edges) => set({ edges, nodes: computeGraph(get().nodes, edges) }),
      addNode: (type, position, data) => {
        const node = createDefaultNode(type, position)
        if (data) {
          node.data = {
            ...node.data,
            ...data,
          } as FlowNode['data']
        }

        const nextNodes = computeGraph([...get().nodes, node], get().edges)
        set({ nodes: nextNodes, error: null })
        return node.id
      },
      removeNode: (id) => {
        const nextNodes = get().nodes.filter((node) => node.id !== id)
        const nextEdges = get().edges.filter((edge) => edge.source !== id && edge.target !== id)
        set({
          nodes: computeGraph(nextNodes, nextEdges),
          edges: nextEdges,
          error: null,
        })
      },
      updateNodeData: (id, data) => {
        const nextNodes = get().nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...data,
                },
              }
            : node,
        ) as FlowNode[]

        set({
          nodes: computeGraph(nextNodes, get().edges),
          error: null,
        })
      },
      updateOperator: (id, operator) => {
        const nextNodes = get().nodes.map((node) =>
          node.id === id && node.type === 'operatorNode'
            ? {
                ...node,
                data: {
                  ...node.data,
                  operator,
                },
              }
            : node,
        ) as FlowNode[]

        const nextEdges = get().edges.map((edge) =>
          edge.source === id || edge.target === id
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  operator,
                },
              }
            : edge,
        )

        set({
          nodes: computeGraph(nextNodes, nextEdges),
          edges: nextEdges,
          error: null,
        })
      },
      addEdge: (source, target, sourceHandle, targetHandle) => {
        if (source === target) return null
        const id = nextEdgeId()
        const nextEdges = addReactFlowEdge(
          {
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
            type: 'animatedEdge',
            data: { operator: '+' },
          },
          get().edges,
        ) as FlowEdge[]

        set({
          edges: nextEdges,
          nodes: computeGraph(get().nodes, nextEdges),
          error: null,
        })

        return id
      },
      removeEdge: (id) => {
        const nextEdges = get().edges.filter((edge) => edge.id !== id)
        set({
          edges: nextEdges,
          nodes: computeGraph(get().nodes, nextEdges),
          error: null,
        })
      },
      onNodesChange: (changes) => {
        const nextNodes = applyNodeChanges(changes, get().nodes) as FlowNode[]
        set({ nodes: computeGraph(nextNodes, get().edges) })
      },
      onEdgesChange: (changes) => {
        const nextEdges = applyEdgeChanges(changes, get().edges) as FlowEdge[]
        set({
          edges: nextEdges,
          nodes: computeGraph(get().nodes, nextEdges),
        })
      },
      onConnect: (connection) => {
        if (!connection.source || !connection.target) return
        get().addEdge(connection.source, connection.target, connection.sourceHandle, connection.targetHandle)
      },
      undo: () => flowTemporalStore?.getState().undo(),
      redo: () => flowTemporalStore?.getState().redo(),
      relayoutFlow: () => {
        const nextNodes = applyDagreLayout(get().nodes, get().edges)
        set({ nodes: computeGraph(nextNodes, get().edges), error: null })
      },
      resetFlow: () => {
        const fresh = createStarterCanvas()
        set({
          mode: 'edit',
          fileName: null,
          error: null,
          isLoading: false,
          nodes: fresh.nodes,
          edges: fresh.edges,
          parsedCells: null,
          displaySettings: DEFAULT_DISPLAY_SETTINGS,
        })
        flowTemporalStore?.getState().clear()
      },
    }),
    {
      limit: 100,
      partialize: (state) => ({
        mode: state.mode,
        nodes: state.nodes,
        edges: state.edges,
      }),
      equality: historyEqual,
    },
  ),
)

flowTemporalStore = useFlowStore.temporal

export function useFlowHistory<T>(selector: (state: TemporalState<FlowHistorySnapshot>) => T) {
  return useStore(useFlowStore.temporal, selector)
}
