import { create } from 'zustand'
import type { FlowNode, FlowEdge, AnimationStatus, AnimationStep, DisplaySettings } from '../types'
import { applyDagreLayout, alignMainPath } from '../lib/layout/autoLayout'

interface MainPathResult {
  mainPathNodeIds: Set<string>
  mainPathEdgeIds: Set<string>
}

/**
 * Collect ALL ancestors of endId (backward BFS) — every node that
 * directly or transitively contributes to the final result is included.
 * The start cell is used only as a visual badge; it does not restrict which
 * nodes are highlighted.
 */
function collectAllAncestors(endId: string, edges: FlowEdge[]): MainPathResult {
  const incomingEdges = new Map<string, FlowEdge[]>()
  edges.forEach(edge => {
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, [])
    incomingEdges.get(edge.target)!.push(edge)
  })

  // Backward BFS: start from end, walk every incoming edge
  const visited = new Set<string>([endId])
  const queue = [endId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of incomingEdges.get(current) ?? []) {
      if (visited.has(edge.source)) continue
      visited.add(edge.source)
      queue.push(edge.source)
    }
  }

  // Every edge whose both endpoints are in the ancestor set belongs to the path
  const mainPathEdgeIds = new Set<string>()
  edges.forEach(edge => {
    if (visited.has(edge.source) && visited.has(edge.target)) {
      mainPathEdgeIds.add(edge.id)
    }
  })

  return { mainPathNodeIds: visited, mainPathEdgeIds }
}

export interface FlowStore {
  // ── File state ──────────────────────────────
  fileName: string | null
  error: string | null
  isLoading: boolean
  startCellInput: string
  endCellInput: string

  // ── Graph data ──────────────────────────────
  nodes: FlowNode[]
  edges: FlowEdge[]
  hasMainPath: boolean
  mainPathNodeIds: Set<string>
  mainPathEdgeIds: Set<string>

  // ── Display settings ────────────────────────
  displaySettings: DisplaySettings

  // ── Animation ───────────────────────────────
  animationStatus: AnimationStatus
  speed: number
  activeNodeIds: Set<string>
  activeEdgeIds: Set<string>
  animationStep: number
  animationSteps: AnimationStep[]
  animationTimer: ReturnType<typeof setTimeout> | null

  // ── Actions ─────────────────────────────────
  setLoading: (v: boolean) => void
  setError: (msg: string | null) => void
  setStartCellInput: (value: string) => void
  setEndCellInput: (value: string) => void
  setFlowData: (fileName: string, nodes: FlowNode[], edges: FlowEdge[]) => void
  resetFlow: () => void
  setDisplaySettings: (patch: Partial<DisplaySettings>) => void

  relayoutFlow: () => void

  playAnimation: () => void
  pauseAnimation: () => void
  resetAnimation: () => void
  setSpeed: (speed: number) => void
  _tick: () => void
}

function buildAnimationSteps(nodes: FlowNode[], edges: FlowEdge[]): AnimationStep[] {
  const inDegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const edgesByTarget = new Map<string, string[]>()

  nodes.forEach(n => { inDegree.set(n.id, 0); outgoing.set(n.id, []) })

  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    outgoing.get(e.source)?.push(e.target)
    if (!edgesByTarget.has(e.target)) edgesByTarget.set(e.target, [])
    edgesByTarget.get(e.target)!.push(e.id)
  })

  const steps: AnimationStep[] = []
  let queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)

  while (queue.length > 0) {
    const edgeIds: string[] = []
    queue.forEach(id => {
      edgesByTarget.get(id)?.forEach(eid => edgeIds.push(eid))
    })
    steps.push({ nodeIds: [...queue], edgeIds })

    const next: string[] = []
    queue.forEach(id => {
      outgoing.get(id)?.forEach(neighbor => {
        const deg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, deg)
        if (deg === 0) next.push(neighbor)
      })
    })
    queue = next
  }

  return steps
}

function findMainPath(
  nodes: FlowNode[],
  edges: FlowEdge[],
  startCellInput?: string,
  endCellInput?: string,
): MainPathResult {
  const normalizedEnd = endCellInput?.trim().toUpperCase()
  const cellNodes = nodes.filter(
    (node): node is Extract<FlowNode, { type: 'cellNode' }> => node.type === 'cellNode',
  )

  if (cellNodes.length === 0) return { mainPathNodeIds: new Set(), mainPathEdgeIds: new Set() }

  // Resolve end node: explicit input → marked output cell → any output cell
  const endNode =
    (normalizedEnd ? cellNodes.find(n => n.id.toUpperCase() === normalizedEnd) : undefined) ??
    cellNodes.find(n => n.data.isMarked && n.data.isOutput) ??
    cellNodes.find(n => n.data.isOutput)

  if (!endNode) return { mainPathNodeIds: new Set(), mainPathEdgeIds: new Set() }

  // Main path = every node that feeds into the end result (full ancestor tree)
  return collectAllAncestors(endNode.id, edges)
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  fileName: null,
  error: null,
  isLoading: false,
  startCellInput: '',
  endCellInput: '',
  nodes: [],
  edges: [],
  hasMainPath: false,
  mainPathNodeIds: new Set(),
  mainPathEdgeIds: new Set(),
  displaySettings: { numberDecimals: 0, percentMode: true, percentDecimals: 2 },
  animationStatus: 'idle',
  speed: 1,
  activeNodeIds: new Set(),
  activeEdgeIds: new Set(),
  animationStep: 0,
  animationSteps: [],
  animationTimer: null,

  setLoading: (v) => set({ isLoading: v }),
  setError: (msg) => set({ error: msg, isLoading: false }),
  setStartCellInput: (value) => set({ startCellInput: value }),
  setEndCellInput: (value) => set({ endCellInput: value }),
  setDisplaySettings: (patch) =>
    set(s => ({ displaySettings: { ...s.displaySettings, ...patch } })),

  setFlowData: (fileName, nodes, edges) => {
    const { startCellInput, endCellInput } = get()
    const { mainPathNodeIds, mainPathEdgeIds } = findMainPath(nodes, edges, startCellInput, endCellInput)
    const hasMainPath = mainPathNodeIds.size > 0 && mainPathEdgeIds.size > 0

    // Shift main-path nodes to the canvas vertical centre so the
    // primary calculation chain runs in a straight horizontal band.
    const alignedNodes = hasMainPath ? alignMainPath(nodes, mainPathNodeIds) : nodes

    const animationNodes = hasMainPath
      ? alignedNodes.filter(node => mainPathNodeIds.has(node.id))
      : alignedNodes
    const animationEdges = hasMainPath
      ? edges.filter(edge => mainPathEdgeIds.has(edge.id))
      : edges
    const animationSteps = buildAnimationSteps(animationNodes, animationEdges)

    set({
      fileName,
      nodes: alignedNodes,
      edges,
      hasMainPath,
      mainPathNodeIds,
      mainPathEdgeIds,
      animationSteps,
      animationStatus: 'idle',
      activeNodeIds: new Set(),
      activeEdgeIds: new Set(),
      animationStep: 0,
      error: null,
      isLoading: false,
    })
  },

  resetFlow: () =>
    set({
      fileName: null,
      error: null,
      nodes: [],
      edges: [],
      startCellInput: '',
      endCellInput: '',
      hasMainPath: false,
      mainPathNodeIds: new Set(),
      mainPathEdgeIds: new Set(),
      animationSteps: [],
      animationStatus: 'idle',
      activeNodeIds: new Set(),
      activeEdgeIds: new Set(),
      animationStep: 0,
    }),

  relayoutFlow: () => {
    const { nodes, edges, mainPathNodeIds, hasMainPath } = get()
    if (nodes.length === 0) return
    const laid = applyDagreLayout(nodes, edges)
    const aligned = hasMainPath ? alignMainPath(laid, mainPathNodeIds) : laid
    set({ nodes: aligned })
  },

  playAnimation: () => {
    const { animationStatus, animationSteps, speed, _tick } = get()
    if (animationSteps.length === 0) return
    if (animationStatus === 'done') {
      set({ activeNodeIds: new Set(), activeEdgeIds: new Set(), animationStep: 0 })
    }
    set({ animationStatus: 'playing' })
    const delay = 900 / speed
    const timer = setTimeout(_tick, delay)
    set({ animationTimer: timer })
  },

  pauseAnimation: () => {
    const { animationTimer } = get()
    if (animationTimer) clearTimeout(animationTimer)
    set({ animationStatus: 'paused', animationTimer: null })
  },

  resetAnimation: () => {
    const { animationTimer } = get()
    if (animationTimer) clearTimeout(animationTimer)
    set({
      animationStatus: 'idle',
      activeNodeIds: new Set(),
      activeEdgeIds: new Set(),
      animationStep: 0,
      animationTimer: null,
    })
  },

  setSpeed: (speed) => set({ speed }),

  _tick: () => {
    const { animationStep, animationSteps, speed, activeNodeIds, activeEdgeIds } = get()
    if (animationStep >= animationSteps.length) {
      set({ animationStatus: 'done', animationTimer: null })
      return
    }
    const step = animationSteps[animationStep]
    const newNodes = new Set([...activeNodeIds, ...step.nodeIds])
    const newEdges = new Set([...activeEdgeIds, ...step.edgeIds])
    set({ activeNodeIds: newNodes, activeEdgeIds: newEdges, animationStep: animationStep + 1 })

    if (animationStep + 1 < animationSteps.length) {
      const delay = 900 / speed
      const timer = setTimeout(get()._tick, delay)
      set({ animationTimer: timer })
    } else {
      set({ animationStatus: 'done', animationTimer: null })
    }
  },
}))
