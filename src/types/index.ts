import type { Edge, Node } from '@xyflow/react'

export type Operator = '+' | '-' | '*' | '/' | '%' | 'pow' | 'min' | 'max' | 'round'

export const OPERATOR_ACCENTS: Record<Operator, 'sage' | 'mauve' | 'slate' | 'sand'> = {
  '+': 'sage',
  '-': 'mauve',
  '*': 'slate',
  '/': 'sand',
  '%': 'sand',
  pow: 'slate',
  min: 'slate',
  max: 'slate',
  round: 'slate',
}

export const OPERATOR_LABELS: Record<Operator, string> = {
  '+': '+',
  '-': '-',
  '*': '脳',
  '/': '梅',
  '%': '%',
  pow: 'x^n',
  min: 'MIN',
  max: 'MAX',
  round: '≈',
}

export interface FrameRegion {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

export interface ParsedCell {
  address: string
  col: number
  row: number
  value: number | string | null
  rawValue: string | null
  formula: string | null
  label: string | null
  comment: string | null
  isMarked: boolean
  isPercent: boolean
  deps?: string[]
}

export interface WhatIfDelta {
  abs: number
  pct: number | null
}

export interface WhatIfScenario {
  overrides: Record<string, number>
  recomputed: Record<string, number | string | null>
  delta: Record<string, WhatIfDelta>
  unsupportedCells: string[]
}

export interface DisplaySettings {
  numberDecimals: number
  percentMode: boolean
  percentDecimals: number
  simplifyOperators: boolean
}

export interface CellNodeData extends Record<string, unknown> {
  address: string
  value: number | string | null
  formula: string | null
  machineFormula?: string | null
  visualRecipe?: {
    sourceId: string
    operator: Operator
    literal?: number | null
  } | null
  label: string | null
  computedValue?: number | string | null
  computedFormula?: string | null
  isInput: boolean
  isOutput: boolean
  isMarked: boolean
  isPercent: boolean
  isComplex?: boolean
  isInCycle?: boolean
  isTruncatedSum?: boolean
}

export interface OperatorNodeData extends Record<string, unknown> {
  operator: Operator
  literalOperands: Array<{
    side: 'left' | 'right'
    value: number | string
    isPercent: boolean
  }>
  sumTerms?: string[]
}

export interface BranchNodeData extends Record<string, unknown> {
  condition: string
  conditionDeps: string[]
  activeBranch: 'true' | 'false' | 'unknown'
  trueLabel: string
  falseLabel: string
  trueDeps: string[]
  falseDeps: string[]
}

export interface ConstantNodeData extends Record<string, unknown> {
  value: number
  label?: string | null
  isPercent?: boolean
}

export type NodeType = 'cellNode' | 'operatorNode' | 'branchNode' | 'constantNode'

export type CellFlowNode = Node<CellNodeData, 'cellNode'>
export type OperatorFlowNode = Node<OperatorNodeData, 'operatorNode'>
export type BranchFlowNode = Node<BranchNodeData, 'branchNode'>
export type ConstantFlowNode = Node<ConstantNodeData, 'constantNode'>

export type FlowNode =
  | CellFlowNode
  | OperatorFlowNode
  | BranchFlowNode
  | ConstantFlowNode

export interface FlowEdgeData extends Record<string, unknown> {
  operator: Operator
  operand?: number | null
  isMainPath?: boolean
  isInCycle?: boolean
  cycleId?: string
}

export type FlowEdge = Edge<FlowEdgeData>
