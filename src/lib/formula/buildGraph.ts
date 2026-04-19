import type {
  BranchNodeData,
  FlowEdge,
  FlowNode,
  Operator,
  OperatorNodeData,
  ParsedCell,
} from '../../types'
import { tokenize } from './tokenize'
import type { Token } from './tokenize'
import { detectCycles } from './detectCycles'

export type ExprNode =
  | { kind: 'cell'; value: string }
  | { kind: 'number'; value: number; isPercent?: boolean }
  | { kind: 'binop'; op: Operator; left: ExprNode; right: ExprNode; fromSum?: boolean }
  | { kind: 'unknown' }

const MAX_SUM_EXPANSION_TERMS = 200
const DEFAULT_OP: Operator = '+'

export function colLetterToIdx(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

export function colIdxToLetter(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    n -= 1
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}

function normalizeAddress(address: string) {
  return address.replace(/\$/g, '').toUpperCase()
}

function expandRangeRefs(rangeRef: string, availableAddresses: Set<string>): string[] {
  const [startRaw, endRaw] = rangeRef.split(':').map(normalizeAddress)
  const start = startRaw.match(/^([A-Z]+)(\d+)$/)
  const end = endRaw.match(/^([A-Z]+)(\d+)$/)

  if (!start || !end) return []

  const startCol = colLetterToIdx(start[1])
  const endCol = colLetterToIdx(end[1])
  const startRow = parseInt(start[2], 10)
  const endRow = parseInt(end[2], 10)
  const refs: string[] = []

  for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
    for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col += 1) {
      const address = `${colIdxToLetter(col)}${row}`
      if (availableAddresses.has(address)) refs.push(address)
    }
  }

  return refs
}

function splitFunctionArgs(content: string): string[] {
  const args: string[] = []
  let current = ''
  let depth = 0

  for (const ch of content) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1

    if ((ch === ',' || ch === ';') && depth === 0) {
      if (current.trim()) args.push(current.trim())
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim()) args.push(current.trim())
  return args
}

function buildSumExprFromRefs(refs: string[]): ExprNode {
  if (refs.length === 0) return { kind: 'number', value: 0 }
  if (refs.length === 1) return { kind: 'cell', value: refs[0] }

  const limitedRefs = refs.slice(0, MAX_SUM_EXPANSION_TERMS)
  const [first, second, ...rest] = limitedRefs

  let expr: ExprNode = {
    kind: 'binop',
    op: '+',
    left: { kind: 'cell', value: first },
    right: { kind: 'cell', value: second },
    fromSum: true,
  }

  for (const ref of rest) {
    expr = {
      kind: 'binop',
      op: '+',
      left: expr,
      right: { kind: 'cell', value: ref },
      fromSum: true,
    }
  }

  return expr
}

function parseSumFormulaToExpr(formula: string, availableAddresses: Set<string>): ExprNode | null {
  const src = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim()
  const match = src.match(/^SUM\((.*)\)$/i)
  if (!match) return null

  const refs = splitFunctionArgs(match[1]).flatMap((arg) => {
    const normalized = normalizeAddress(arg)
    if (/^(?:\[[^\]]+\])?(?:'[^']+'|[^'!]+)!/.test(arg)) return []
    if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(normalized)) return expandRangeRefs(normalized, availableAddresses)
    if (/^[A-Z]+\d+$/.test(normalized)) return [normalized]
    return []
  })

  return buildSumExprFromRefs(refs)
}

function hasTruncatedSum(formula: string, availableAddresses: Set<string>): boolean {
  const src = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim()
  const match = src.match(/^SUM\((.*)\)$/i)
  if (!match) return false

  const refs = splitFunctionArgs(match[1]).flatMap((arg) => {
    const normalized = normalizeAddress(arg)
    if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(normalized)) return expandRangeRefs(normalized, availableAddresses)
    if (/^[A-Z]+\d+$/.test(normalized)) return [normalized]
    return []
  })

  return refs.length > MAX_SUM_EXPANSION_TERMS
}

export class Parser {
  private readonly tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter((token) => token.type !== 'UNKNOWN' && token.type !== 'EXTERNAL_REF')
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null
  }

  private consume(): Token {
    return this.tokens[this.pos++]
  }

  parse(): ExprNode {
    return this.parseExpr()
  }

  private parseExpr(): ExprNode {
    let left = this.parseTerm()
    while (this.peek()?.type === 'OPERATOR' && '+-'.includes(this.peek()!.value)) {
      const op = this.consume().value as Operator
      const right = this.parseTerm()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseTerm(): ExprNode {
    let left = this.parseUnary()
    while (this.peek()?.type === 'OPERATOR' && '*/'.includes(this.peek()!.value)) {
      const op = this.consume().value as Operator
      const right = this.parseUnary()
      left = { kind: 'binop', op, left, right }
    }
    return left
  }

  private parseUnary(): ExprNode {
    if (this.peek()?.type === 'OPERATOR' && this.peek()?.value === '-') {
      this.consume()
      const factor = this.parseFactor()
      if (factor.kind === 'number') {
        return { kind: 'number', value: -factor.value, isPercent: factor.isPercent }
      }
      return { kind: 'binop', op: '*', left: { kind: 'number', value: -1 }, right: factor }
    }
    return this.parseFactor()
  }

  private parseFactor(): ExprNode {
    const token = this.peek()
    if (!token) return { kind: 'unknown' }

    if (token.type === 'CELL_REF') {
      this.consume()
      return { kind: 'cell', value: token.value }
    }

    if (token.type === 'NUMBER') {
      this.consume()
      const isPercent = token.value.endsWith('%')
      const value = parseFloat(token.value) / (isPercent ? 100 : 1)
      return { kind: 'number', value, isPercent }
    }

    if (token.type === 'LPAREN') {
      this.consume()
      const expr = this.parseExpr()
      if (this.peek()?.type === 'RPAREN') this.consume()
      return expr
    }

    this.consume()
    return { kind: 'unknown' }
  }
}

function collectRefsFromExpression(expr: string, availableAddresses: Set<string>): string[] {
  const refs = tokenize(expr)
    .filter((token): token is Token & { type: 'CELL_REF' } => token.type === 'CELL_REF')
    .map((token) => token.value)
    .filter((ref) => availableAddresses.has(ref))

  return [...new Set(refs)]
}

function splitTopLevelComparator(expr: string): { left: string; operator: string; right: string } | null {
  let depth = 0
  const comparators = ['>=', '<=', '<>', '>', '<', '=']

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i]
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth !== 0) continue

    for (const comparator of comparators) {
      if (expr.slice(i, i + comparator.length) === comparator) {
        return {
          left: expr.slice(0, i).trim(),
          operator: comparator,
          right: expr.slice(i + comparator.length).trim(),
        }
      }
    }
  }

  return null
}

export function evaluateExprNode(node: ExprNode, valueByAddress: Map<string, number>): number | null {
  if (node.kind === 'number') return node.value
  if (node.kind === 'cell') return valueByAddress.get(node.value) ?? null
  if (node.kind !== 'binop') return null

  const left = evaluateExprNode(node.left, valueByAddress)
  const right = evaluateExprNode(node.right, valueByAddress)
  if (left == null || right == null) return null

  switch (node.op) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      return right === 0 ? null : left / right
    default:
      return null
  }
}

function evaluateNumericExpression(
  expr: string,
  availableAddresses: Set<string>,
  valueByAddress: Map<string, number>,
): number | null {
  const sumExpr = parseSumFormulaToExpr(expr, availableAddresses)
  const tokens = sumExpr ? [] : tokenize(expr)
  if (tokens.some((token) => token.type === 'UNKNOWN' || token.type === 'EXTERNAL_REF')) return null
  const tree = sumExpr ?? new Parser(tokens).parse()
  return evaluateExprNode(tree, valueByAddress)
}

function evaluateCondition(
  conditionExpr: string,
  availableAddresses: Set<string>,
  valueByAddress: Map<string, number>,
): 'true' | 'false' | 'unknown' {
  const comparator = splitTopLevelComparator(conditionExpr)
  if (!comparator) return 'unknown'

  const left = evaluateNumericExpression(comparator.left, availableAddresses, valueByAddress)
  const right = evaluateNumericExpression(comparator.right, availableAddresses, valueByAddress)
  if (left == null || right == null) return 'unknown'

  switch (comparator.operator) {
    case '>':
      return left > right ? 'true' : 'false'
    case '<':
      return left < right ? 'true' : 'false'
    case '>=':
      return left >= right ? 'true' : 'false'
    case '<=':
      return left <= right ? 'true' : 'false'
    case '=':
      return left === right ? 'true' : 'false'
    case '<>':
      return left !== right ? 'true' : 'false'
    default:
      return 'unknown'
  }
}

function parseSimpleIfFormula(
  formula: string,
  availableAddresses: Set<string>,
  valueByAddress: Map<string, number>,
): BranchNodeData | null {
  const src = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim()
  const match = src.match(/^IF\((.*)\)$/i)
  if (!match) return null

  const args = splitFunctionArgs(match[1])
  if (args.length < 3) return null

  const [conditionExpr, trueExpr, falseExpr] = args

  return {
    condition: conditionExpr.trim(),
    conditionDeps: collectRefsFromExpression(conditionExpr, availableAddresses),
    activeBranch: evaluateCondition(conditionExpr, availableAddresses, valueByAddress),
    trueLabel: trueExpr.trim(),
    falseLabel: falseExpr.trim(),
    trueDeps: collectRefsFromExpression(trueExpr, availableAddresses),
    falseDeps: collectRefsFromExpression(falseExpr, availableAddresses),
  }
}

let idCounter = 0

function uid(prefix: string) {
  idCounter += 1
  return `${prefix}_${idCounter}`
}

interface LiteralOperand {
  side: 'left' | 'right'
  value: number | string
  isPercent: boolean
}

interface WalkResult {
  extraNodes: FlowNode[]
  extraEdges: FlowEdge[]
  outputId: string | null
  operator: Operator
  literalOperand: Omit<LiteralOperand, 'side'> | null
}

function attachOperand(
  operatorData: OperatorNodeData,
  operatorId: string,
  side: 'left' | 'right',
  result: WalkResult,
): FlowEdge[] {
  if (result.outputId) {
    return [
      {
        id: uid('e'),
        source: result.outputId,
        target: operatorId,
        type: 'animatedEdge',
        data: { operator: operatorData.operator },
      },
    ]
  }

  if (result.literalOperand) {
    operatorData.literalOperands.push({
      side,
      value: result.literalOperand.value,
      isPercent: result.literalOperand.isPercent,
    })
  }

  return []
}

function collectSumTerms(node: ExprNode): string[] {
  if (node.kind === 'cell') return [node.value]
  if (node.kind === 'number') return [String(node.value)]
  if (node.kind === 'binop' && node.fromSum && node.op === '+') {
    return [...collectSumTerms(node.left), ...collectSumTerms(node.right)]
  }
  return []
}

function walkTree(node: ExprNode, resultCellId: string, currentOp: Operator): WalkResult {
  if (node.kind === 'cell') {
    return {
      extraNodes: [],
      extraEdges: [],
      outputId: node.value,
      operator: currentOp,
      literalOperand: null,
    }
  }

  if (node.kind === 'number') {
    return {
      extraNodes: [],
      extraEdges: [],
      outputId: null,
      operator: currentOp,
      literalOperand: { value: node.value, isPercent: !!node.isPercent },
    }
  }

  if (node.kind === 'binop') {
    const left = walkTree(node.left, resultCellId, node.op)
    const right = walkTree(node.right, resultCellId, node.op)
    const operatorId = uid('op')
    const operatorData: OperatorNodeData = {
      operator: node.op,
      literalOperands: [],
      sumTerms: node.fromSum && node.op === '+' ? collectSumTerms(node) : undefined,
    }

    const operatorNode: FlowNode = {
      id: operatorId,
      type: 'operatorNode',
      position: { x: 0, y: 0 },
      data: operatorData,
    }

    return {
      extraNodes: [...left.extraNodes, ...right.extraNodes, operatorNode],
      extraEdges: [
        ...left.extraEdges,
        ...right.extraEdges,
        ...attachOperand(operatorData, operatorId, 'left', left),
        ...attachOperand(operatorData, operatorId, 'right', right),
      ],
      outputId: operatorId,
      operator: node.op,
      literalOperand: null,
    }
  }

  return {
    extraNodes: [],
    extraEdges: [],
    outputId: resultCellId,
    operator: currentOp,
    literalOperand: null,
  }
}

const COMPLEX_FN_RE =
  /\b(IF|IFS|VLOOKUP|HLOOKUP|INDEX|MATCH|CHOOSE|SWITCH|INDIRECT|OFFSET|SUMIF|SUMIFS|COUNTIF|COUNTIFS|AVERAGEIF|AVERAGEIFS|MAX|MIN|LARGE|SMALL|AND|OR|NOT|IFERROR|ISERROR|ISBLANK|ISNUMBER|ISTEXT|COUNTA|COUNT|AVERAGE|ROUND|ROUNDUP|ROUNDDOWN|INT|ABS|MOD|LEFT|RIGHT|MID|LEN|TRIM|SUBSTITUTE|REPLACE|CONCATENATE|CONCAT|TEXTJOIN|TEXT|FIND|SEARCH|DATE|TODAY|NOW|YEAR|MONTH|DAY|EDATE|EOMONTH|NETWORKDAYS|WORKDAY|RANK|PERCENTILE|STDEV|VAR|CORREL|PMT|PV|FV|RATE|NPV|IRR)\b/i

function isComplexFormula(formula: string): boolean {
  return COMPLEX_FN_RE.test(formula)
}

function annotateGraphCycles(nodes: FlowNode[], edges: FlowEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const cycles = detectCycles(edges)
  if (cycles.length === 0) return { nodes, edges }

  const cycleIdByNode = new Map<string, string>()
  cycles.forEach((cycle, index) => {
    const cycleId = `cycle-${index + 1}`
    cycle.forEach((nodeId) => cycleIdByNode.set(nodeId, cycleId))
  })

  return {
    nodes: nodes.map((node) => {
      const cycleId = cycleIdByNode.get(node.id)
      if (!cycleId || node.type !== 'cellNode') return node
      return {
        ...node,
        data: {
          ...node.data,
          isInCycle: true,
        },
      }
    }),
    edges: edges.map((edge) => {
      const sourceCycleId = cycleIdByNode.get(edge.source)
      const targetCycleId = cycleIdByNode.get(edge.target)
      if (!sourceCycleId || sourceCycleId !== targetCycleId) return edge
      return {
        ...edge,
        data: {
          ...edge.data,
          operator: edge.data?.operator ?? '+',
          isInCycle: true,
          cycleId: sourceCycleId,
        },
      }
    }),
  }
}

export function buildFlowGraph(
  cells: ParsedCell[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  idCounter = 0

  const computeCells = cells.filter((cell) => !(typeof cell.value === 'string' && cell.formula == null && !cell.isMarked))
  const availableAddresses = new Set(computeCells.map((cell) => normalizeAddress(cell.address)))
  const numericValueByAddress = new Map(
    computeCells
      .filter((cell) => typeof cell.value === 'number')
      .map((cell) => [normalizeAddress(cell.address), cell.value as number]),
  )

  const externalFormulaAddresses = new Set<string>()
  const cellsWithFormula = computeCells.filter((cell) => cell.formula)

  for (const cell of cellsWithFormula) {
    const formula = cell.formula!
    const sumExpr = parseSumFormulaToExpr(formula, availableAddresses)
    const tokens = sumExpr ? [] : tokenize(formula)
    if (tokens.some((token) => token.type === 'EXTERNAL_REF')) {
      externalFormulaAddresses.add(cell.address)
    }
  }

  const ifFormulaCells = cellsWithFormula.filter(
    (cell) => !externalFormulaAddresses.has(cell.address) && /^=\s*IF\s*\(/i.test(cell.formula ?? ''),
  )
  const graphFormulaCells = cellsWithFormula.filter(
    (cell) =>
      !externalFormulaAddresses.has(cell.address) &&
      !isComplexFormula(cell.formula!) &&
      !/^=\s*IF\s*\(/i.test(cell.formula ?? ''),
  )
  const complexFormulaCells = cellsWithFormula.filter(
    (cell) =>
      !externalFormulaAddresses.has(cell.address) &&
      isComplexFormula(cell.formula!) &&
      !/^=\s*IF\s*\(/i.test(cell.formula ?? '') &&
      cell.deps?.length,
  )

  const cellNodes: FlowNode[] = computeCells.map((cell) => ({
    id: cell.address,
    type: 'cellNode',
    position: { x: 0, y: 0 },
    data: {
      address: cell.address,
      value: cell.value,
      formula: cell.formula,
      machineFormula: cell.formula,
      label: cell.label ?? cell.comment,
      isInput: !cell.formula || externalFormulaAddresses.has(cell.address),
      isOutput: false,
      isMarked: cell.isMarked,
      isPercent: cell.isPercent,
      isTruncatedSum: Boolean(cell.formula && hasTruncatedSum(cell.formula, availableAddresses)),
    },
  }))

  const extraNodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  for (const cell of graphFormulaCells) {
    const formula = cell.formula!
    const sumExpr = parseSumFormulaToExpr(formula, availableAddresses)
    const tokens = sumExpr ? [] : tokenize(formula)

    if (!sumExpr && tokens.some((token) => token.type === 'UNKNOWN' || token.type === 'EXTERNAL_REF')) {
      continue
    }

    const tree = sumExpr ?? new Parser(tokens).parse()
    const result = walkTree(tree, cell.address, DEFAULT_OP)
    extraNodes.push(...result.extraNodes)
    edges.push(...result.extraEdges)

    if (result.outputId && result.outputId !== cell.address) {
      edges.push({
        id: uid('e'),
        source: result.outputId,
        target: cell.address,
        type: 'animatedEdge',
        data: { operator: result.operator },
      })
    }
  }

  for (const cell of ifFormulaCells) {
    const branchData = parseSimpleIfFormula(cell.formula!, availableAddresses, numericValueByAddress)
    if (!branchData) continue

    const branchId = uid('branch')
    extraNodes.push({
      id: branchId,
      type: 'branchNode',
      position: { x: 0, y: 0 },
      data: branchData,
    } as FlowNode)

    const incomingRefs = new Set([...branchData.conditionDeps, ...branchData.trueDeps, ...branchData.falseDeps])
    incomingRefs.forEach((dep) => {
      if (!availableAddresses.has(dep) || dep === cell.address) return
      edges.push({
        id: uid('e'),
        source: dep,
        target: branchId,
        type: 'animatedEdge',
        data: { operator: '+' },
      })
    })

    edges.push({
      id: uid('e'),
      source: branchId,
      target: cell.address,
      type: 'animatedEdge',
      data: { operator: '+' },
    })
  }

  for (const cell of complexFormulaCells) {
    for (const dep of cell.deps ?? []) {
      if (!availableAddresses.has(dep) || dep === cell.address) continue
      edges.push({
        id: uid('e'),
        source: dep,
        target: cell.address,
        type: 'animatedEdge',
        data: { operator: '+' },
      })
    }
  }

  const hasIncoming = new Set(edges.map((edge) => edge.target))
  const hasOutgoing = new Set(edges.map((edge) => edge.source))
  const formulaCellIds = new Set([...graphFormulaCells, ...ifFormulaCells].map((cell) => cell.address))
  const complexCellIds = new Set(complexFormulaCells.map((cell) => cell.address))
  const markedCells = computeCells.filter((cell) => cell.isMarked)

  let markedStartAddress: string | undefined
  let markedEndAddress: string | undefined

  if (markedCells.length === 2) {
    const [first, second] = markedCells
    const firstScore = (formulaCellIds.has(first.address) ? 2 : 0) + (hasIncoming.has(first.address) ? 1 : 0)
    const secondScore = (formulaCellIds.has(second.address) ? 2 : 0) + (hasIncoming.has(second.address) ? 1 : 0)

    if (firstScore < secondScore) {
      markedStartAddress = first.address
      markedEndAddress = second.address
    } else if (secondScore < firstScore) {
      markedStartAddress = second.address
      markedEndAddress = first.address
    } else {
      markedStartAddress = first.address
      markedEndAddress = second.address
    }
  } else {
    markedStartAddress =
      markedCells.find((cell) => !formulaCellIds.has(cell.address) && !hasIncoming.has(cell.address))?.address ??
      markedCells.find((cell) => !formulaCellIds.has(cell.address))?.address ??
      markedCells[0]?.address

    markedEndAddress =
      [...markedCells].reverse().find((cell) => formulaCellIds.has(cell.address) && !hasOutgoing.has(cell.address))?.address ??
      [...markedCells].reverse().find((cell) => formulaCellIds.has(cell.address))?.address ??
      markedCells[markedCells.length - 1]?.address
  }

  const nodes = cellNodes.map((node) => {
    if (node.type !== 'cellNode') return node

    const cell = computeCells.find((item) => item.address === node.id)
    const isMarkedStart = node.id === markedStartAddress
    const isMarkedEnd = node.id === markedEndAddress && markedEndAddress !== markedStartAddress

    let isInput = !cell?.formula || externalFormulaAddresses.has(node.id)
    let isOutput = (formulaCellIds.has(node.id) || complexCellIds.has(node.id)) && !hasOutgoing.has(node.id)

    if (markedCells.length > 0) {
      if (isMarkedStart) {
        isInput = true
        isOutput = false
      }
      if (isMarkedEnd) {
        isOutput = true
        isInput = false
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        isInput,
        isOutput,
        isComplex: complexCellIds.has(node.id),
      },
    }
  })

  return annotateGraphCycles([...nodes, ...extraNodes], edges)
}

export function computeTopoDepth(nodes: FlowNode[], edges: FlowEdge[]): Map<string, number> {
  const depth = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map<string, number>()

  nodes.forEach((node) => {
    outgoing.set(node.id, [])
    incomingCount.set(node.id, 0)
  })

  edges.forEach((edge) => {
    outgoing.get(edge.source)?.push(edge.target)
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
  })

  const queue = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => {
      depth.set(node.id, 0)
      return node.id
    })

  let index = 0
  while (index < queue.length) {
    const current = queue[index]
    index += 1
    const currentDepth = depth.get(current) ?? 0

    for (const next of outgoing.get(current) ?? []) {
      if (!depth.has(next) || (depth.get(next) ?? 0) < currentDepth + 1) {
        depth.set(next, currentDepth + 1)
      }
      queue.push(next)
    }
  }

  return depth
}
